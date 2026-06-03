"""Neon 每用户存储配额与用量估算。"""

from __future__ import annotations

import json
from typing import Any

from app.config import settings


def neon_user_quota_bytes() -> int:
    mb = max(1, int(settings.neon_user_quota_mb))
    return mb * 1024 * 1024


def estimate_utf8_bytes(text: str) -> int:
    return len(text.encode("utf-8"))


def estimate_json_payload_bytes(data: Any) -> int:
    return estimate_utf8_bytes(json.dumps(data, ensure_ascii=False))
