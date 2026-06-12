"""Read-only audit: list vetra_companies / vetra_templates across user schemas."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app.db.neon import get_neon_repository


def main() -> int:
    repo = get_neon_repository()
    if not repo:
        print("FAIL: Neon repository not available")
        return 1

    with repo._session() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT nspname FROM pg_namespace
                WHERE nspname LIKE 'u_%'
                ORDER BY nspname
                """
            )
            schemas = [row[0] for row in cur.fetchall()]
            print(f"user_schemas={len(schemas)}")

            found_any = False
            for schema in schemas:
                for table in ("vetra_companies", "vetra_templates"):
                    cur.execute(
                        """
                        SELECT EXISTS (
                          SELECT 1 FROM information_schema.tables
                          WHERE table_schema = %s AND table_name = %s
                        )
                        """,
                        (schema, table),
                    )
                    if not cur.fetchone()[0]:
                        continue

                    cur.execute(
                        f'SELECT COUNT(*) FROM "{schema}"."{table}"'
                    )
                    count = int(cur.fetchone()[0] or 0)
                    if count == 0:
                        continue

                    found_any = True
                    print(f"\n{schema}.{table} rows={count}")

                    if table == "vetra_companies":
                        cur.execute(
                            f"""
                            SELECT id, name,
                              length(COALESCE(introduction, '')) AS intro_len,
                              length(COALESCE(subject, '')) AS subj_len,
                              length(COALESCE(body, '')) AS body_len,
                              updated_at
                            FROM "{schema}"."{table}"
                            ORDER BY updated_at DESC
                            LIMIT 10
                            """
                        )
                    else:
                        cur.execute(
                            f"""
                            SELECT id, name,
                              length(COALESCE(subject, '')) AS subj_len,
                              length(COALESCE(body, '')) AS body_len,
                              updated_at
                            FROM "{schema}"."{table}"
                            ORDER BY updated_at DESC
                            LIMIT 10
                            """
                        )

                    for row in cur.fetchall():
                        print(" ", row)

            if not found_any:
                print("\nNO_VETRA_ROWS_FOUND")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
