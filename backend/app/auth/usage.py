"""用户抓取用量（按日计数，内存存储；生产环境应接数据库）。"""

from datetime import datetime, timezone

FREE_DAILY_EXTRACT_LIMIT = 20

# user_id -> (utc_date_iso, count)
_user_daily_extracts: dict[str, tuple[str, int]] = {}


def _utc_today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def plan_from_pla_claim(pla: object) -> str:
    """从 Clerk session JWT 的 pla 声明解析计划 slug（如 u:free -> free）。"""
    if not pla or not isinstance(pla, str):
        return "free"
    if ":" in pla:
        return pla.split(":", 1)[1] or "free"
    return pla


def is_free_plan(plan: str) -> bool:
    return plan.strip().lower() in ("", "free")


def get_daily_extract_limit(plan: str) -> int | None:
    """free 返回每日上限；付费计划返回 None 表示不限。"""
    if is_free_plan(plan):
        return FREE_DAILY_EXTRACT_LIMIT
    return None


def get_daily_extract_count(user_id: str) -> int:
    entry = _user_daily_extracts.get(user_id)
    today = _utc_today()
    if not entry or entry[0] != today:
        return 0
    return entry[1]


def can_extract_today(user_id: str, plan: str) -> bool:
    limit = get_daily_extract_limit(plan)
    if limit is None:
        return True
    return get_daily_extract_count(user_id) < limit


def record_extract(user_id: str) -> int:
    today = _utc_today()
    entry = _user_daily_extracts.get(user_id)
    if not entry or entry[0] != today:
        count = 1
    else:
        count = entry[1] + 1
    _user_daily_extracts[user_id] = (today, count)
    return count
