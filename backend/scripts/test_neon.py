"""Neon 连通性与上传接口冒烟测试。用法: python scripts/test_neon.py"""

from __future__ import annotations

import json
import sys
import uuid

from app.config import settings
from app.db.neon import get_neon_repository


def main() -> int:
    print("NEON_ENABLED:", settings.neon_enabled)
    print("NEON_DATABASE_URL set:", bool((settings.neon_database_url or "").strip()))

    repo = get_neon_repository()
    if not repo:
        print("FAIL: Neon repository not available (check NEON_* env)")
        return 1

    ok = repo.ping()
    print("ping:", ok)
    if not ok:
        print("FAIL: cannot connect to Neon")
        return 1

    user_id = "test-user-smoke"
    catalog = repo.ensure_user_catalog(user_id)
    print("user catalog:", catalog)

    project = repo.create_project(
        user_id,
        name="Neon Test Project",
        description="smoke",
    )
    project_id = project.id
    print("project created:", project_id)

    listed_projects = repo.list_projects(user_id)
    print("projects count:", len(listed_projects))
    sample = [
        {
            "url": "https://example.com",
            "title": "Neon test",
            "summary": "",
            "key_points": [],
            "content": "smoke test body",
            "detected_language": "en",
            "status": "success",
        }
    ]
    record = repo.upload_project_results(
        user_id=user_id,
        project_id=project_id,
        results=sample,
        body_only=True,
    )
    print("upload:", json.dumps(record.__dict__, ensure_ascii=False, indent=2))

    listed = repo.list_uploads_for_project(user_id, project_id, limit=5)
    print("list count:", len(listed))
    if not listed or listed[0].id != record.id:
        print("FAIL: list mismatch")
        return 1

    deleted = repo.delete_project(user_id, project_id)
    print("project deleted:", deleted)
    if not deleted:
        print("FAIL: project delete")
        return 1

    print("OK: Neon smoke test passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
