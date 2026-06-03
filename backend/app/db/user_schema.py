"""将 Clerk user_id / project_id 映射为安全的 Postgres schema 名。"""

from __future__ import annotations

import re

_USER_SCHEMA_RE = re.compile(r"[^a-z0-9_]")
_UUID_HEX_RE = re.compile(r"[^a-f0-9]")
_USER_SUFFIX_MAX = 32
_PROJECT_UUID_HEX_MAX = 24
_PG_IDENT_MAX = 63


def user_pg_schema(user_id: str) -> str:
    """
    用户目录 schema（仅存 projects 登记表）。
    例如 user_2abc -> u_user_2abc
    """
    raw = (user_id or "").strip().lower()
    if not raw:
        raise ValueError("user_id 不能为空")
    safe = _USER_SCHEMA_RE.sub("_", raw).strip("_")
    if not safe:
        raise ValueError("user_id 无法映射为合法 schema")
    suffix = safe[:_USER_SUFFIX_MAX]
    return f"u_{suffix}"


def project_pg_schema(user_id: str, project_id: str) -> str:
    """
    每个 Project 独立数据 schema（Scrape 上传及后续业务表）。
    命名：{user_schema}_p_{uuid_hex}
    """
    base = user_pg_schema(user_id)
    pid = _UUID_HEX_RE.sub("", (project_id or "").strip().lower())[
        :_PROJECT_UUID_HEX_MAX
    ]
    if len(pid) < 8:
        raise ValueError("project_id 无效")
    combined = f"{base}_p_{pid}"
    return combined[:_PG_IDENT_MAX]
