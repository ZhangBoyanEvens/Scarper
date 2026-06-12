"""Read-only: count written articles in Neon (dedupe by normalized body text)."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app.db.neon import get_neon_repository


def norm(text: str) -> str:
    t = (text or "").strip()
    return re.sub(r"\s+", " ", t)


def content_hash(text: str) -> str:
    return hashlib.sha256(norm(text).encode("utf-8")).hexdigest()


def table_columns(cur, schema: str, table: str) -> set[str]:
    cur.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        """,
        (schema, table),
    )
    return {row[0] for row in cur.fetchall()}


def results_to_text(raw: object) -> str:
    if not raw:
        return ""
    if isinstance(raw, str):
        try:
            items = json.loads(raw)
        except json.JSONDecodeError:
            return ""
    else:
        items = raw
    if not isinstance(items, list):
        return ""

    blocks: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        status = item.get("status")
        if status == "success":
            parts: list[str] = []
            title = str(item.get("title") or "").strip()
            summary = str(item.get("summary") or "").strip()
            content = str(item.get("content") or "").strip()
            key_points = item.get("key_points") or []
            if title:
                parts.append(f"### 标题\n{title}")
            if summary:
                parts.append(f"### 摘要\n{summary}")
            if isinstance(key_points, list) and key_points:
                pts = "\n".join(f"• {p}" for p in key_points if str(p).strip())
                if pts:
                    parts.append(f"### 要点\n{pts}")
            if content:
                parts.append(f"### 正文\n{content}")
            url = str(item.get("url") or "").strip()
            body = "\n".join(parts)
            blocks.append(f"## {url}\n{body}" if url else body)
        elif status == "error":
            url = str(item.get("url") or "").strip()
            err = str(item.get("error") or "").strip()
            blocks.append(f"## {url}\n[错误] {err}")
    return "\n\n---\n\n".join(blocks)


def resolve_upload_text(editor_text: str | None, results_raw: object) -> str:
    saved = (editor_text or "").strip()
    if saved:
        return saved
    return results_to_text(results_raw).strip()


def main() -> int:
    repo = get_neon_repository()
    if not repo:
        print("FAIL: Neon repository not available")
        return 1

    rows: list[dict] = []
    with repo._session() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT nspname FROM pg_namespace
                WHERE nspname LIKE 'u_%'
                ORDER BY nspname
                """
            )
            user_schemas = [r[0] for r in cur.fetchall()]

            for schema in user_schemas:
                cur.execute(
                    """
                    SELECT EXISTS (
                      SELECT 1 FROM information_schema.tables
                      WHERE table_schema = %s AND table_name = 'projects'
                    )
                    """,
                    (schema,),
                )
                if not cur.fetchone()[0]:
                    continue

                cur.execute(
                    f'SELECT id, data_schema FROM "{schema}".projects'
                )
                projects = cur.fetchall()

                for proj_id, data_schema in projects:
                    if not data_schema:
                        continue
                    cur.execute(
                        """
                        SELECT EXISTS (
                          SELECT 1 FROM information_schema.tables
                          WHERE table_schema = %s
                            AND table_name = 'scrape_upload_batches'
                        )
                        """,
                        (data_schema,),
                    )
                    if not cur.fetchone()[0]:
                        continue

                    cols = table_columns(cur, data_schema, "scrape_upload_batches")
                    has_editor = "editor_text" in cols
                    select_cols = ["id", "source", "results", "uploaded_at"]
                    if has_editor:
                        select_cols.insert(2, "editor_text")
                    cur.execute(
                        f"""
                        SELECT {", ".join(select_cols)}
                        FROM "{data_schema}".scrape_upload_batches
                        """
                    )
                    for row in cur.fetchall():
                        upload_id = row[0]
                        source = row[1] or "scrape"
                        if has_editor:
                            editor_text = row[2]
                            results_raw = row[3]
                            uploaded_at = row[4]
                        else:
                            editor_text = None
                            results_raw = row[2]
                            uploaded_at = row[3]
                        text = resolve_upload_text(editor_text, results_raw)
                        if not text:
                            continue
                        rows.append(
                            {
                                "user_schema": schema,
                                "project_id": proj_id,
                                "upload_id": upload_id,
                                "source": source,
                                "text": text,
                                "uploaded_at": uploaded_at,
                            }
                        )

    total = len(rows)
    by_source: dict[str, int] = {}
    for r in rows:
        by_source[r["source"]] = by_source.get(r["source"], 0) + 1

    unique_hashes: set[str] = set()
    findoc_hashes: set[str] = set()
    for r in rows:
        h = content_hash(r["text"])
        unique_hashes.add(h)
        if r["source"] == "findoc":
            findoc_hashes.add(h)

    findoc_total = by_source.get("findoc", 0)

    print("=== 文章统计（Neon 云端，按 editor_text 正文）===")
    print(f"总记录数（含重复）: {total}")
    print(f"去重后唯一文章数: {len(unique_hashes)}")
    print()
    print("按来源:")
    for src, n in sorted(by_source.items()):
        print(f"  {src}: {n} 条")
    print()
    print("FinDoc 产出 (source=findoc):")
    print(f"  总保存次数: {findoc_total}")
    print(f"  去重后唯一篇数: {len(findoc_hashes)}")
    if findoc_total:
        print(f"  重复保存: {findoc_total - len(findoc_hashes)}")
    print()
    print(f"涉及用户数: {len({r['user_schema'] for r in rows})}")
    print(f"涉及项目数: {len({(r['user_schema'], r['project_id']) for r in rows})}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
