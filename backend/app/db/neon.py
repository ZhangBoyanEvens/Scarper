"""
Neon Postgres 分层存储：

- 用户目录 schema（u_<user>）：projects 登记表
- 每个 Project 独立数据 schema（u_<user>_p_<id>）：业务数据表
  - scrape_upload_batches：来自 Scrape 的上传批次（可扩展更多表）
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from psycopg import sql

from app.config import settings
from app.db.errors import (
    NeonConnectionError,
    NeonNotConfiguredError,
    NeonStorageQuotaError,
)
from app.db.storage_quota import (
    estimate_json_payload_bytes,
    estimate_utf8_bytes,
    neon_user_quota_bytes,
)
from app.db.user_schema import project_pg_schema, user_pg_schema

logger = logging.getLogger(__name__)

_STORAGE_CACHE_TTL_SEC = 90.0

_CATALOG_PROJECTS = "projects"
_FINDOC_TEMPLATES = "findoc_templates"
_SCRAPE_UPLOADS = "scrape_upload_batches"


@dataclass(frozen=True)
class ProjectRecord:
    id: str
    name: str
    description: str
    created_at: str
    updated_at: str
    data_schema: str


@dataclass(frozen=True)
class FindocTemplateRecord:
    id: str
    name: str
    content: str
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class ProjectUploadRecord:
    id: str
    project_id: str
    user_id: str
    uploaded_at: str
    body_only: bool
    result_count: int
    success_count: int
    source: str
    editor_text: str | None = None


class NeonRepository:
    """用户目录 + 每 Project 独立 schema。"""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url.strip()
        self._catalog_ready: set[str] = set()
        self._project_db_ready: set[str] = set()
        self._ping_at: float = 0.0
        self._ping_ok: bool = False
        self._conn = None
        self._conn_lock = threading.Lock()
        self._pool = None
        self._pool_failed = False
        self._storage_cache: dict[str, tuple[float, int]] = {}
        self._storage_cache_lock = threading.Lock()

    @classmethod
    def from_settings(cls) -> NeonRepository | None:
        if not settings.neon_enabled:
            return None
        url = (settings.neon_database_url or "").strip()
        if not url:
            return None
        return cls(url)

    def ping(self) -> bool:
        try:
            with self._session() as conn:
                conn.execute("SELECT 1")
            return True
        except Exception as e:
            logger.warning("neon ping failed: %s", e)
            return False

    def _get_pool(self):
        if self._pool_failed:
            return None
        if self._pool is not None:
            return self._pool
        with self._conn_lock:
            if self._pool is not None:
                return self._pool
            try:
                from psycopg_pool import ConnectionPool

                self._pool = ConnectionPool(
                    self._database_url,
                    min_size=1,
                    max_size=8,
                    open=True,
                    kwargs={"autocommit": False},
                )
                logger.info("neon connection pool ready (max=8)")
            except Exception as e:
                self._pool_failed = True
                logger.warning("neon pool unavailable, using single conn: %s", e)
        return self._pool

    def _get_conn(self):
        try:
            import psycopg
        except ImportError as e:
            raise NeonNotConfiguredError(
                "未安装 psycopg，请执行: pip install 'psycopg[binary]>=3.2'"
            ) from e
        if not self._database_url:
            raise NeonNotConfiguredError("NEON_DATABASE_URL 未配置")
        with self._conn_lock:
            if self._conn is None or self._conn.closed:
                self._conn = psycopg.connect(self._database_url)
            return self._conn

    @contextmanager
    def _session(self):
        pool = self._get_pool()
        if pool is not None:
            with pool.connection() as conn:
                try:
                    yield conn
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise
            return

        conn = self._get_conn()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    def invalidate_storage_cache(self, user_id: str | None = None) -> None:
        with self._storage_cache_lock:
            if user_id:
                self._storage_cache.pop(user_id, None)
            else:
                self._storage_cache.clear()

    def _resolve_project_data_schema(
        self, conn, user_id: str, project_id: str
    ) -> str:
        """读取目录中的 data_schema，避免每次 list 都跑完整 ensure_project_database。"""
        schema_name = project_pg_schema(user_id, project_id)
        if schema_name in self._project_db_ready:
            return schema_name

        catalog_schema = user_pg_schema(user_id)
        if catalog_schema not in self._catalog_ready:
            self._bootstrap_user_catalog(conn, user_id)
            self._catalog_ready.add(catalog_schema)

        catalog_id = sql.Identifier(catalog_schema)
        projects_id = sql.Identifier(_CATALOG_PROJECTS)
        lookup = sql.SQL("SELECT data_schema FROM {}.{} WHERE id = %s").format(
            catalog_id, projects_id
        )
        with conn.cursor() as cur:
            cur.execute(lookup, (project_id,))
            row = cur.fetchone()
        if not row:
            raise NeonConnectionError(f"项目 {project_id} 未登记")

        ds = (str(row[0] or "").strip() or schema_name)[:63]
        if ds not in self._project_db_ready:
            self._ensure_project_tables(conn, ds)
            self._project_db_ready.add(ds)
        return ds

    def ping_cached(self, ttl_sec: float = 60.0) -> bool:
        now = time.monotonic()
        if now - self._ping_at < ttl_sec:
            return self._ping_ok
        self._ping_ok = self.ping()
        self._ping_at = now
        return self._ping_ok

    def _bootstrap_user_catalog(self, conn, user_id: str) -> str:
        """在同一连接上建用户目录（仅首次或进程内未标记就绪时）。"""
        schema_name = user_pg_schema(user_id)
        schema_id = sql.Identifier(schema_name)
        projects_id = sql.Identifier(_CATALOG_PROJECTS)
        templates_id = sql.Identifier(_FINDOC_TEMPLATES)

        statements = [
            sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(schema_id),
            sql.SQL(
                """
                CREATE TABLE IF NOT EXISTS {}.{} (
                    id UUID PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    data_schema TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                )
                """
            ).format(schema_id, projects_id),
            sql.SQL(
                """
                CREATE TABLE IF NOT EXISTS {}.{} (
                    id UUID PRIMARY KEY,
                    name TEXT NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                )
                """
            ).format(schema_id, templates_id),
            sql.SQL(
                "CREATE INDEX IF NOT EXISTS {} ON {}.{} (updated_at DESC)"
            ).format(
                sql.Identifier(f"idx_{schema_name}_catalog_updated"),
                schema_id,
                projects_id,
            ),
            sql.SQL(
                "CREATE INDEX IF NOT EXISTS {} ON {}.{} (updated_at DESC)"
            ).format(
                sql.Identifier(f"idx_{schema_name}_findoc_tpl_updated"),
                schema_id,
                templates_id,
            ),
        ]

        alter_col = sql.SQL(
            "ALTER TABLE {}.{} ADD COLUMN IF NOT EXISTS data_schema TEXT"
        ).format(schema_id, projects_id)

        for stmt in statements:
            conn.execute(stmt)
        conn.execute(alter_col)
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    """
                    SELECT id FROM {}.{}
                    WHERE data_schema IS NULL OR data_schema = ''
                    """
                ).format(schema_id, projects_id),
            )
            pending = cur.fetchall()
        for (pid,) in pending:
            ds = project_pg_schema(user_id, str(pid))
            conn.execute(
                sql.SQL("UPDATE {}.{} SET data_schema = %s WHERE id = %s").format(
                    schema_id, projects_id
                ),
                (ds, pid),
            )
            self._ensure_project_tables(conn, ds)
        return schema_name

    def ensure_user_catalog(self, user_id: str) -> str:
        """用户级 schema：仅 projects 目录表。"""
        schema_name = user_pg_schema(user_id)
        if schema_name in self._catalog_ready:
            return schema_name

        try:
            with self._session() as conn:
                self._bootstrap_user_catalog(conn, user_id)
        except Exception as e:
            raise NeonConnectionError(f"用户目录建表失败: {e}") from e

        self._catalog_ready.add(schema_name)
        return schema_name

    def _catalog_schema(self, user_id: str) -> str:
        schema_name = user_pg_schema(user_id)
        if schema_name not in self._catalog_ready:
            return self.ensure_user_catalog(user_id)
        return schema_name

    @staticmethod
    def _ensure_project_tables(conn, schema_name: str) -> None:
        schema_id = sql.Identifier(schema_name)
        uploads_id = sql.Identifier(_SCRAPE_UPLOADS)
        conn.execute(
            sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(schema_id)
        )
        conn.execute(
            sql.SQL(
                """
                CREATE TABLE IF NOT EXISTS {}.{} (
                    id UUID PRIMARY KEY,
                    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    body_only BOOLEAN NOT NULL DEFAULT FALSE,
                    source TEXT NOT NULL DEFAULT 'scrape',
                    results JSONB NOT NULL,
                    editor_text TEXT,
                    editor_updated_at TIMESTAMPTZ
                )
                """
            ).format(schema_id, uploads_id)
        )
        conn.execute(
            sql.SQL(
                "ALTER TABLE {}.{} ADD COLUMN IF NOT EXISTS editor_text TEXT"
            ).format(schema_id, uploads_id)
        )
        conn.execute(
            sql.SQL(
                "ALTER TABLE {}.{} ADD COLUMN IF NOT EXISTS editor_updated_at TIMESTAMPTZ"
            ).format(schema_id, uploads_id)
        )
        conn.execute(
            sql.SQL(
                "ALTER TABLE {}.{} ADD COLUMN IF NOT EXISTS result_count INT"
            ).format(schema_id, uploads_id)
        )
        conn.execute(
            sql.SQL(
                "ALTER TABLE {}.{} ADD COLUMN IF NOT EXISTS success_count INT"
            ).format(schema_id, uploads_id)
        )
        conn.execute(
            sql.SQL(
                "CREATE INDEX IF NOT EXISTS {} ON {}.{} (uploaded_at DESC)"
            ).format(
                sql.Identifier(f"idx_{schema_name}_scrape_time"),
                schema_id,
                uploads_id,
            )
        )

    def ensure_project_database(self, user_id: str, project_id: str) -> str:
        """为单个 Project 创建独立 schema 及初始数据表。"""
        if not self.project_exists(user_id, project_id):
            raise NeonConnectionError(
                f"项目 {project_id} 未登记，请先在 Project 页创建"
            )

        schema_name = project_pg_schema(user_id, project_id)

        try:
            with self._session() as conn:
                self._ensure_project_tables(conn, schema_name)
        except Exception as e:
            raise NeonConnectionError(f"项目库建表失败: {e}") from e

        self._project_db_ready.add(schema_name)
        logger.info("neon project database ready: %s", schema_name)
        return schema_name

    def list_projects(self, user_id: str) -> list[ProjectRecord]:
        schema_name = user_pg_schema(user_id)
        schema_id = sql.Identifier(schema_name)
        table_id = sql.Identifier(_CATALOG_PROJECTS)
        query = sql.SQL(
            """
            SELECT id, name, description, data_schema, created_at, updated_at
            FROM {}.{}
            ORDER BY updated_at DESC
            """
        ).format(schema_id, table_id)

        try:
            with self._session() as conn:
                if schema_name not in self._catalog_ready:
                    self._bootstrap_user_catalog(conn, user_id)
                    self._catalog_ready.add(schema_name)
                with conn.cursor() as cur:
                    cur.execute(query)
                    rows = cur.fetchall()
        except Exception as e:
            raise NeonConnectionError(f"Neon 项目列表查询失败: {e}") from e

        return [self._row_to_project(row) for row in rows]

    def create_project(
        self,
        user_id: str,
        *,
        name: str,
        description: str = "",
        project_id: str | None = None,
    ) -> ProjectRecord:
        catalog = self.ensure_user_catalog(user_id)
        pid = project_id or str(uuid.uuid4())
        data_schema = project_pg_schema(user_id, pid)
        now = datetime.now(timezone.utc)

        schema_id = sql.Identifier(catalog)
        table_id = sql.Identifier(_CATALOG_PROJECTS)
        insert_sql = sql.SQL(
            """
            INSERT INTO {}.{} (
                id, name, description, data_schema, created_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s)
            """
        ).format(schema_id, table_id)

        try:
            with self._session() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        insert_sql,
                        (
                            pid,
                            name.strip(),
                            description.strip(),
                            data_schema,
                            now,
                            now,
                        ),
                    )
            self.ensure_project_database(user_id, pid)
        except NeonConnectionError:
            raise
        except Exception as e:
            raise NeonConnectionError(f"Neon 项目创建失败: {e}") from e

        return ProjectRecord(
            id=pid,
            name=name.strip(),
            description=description.strip(),
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
            data_schema=data_schema,
        )

    def delete_project(self, user_id: str, project_id: str) -> bool:
        if not self.project_exists(user_id, project_id):
            return False

        catalog = user_pg_schema(user_id)
        data_schema = project_pg_schema(user_id, project_id)
        catalog_id = sql.Identifier(catalog)
        projects_id = sql.Identifier(_CATALOG_PROJECTS)
        drop_schema = sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
            sql.Identifier(data_schema)
        )
        delete_row = sql.SQL("DELETE FROM {}.{} WHERE id = %s").format(
            catalog_id, projects_id
        )

        try:
            with self._session() as conn:
                with conn.cursor() as cur:
                    cur.execute(drop_schema)
                    cur.execute(delete_row, (project_id,))
                    deleted = cur.rowcount > 0
            logger.info("neon project database dropped: %s", data_schema)
            return deleted
        except Exception as e:
            raise NeonConnectionError(f"Neon 项目删除失败: {e}") from e

    def touch_project(self, user_id: str, project_id: str) -> None:
        catalog = self.ensure_user_catalog(user_id)
        now = datetime.now(timezone.utc)
        schema_id = sql.Identifier(catalog)
        table_id = sql.Identifier(_CATALOG_PROJECTS)
        update_sql = sql.SQL(
            "UPDATE {}.{} SET updated_at = %s WHERE id = %s"
        ).format(schema_id, table_id)

        try:
            with self._session() as conn:
                with conn.cursor() as cur:
                    cur.execute(update_sql, (now, project_id))
        except Exception as e:
            raise NeonConnectionError(f"Neon 项目更新失败: {e}") from e

    def project_exists(self, user_id: str, project_id: str) -> bool:
        schema_name = self._catalog_schema(user_id)
        schema_id = sql.Identifier(schema_name)
        table_id = sql.Identifier(_CATALOG_PROJECTS)
        query = sql.SQL("SELECT 1 FROM {}.{} WHERE id = %s LIMIT 1").format(
            schema_id, table_id
        )
        try:
            with self._session() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, (project_id,))
                    return cur.fetchone() is not None
        except Exception as e:
            raise NeonConnectionError(f"Neon 项目查询失败: {e}") from e

    @staticmethod
    def _row_to_project(row: tuple) -> ProjectRecord:
        created = row[4]
        updated = row[5]
        return ProjectRecord(
            id=str(row[0]),
            name=str(row[1]),
            description=str(row[2] or ""),
            data_schema=str(row[3]),
            created_at=(
                created.isoformat()
                if hasattr(created, "isoformat")
                else str(created)
            ),
            updated_at=(
                updated.isoformat()
                if hasattr(updated, "isoformat")
                else str(updated)
            ),
        )

    def _sum_schema_upload_bytes(self, conn, schema_name: str) -> int:
        schema_id = sql.Identifier(schema_name)
        table_id = sql.Identifier(_SCRAPE_UPLOADS)
        query = sql.SQL(
            """
            SELECT COALESCE(SUM(
                pg_column_size(results)
                + COALESCE(pg_column_size(editor_text), 0)
            ), 0)::bigint
            FROM {}.{}
            """
        ).format(schema_id, table_id)
        try:
            with conn.cursor() as cur:
                cur.execute(query)
                row = cur.fetchone()
            return int(row[0] or 0) if row else 0
        except Exception:
            return 0

    def _sum_catalog_findoc_template_bytes(self, conn, schema_name: str) -> int:
        schema_id = sql.Identifier(schema_name)
        table_id = sql.Identifier(_FINDOC_TEMPLATES)
        query = sql.SQL(
            """
            SELECT COALESCE(SUM(
                pg_column_size(name) + pg_column_size(content)
            ), 0)::bigint
            FROM {}.{}
            """
        ).format(schema_id, table_id)
        try:
            with conn.cursor() as cur:
                cur.execute(query)
                row = cur.fetchone()
            return int(row[0] or 0) if row else 0
        except Exception:
            return 0

    def _sum_all_upload_bytes(
        self, conn, user_id: str, projects: list[ProjectRecord]
    ) -> int:
        """单次连接内批量统计各项目 schema 上传占用。"""
        if not projects:
            return 0
        parts: list[sql.Composable] = []
        for project in projects:
            schema = (project.data_schema or "").strip()
            if not schema:
                schema = project_pg_schema(user_id, project.id)
            parts.append(
                sql.SQL(
                    """
                    SELECT COALESCE(SUM(
                        pg_column_size(results)
                        + COALESCE(pg_column_size(editor_text), 0)
                    ), 0)::bigint AS sz
                    FROM {}.{}
                    """
                ).format(sql.Identifier(schema), sql.Identifier(_SCRAPE_UPLOADS))
            )
        if len(parts) == 1:
            query = parts[0]
        else:
            query = sql.SQL("SELECT COALESCE(SUM(sz), 0)::bigint FROM ({}) t").format(
                sql.SQL(" UNION ALL ").join(
                    sql.SQL("({})").format(part) for part in parts
                )
            )
        try:
            with conn.cursor() as cur:
                cur.execute(query)
                row = cur.fetchone()
            return int(row[0] or 0) if row else 0
        except Exception:
            total = 0
            for project in projects:
                schema = (project.data_schema or "").strip()
                if not schema:
                    schema = project_pg_schema(user_id, project.id)
                total += self._sum_schema_upload_bytes(conn, schema)
            return total

    def get_user_storage_bytes(
        self, user_id: str, *, force_refresh: bool = False
    ) -> int:
        """统计用户所有项目库中上传数据及 FinDoc 模板占用（字节）。"""
        if not user_id:
            raise ValueError("user_id 必填")

        if not force_refresh:
            with self._storage_cache_lock:
                cached = self._storage_cache.get(user_id)
                if cached and time.monotonic() - cached[0] < _STORAGE_CACHE_TTL_SEC:
                    return cached[1]

        projects = self.list_projects(user_id)
        catalog = user_pg_schema(user_id)
        total = 0
        try:
            with self._session() as conn:
                total += self._sum_catalog_findoc_template_bytes(conn, catalog)
                total += self._sum_all_upload_bytes(conn, user_id, projects)
        except NeonConnectionError:
            raise
        except Exception as e:
            raise NeonConnectionError(f"Neon 存储统计失败: {e}") from e

        with self._storage_cache_lock:
            self._storage_cache[user_id] = (time.monotonic(), total)
        return total

    def assert_user_storage_quota(
        self, user_id: str, additional_bytes: int
    ) -> None:
        quota = neon_user_quota_bytes()
        used = self.get_user_storage_bytes(user_id)
        need = max(0, int(additional_bytes))
        if used + need > quota:
            raise NeonStorageQuotaError(
                used_bytes=used,
                quota_bytes=quota,
                requested_bytes=need,
            )

    def _editor_text_bytes(self, conn, schema_name: str, upload_id: str) -> int:
        schema_id = sql.Identifier(schema_name)
        table_id = sql.Identifier(_SCRAPE_UPLOADS)
        query = sql.SQL(
            """
            SELECT COALESCE(pg_column_size(editor_text), 0)::bigint
            FROM {}.{}
            WHERE id = %s
            """
        ).format(schema_id, table_id)
        with conn.cursor() as cur:
            cur.execute(query, (upload_id,))
            row = cur.fetchone()
        return int(row[0] or 0) if row else 0

    def upload_project_results(
        self,
        *,
        user_id: str,
        project_id: str,
        results: list[dict[str, Any]],
        body_only: bool = False,
    ) -> ProjectUploadRecord:
        if not user_id:
            raise ValueError("user_id 必填")

        incoming = estimate_json_payload_bytes(results) + 48
        self.assert_user_storage_quota(user_id, incoming)

        db_schema = self.ensure_project_database(user_id, project_id)
        entry_id = str(uuid.uuid4())
        uploaded_at = datetime.now(timezone.utc)
        payload = json.dumps(results, ensure_ascii=False)

        schema_id = sql.Identifier(db_schema)
        table_id = sql.Identifier(_SCRAPE_UPLOADS)
        success = sum(1 for r in results if r.get("status") == "success")
        insert_sql = sql.SQL(
            """
            INSERT INTO {}.{} (
                id, uploaded_at, body_only, source, results,
                result_count, success_count
            )
            VALUES (%s, %s, %s, 'scrape', %s::jsonb, %s, %s)
            """
        ).format(schema_id, table_id)

        try:
            with self._session() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        insert_sql,
                        (
                            entry_id,
                            uploaded_at,
                            body_only,
                            payload,
                            len(results),
                            success,
                        ),
                    )
        except NeonNotConfiguredError:
            raise
        except Exception as e:
            raise NeonConnectionError(f"Neon 写入失败: {e}") from e

        self.invalidate_storage_cache(user_id)
        success = sum(1 for r in results if r.get("status") == "success")
        return ProjectUploadRecord(
            id=entry_id,
            project_id=project_id,
            user_id=user_id,
            uploaded_at=uploaded_at.isoformat(),
            body_only=body_only,
            result_count=len(results),
            success_count=success,
            source="scrape",
        )

    def upload_findoc_document(
        self,
        *,
        user_id: str,
        project_id: str,
        editor_text: str,
        title: str = "",
    ) -> ProjectUploadRecord:
        if not user_id:
            raise ValueError("user_id 必填")

        text = (editor_text or "").strip()
        if not text:
            raise ValueError("文档内容不能为空")

        doc_title = (title or "").strip() or "FinDoc 文档"
        results = [
            {
                "status": "success",
                "url": "findoc://output",
                "title": doc_title,
                "summary": "",
                "content": "",
                "key_points": [],
            }
        ]

        incoming = estimate_utf8_bytes(text) + estimate_json_payload_bytes(results) + 64
        self.assert_user_storage_quota(user_id, incoming)

        db_schema = self.ensure_project_database(user_id, project_id)
        entry_id = str(uuid.uuid4())
        uploaded_at = datetime.now(timezone.utc)
        payload = json.dumps(results, ensure_ascii=False)

        schema_id = sql.Identifier(db_schema)
        table_id = sql.Identifier(_SCRAPE_UPLOADS)
        insert_sql = sql.SQL(
            """
            INSERT INTO {}.{} (
                id, uploaded_at, body_only, source, results, editor_text,
                editor_updated_at, result_count, success_count
            )
            VALUES (%s, %s, TRUE, 'findoc', %s::jsonb, %s, %s, %s, %s)
            """
        ).format(schema_id, table_id)

        try:
            with self._session() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        insert_sql,
                        (
                            entry_id,
                            uploaded_at,
                            payload,
                            text,
                            uploaded_at,
                            len(results),
                            1,
                        ),
                    )
        except NeonStorageQuotaError:
            raise
        except Exception as e:
            raise NeonConnectionError(f"FinDoc 写入项目库失败: {e}") from e

        self.invalidate_storage_cache(user_id)
        return ProjectUploadRecord(
            id=entry_id,
            project_id=project_id,
            user_id=user_id,
            uploaded_at=uploaded_at.isoformat(),
            body_only=True,
            result_count=1,
            success_count=1,
            source="findoc",
            editor_text=text,
        )

    def create_manual_upload(
        self,
        *,
        user_id: str,
        project_id: str,
        editor_text: str = "",
        title: str = "",
    ) -> ProjectUploadRecord:
        """Dashboard 手动新建记录：无抓取结果，可选初始正文。"""
        if not user_id:
            raise ValueError("user_id 必填")

        text = (editor_text or "").strip()
        results: list[dict[str, Any]] = []

        incoming = estimate_utf8_bytes(text) + estimate_json_payload_bytes(results) + 64
        self.assert_user_storage_quota(user_id, incoming)

        db_schema = self.ensure_project_database(user_id, project_id)
        entry_id = str(uuid.uuid4())
        uploaded_at = datetime.now(timezone.utc)
        payload = json.dumps(results, ensure_ascii=False)

        schema_id = sql.Identifier(db_schema)
        table_id = sql.Identifier(_SCRAPE_UPLOADS)
        success = sum(1 for r in results if r.get("status") == "success")
        if text:
            insert_sql = sql.SQL(
                """
                INSERT INTO {}.{} (
                    id, uploaded_at, body_only, source, results, editor_text,
                    editor_updated_at, result_count, success_count
                )
                VALUES (%s, %s, TRUE, 'manual', %s::jsonb, %s, %s, %s, %s)
                """
            ).format(schema_id, table_id)
            params: tuple[Any, ...] = (
                entry_id,
                uploaded_at,
                payload,
                text,
                uploaded_at,
                len(results),
                success,
            )
        else:
            insert_sql = sql.SQL(
                """
                INSERT INTO {}.{} (
                    id, uploaded_at, body_only, source, results,
                    result_count, success_count
                )
                VALUES (%s, %s, TRUE, 'manual', %s::jsonb, %s, %s)
                """
            ).format(schema_id, table_id)
            params = (
                entry_id,
                uploaded_at,
                payload,
                len(results),
                success,
            )

        try:
            with self._session() as conn:
                with conn.cursor() as cur:
                    cur.execute(insert_sql, params)
        except NeonStorageQuotaError:
            raise
        except Exception as e:
            raise NeonConnectionError(f"新建记录失败: {e}") from e

        self.invalidate_storage_cache(user_id)
        return ProjectUploadRecord(
            id=entry_id,
            project_id=project_id,
            user_id=user_id,
            uploaded_at=uploaded_at.isoformat(),
            body_only=True,
            result_count=len(results),
            success_count=success,
            source="manual",
            editor_text=text or None,
        )

    def list_uploads_for_project(
        self,
        user_id: str,
        project_id: str,
        *,
        limit: int = 50,
    ) -> list[ProjectUploadRecord]:
        if not user_id:
            raise ValueError("user_id 必填")

        try:
            with self._session() as conn:
                db_schema = self._resolve_project_data_schema(
                    conn, user_id, project_id
                )
                schema_id = sql.Identifier(db_schema)
                table_id = sql.Identifier(_SCRAPE_UPLOADS)
                query = sql.SQL(
                    """
                    SELECT id, uploaded_at, body_only, source,
                           COALESCE(
                               result_count,
                               jsonb_array_length(results),
                               0
                           ) AS result_count,
                           COALESCE(success_count, 0) AS success_count
                    FROM {}.{}
                    ORDER BY uploaded_at DESC
                    LIMIT %s
                    """
                ).format(schema_id, table_id)
                with conn.cursor() as cur:
                    cur.execute(query, (limit,))
                    rows = cur.fetchall()
        except Exception as e:
            raise NeonConnectionError(f"Neon 查询失败: {e}") from e

        out: list[ProjectUploadRecord] = []
        for row in rows:
            uploaded = row[1]
            uploaded_str = (
                uploaded.isoformat()
                if hasattr(uploaded, "isoformat")
                else str(uploaded)
            )
            out.append(
                ProjectUploadRecord(
                    id=str(row[0]),
                    project_id=project_id,
                    user_id=user_id,
                    uploaded_at=uploaded_str,
                    body_only=bool(row[2]),
                    source=str(row[3] or "scrape"),
                    result_count=int(row[4] or 0),
                    success_count=int(row[5] or 0),
                )
            )
        return out

    def get_upload_record(
        self,
        user_id: str,
        project_id: str,
        upload_id: str,
    ) -> tuple[ProjectUploadRecord, list[dict[str, Any]]]:
        if not user_id:
            raise ValueError("user_id 必填")

        try:
            with self._session() as conn:
                db_schema = self._resolve_project_data_schema(
                    conn, user_id, project_id
                )
                schema_id = sql.Identifier(db_schema)
                table_id = sql.Identifier(_SCRAPE_UPLOADS)
                query = sql.SQL(
                    """
                    SELECT id, uploaded_at, body_only, source, results,
                           editor_text,
                           jsonb_array_length(results) AS result_count,
                           (
                             SELECT COUNT(*)::int
                             FROM jsonb_array_elements(results) AS elem
                             WHERE elem->>'status' = 'success'
                           ) AS success_count
                    FROM {}.{}
                    WHERE id = %s
                    LIMIT 1
                    """
                ).format(schema_id, table_id)
                with conn.cursor() as cur:
                    cur.execute(query, (upload_id,))
                    row = cur.fetchone()
        except Exception as e:
            raise NeonConnectionError(f"Neon 查询失败: {e}") from e

        if not row:
            raise NeonConnectionError("记录不存在")

        uploaded = row[1]
        uploaded_str = (
            uploaded.isoformat()
            if hasattr(uploaded, "isoformat")
            else str(uploaded)
        )
        raw_results = row[4]
        if isinstance(raw_results, str):
            results = json.loads(raw_results)
        else:
            results = list(raw_results or [])

        editor_raw = row[5]
        editor_text = (
            editor_raw.strip()
            if isinstance(editor_raw, str) and editor_raw.strip()
            else None
        )

        meta = ProjectUploadRecord(
            id=str(row[0]),
            project_id=project_id,
            user_id=user_id,
            uploaded_at=uploaded_str,
            body_only=bool(row[2]),
            source=str(row[3] or "scrape"),
            result_count=int(row[6] or 0),
            success_count=int(row[7] or 0),
            editor_text=editor_text,
        )
        return meta, results

    def get_upload_editor_payload(
        self,
        user_id: str,
        project_id: str,
        upload_id: str,
    ) -> tuple[str | None, list[dict[str, Any]]]:
        """轻量读取：有 editor_text 时不传输大型 results JSONB。"""
        if not user_id:
            raise ValueError("user_id 必填")

        try:
            with self._session() as conn:
                db_schema = self._resolve_project_data_schema(
                    conn, user_id, project_id
                )
                schema_id = sql.Identifier(db_schema)
                table_id = sql.Identifier(_SCRAPE_UPLOADS)
                query = sql.SQL(
                    """
                    SELECT
                        editor_text,
                        CASE
                            WHEN editor_text IS NOT NULL
                                 AND btrim(editor_text) <> ''
                            THEN NULL
                            ELSE results
                        END AS results_payload
                    FROM {}.{}
                    WHERE id = %s
                    LIMIT 1
                    """
                ).format(schema_id, table_id)
                with conn.cursor() as cur:
                    cur.execute(query, (upload_id,))
                    row = cur.fetchone()
        except Exception as e:
            raise NeonConnectionError(f"Neon 查询失败: {e}") from e

        if not row:
            raise NeonConnectionError("记录不存在")

        editor_raw = row[0]
        editor_text = (
            editor_raw.strip()
            if isinstance(editor_raw, str) and editor_raw.strip()
            else None
        )

        raw_results = row[1]
        if raw_results is None:
            results: list[dict[str, Any]] = []
        elif isinstance(raw_results, str):
            results = json.loads(raw_results)
        else:
            results = list(raw_results or [])

        return editor_text, results

    def update_upload_editor_text(
        self,
        user_id: str,
        project_id: str,
        upload_id: str,
        editor_text: str,
    ) -> ProjectUploadRecord:
        if not user_id:
            raise ValueError("user_id 必填")

        db_schema = self.ensure_project_database(user_id, project_id)
        new_bytes = estimate_utf8_bytes(editor_text)

        schema_id = sql.Identifier(db_schema)
        table_id = sql.Identifier(_SCRAPE_UPLOADS)
        update_sql = sql.SQL(
            """
            UPDATE {}.{}
            SET editor_text = %s, editor_updated_at = NOW()
            WHERE id = %s
            RETURNING id, uploaded_at, body_only, source,
                      COALESCE(
                          result_count,
                          jsonb_array_length(results),
                          0
                      ) AS result_count,
                      COALESCE(success_count, 0) AS success_count,
                      editor_text
            """
        ).format(schema_id, table_id)

        try:
            with self._session() as conn:
                old_bytes = self._editor_text_bytes(conn, db_schema, upload_id)
                delta = max(0, new_bytes - old_bytes)
                if delta > 0:
                    self.assert_user_storage_quota(user_id, delta)
                with conn.cursor() as cur:
                    cur.execute(update_sql, (editor_text, upload_id))
                    row = cur.fetchone()
        except Exception as e:
            raise NeonConnectionError(f"Neon 文档保存失败: {e}") from e

        if not row:
            raise NeonConnectionError("记录不存在")

        self.invalidate_storage_cache(user_id)

        uploaded = row[1]
        uploaded_str = (
            uploaded.isoformat()
            if hasattr(uploaded, "isoformat")
            else str(uploaded)
        )
        editor_raw = row[6]
        saved_editor = (
            editor_raw.strip()
            if isinstance(editor_raw, str) and editor_raw.strip()
            else editor_text
        )

        return ProjectUploadRecord(
            id=str(row[0]),
            project_id=project_id,
            user_id=user_id,
            uploaded_at=uploaded_str,
            body_only=bool(row[2]),
            source=str(row[3] or "scrape"),
            result_count=int(row[4] or 0),
            success_count=int(row[5] or 0),
            editor_text=saved_editor,
        )

    def delete_upload_record(
        self,
        user_id: str,
        project_id: str,
        upload_id: str,
    ) -> bool:
        if not self.project_exists(user_id, project_id):
            return False

        db_schema = project_pg_schema(user_id, project_id)
        schema_id = sql.Identifier(db_schema)
        table_id = sql.Identifier(_SCRAPE_UPLOADS)
        delete_sql = sql.SQL("DELETE FROM {}.{} WHERE id = %s").format(
            schema_id, table_id
        )

        try:
            with self._session() as conn:
                with conn.cursor() as cur:
                    cur.execute(delete_sql, (upload_id,))
                    deleted = cur.rowcount > 0
            if deleted:
                self.invalidate_storage_cache(user_id)
            return deleted
        except Exception as e:
            raise NeonConnectionError(f"Neon 删除记录失败: {e}") from e

    @staticmethod
    def _row_to_findoc_template(row: tuple) -> FindocTemplateRecord:
        created = row[3]
        updated = row[4]
        return FindocTemplateRecord(
            id=str(row[0]),
            name=str(row[1]),
            content=str(row[2] or ""),
            created_at=(
                created.isoformat()
                if hasattr(created, "isoformat")
                else str(created)
            ),
            updated_at=(
                updated.isoformat()
                if hasattr(updated, "isoformat")
                else str(updated)
            ),
        )

    def _findoc_template_bytes(self, conn, catalog: str, template_id: str) -> int:
        schema_id = sql.Identifier(catalog)
        table_id = sql.Identifier(_FINDOC_TEMPLATES)
        query = sql.SQL(
            """
            SELECT COALESCE(
                pg_column_size(name) + pg_column_size(content), 0
            )::bigint
            FROM {}.{}
            WHERE id = %s
            """
        ).format(schema_id, table_id)
        with conn.cursor() as cur:
            cur.execute(query, (template_id,))
            row = cur.fetchone()
        return int(row[0] or 0) if row else 0

    def list_findoc_templates(self, user_id: str) -> list[FindocTemplateRecord]:
        catalog = self.ensure_user_catalog(user_id)
        schema_id = sql.Identifier(catalog)
        table_id = sql.Identifier(_FINDOC_TEMPLATES)
        query = sql.SQL(
            """
            SELECT id, name, content, created_at, updated_at
            FROM {}.{}
            ORDER BY updated_at DESC
            """
        ).format(schema_id, table_id)

        try:
            with self._session() as conn:
                with conn.cursor() as cur:
                    cur.execute(query)
                    rows = cur.fetchall()
        except Exception as e:
            raise NeonConnectionError(f"FinDoc 模板列表查询失败: {e}") from e

        return [self._row_to_findoc_template(row) for row in rows]

    def save_findoc_template(
        self,
        user_id: str,
        *,
        template_id: str | None,
        name: str,
        content: str,
    ) -> FindocTemplateRecord:
        if not user_id:
            raise ValueError("user_id 必填")

        catalog = self.ensure_user_catalog(user_id)
        trimmed_name = name.strip()
        if not trimmed_name:
            raise ValueError("模板名称不能为空")

        now = datetime.now(timezone.utc)
        incoming = estimate_utf8_bytes(trimmed_name) + estimate_utf8_bytes(content) + 48

        raw_id = (template_id or "").strip()
        update_id: str | None = None
        insert_id = str(uuid.uuid4())
        if raw_id:
            try:
                uuid.UUID(raw_id)
                update_id = raw_id
                insert_id = raw_id
            except ValueError:
                update_id = None

        schema_id = sql.Identifier(catalog)
        table_id = sql.Identifier(_FINDOC_TEMPLATES)

        try:
            with self._session() as conn:
                old_bytes = 0
                if update_id:
                    old_bytes = self._findoc_template_bytes(
                        conn, catalog, update_id
                    )
                delta = max(0, incoming - old_bytes)
                if delta > 0:
                    self.assert_user_storage_quota(user_id, delta)

                update_sql = sql.SQL(
                    """
                    UPDATE {}.{}
                    SET name = %s, content = %s, updated_at = %s
                    WHERE id = %s
                    RETURNING id, name, content, created_at, updated_at
                    """
                ).format(schema_id, table_id)
                insert_sql = sql.SQL(
                    """
                    INSERT INTO {}.{} (id, name, content, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id, name, content, created_at, updated_at
                    """
                ).format(schema_id, table_id)

                row = None
                with conn.cursor() as cur:
                    if update_id:
                        cur.execute(
                            update_sql,
                            (trimmed_name, content, now, update_id),
                        )
                        row = cur.fetchone()

                    if not row:
                        cur.execute(
                            insert_sql,
                            (insert_id, trimmed_name, content, now, now),
                        )
                        row = cur.fetchone()
        except NeonStorageQuotaError:
            raise
        except Exception as e:
            raise NeonConnectionError(f"FinDoc 模板保存失败: {e}") from e

        if not row:
            raise NeonConnectionError("FinDoc 模板保存失败")

        self.invalidate_storage_cache(user_id)
        return self._row_to_findoc_template(row)

    def delete_findoc_template(self, user_id: str, template_id: str) -> bool:
        catalog = self.ensure_user_catalog(user_id)
        schema_id = sql.Identifier(catalog)
        table_id = sql.Identifier(_FINDOC_TEMPLATES)
        delete_sql = sql.SQL("DELETE FROM {}.{} WHERE id = %s").format(
            schema_id, table_id
        )

        try:
            with self._session() as conn:
                with conn.cursor() as cur:
                    cur.execute(delete_sql, (template_id,))
                    deleted = cur.rowcount > 0
            if deleted:
                self.invalidate_storage_cache(user_id)
            return deleted
        except Exception as e:
            raise NeonConnectionError(f"FinDoc 模板删除失败: {e}") from e

    def _connect(self):
        """兼容旧调用；请使用 _session()，连接在进程内复用。"""
        return self._get_conn()


_repo_singleton: NeonRepository | None = None
_repo_singleton_url: str = ""


def reset_neon_repository() -> None:
    """更换 NEON_DATABASE_URL 或修 .env 后调用，避免沿用旧连接。"""
    global _repo_singleton, _repo_singleton_url
    if _repo_singleton is not None:
        try:
            if _repo_singleton._pool is not None:
                _repo_singleton._pool.close()
            elif (
                _repo_singleton._conn is not None
                and not _repo_singleton._conn.closed
            ):
                _repo_singleton._conn.close()
        except Exception:
            pass
    _repo_singleton = None
    _repo_singleton_url = ""


def get_neon_repository() -> NeonRepository | None:
    global _repo_singleton, _repo_singleton_url
    url = (settings.neon_database_url or "").strip()
    if _repo_singleton is not None and url != _repo_singleton_url:
        reset_neon_repository()
    if _repo_singleton is not None:
        return _repo_singleton
    inst = NeonRepository.from_settings()
    if inst is None:
        return None
    _repo_singleton = inst
    _repo_singleton_url = url
    return _repo_singleton
