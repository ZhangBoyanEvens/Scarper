"""
新 Neon 库：连通性测试 + 按应用标准自动建表（与 neon.py 一致）。

用法（backend/）:
  python scripts/setup_neon_db.py
  python scripts/setup_neon_db.py --user local-dev
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.db.neon import NeonRepository, get_neon_repository
from app.db.user_schema import project_pg_schema, user_pg_schema


def _table_columns(conn, schema: str, table: str) -> list[tuple[str, str]]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema, table),
        )
        return [(r[0], r[1]) for r in cur.fetchall()]


def main() -> int:
    parser = argparse.ArgumentParser(description="Neon DB setup & verify")
    parser.add_argument(
        "--user",
        default=settings.neon_dev_user_id or "local-dev",
        help="Bootstrap catalog schema for this user id",
    )
    args = parser.parse_args()

    print("NEON_ENABLED:", settings.neon_enabled)
    print("NEON_DATABASE_URL set:", bool((settings.neon_database_url or "").strip()))

    # Fresh repo (ignore stale singleton from old URL in long-running server)
    import app.db.neon as neon_mod

    neon_mod._repo_singleton = None
    repo = NeonRepository.from_settings()
    if not repo:
        print("FAIL: Neon not configured")
        return 1

    if not repo.ping():
        print("FAIL: ping failed")
        return 1
    print("OK: ping")

    user_id = args.user.strip()
    catalog = repo.ensure_user_catalog(user_id)
    print(f"OK: user catalog schema -> {catalog}")

    project = repo.create_project(
        user_id,
        name="__schema_bootstrap__",
        description="auto setup",
    )
    pid = project.id
    data_schema = project_pg_schema(user_id, pid)
    repo.ensure_project_database(user_id, pid)
    print(f"OK: project data schema -> {data_schema}")

    with repo._connect() as conn:
        catalog_cols = _table_columns(conn, catalog, "projects")
        upload_cols = _table_columns(conn, data_schema, "scrape_upload_batches")

    expected_catalog = {
        "id": "uuid",
        "name": "text",
        "description": "text",
        "data_schema": "text",
        "created_at": "timestamp with time zone",
        "updated_at": "timestamp with time zone",
    }
    expected_uploads = {
        "id": "uuid",
        "uploaded_at": "timestamp with time zone",
        "body_only": "boolean",
        "source": "text",
        "results": "jsonb",
    }

    def check(name: str, cols: list[tuple[str, str]], expected: dict[str, str]) -> bool:
        got = {c: t for c, t in cols}
        missing = [c for c in expected if c not in got]
        if missing:
            print(f"FAIL: {name} missing columns: {missing}")
            return False
        for col, typ in expected.items():
            if got[col] != typ:
                print(f"FAIL: {name}.{col} type {got[col]!r} != {typ!r}")
                return False
        print(f"OK: {name} columns match standard ({len(expected)} cols)")
        return True

    ok = check(f"{catalog}.projects", catalog_cols, expected_catalog)
    ok = check(
        f"{data_schema}.scrape_upload_batches", upload_cols, expected_uploads
    ) and ok

    deleted = repo.delete_project(user_id, pid)
    print(f"OK: bootstrap project removed: {deleted}")

    with repo._connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT schema_name FROM information_schema.schemata
                WHERE schema_name LIKE 'u\\_%' ESCAPE '\\'
                ORDER BY schema_name
                """
            )
            schemas = [r[0] for r in cur.fetchall()]
    print(f"User-related schemas now: {len(schemas)}")
    for s in schemas:
        print(f"  - {s}")

    if not ok:
        return 1
    print("\nAll checks passed — new DB is ready (same layout as before).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
