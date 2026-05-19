import logging
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth.clerk_auth import (
    AuthUser,
    can_extract_today,
    get_daily_extract_count,
    get_daily_extract_limit,
    get_optional_user,
    record_extract,
    require_user,
)
from app.auth.usage import FREE_DAILY_EXTRACT_LIMIT
from app.config import settings
from app.models.schemas import ExtractRequest, ExtractResponse, UserProfileResponse
from app.services.pipeline import run_extraction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

_RATE: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 30
_RATE_WINDOW = 60.0


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/user/me", response_model=UserProfileResponse)
async def get_current_user_profile(
    user: AuthUser = Depends(require_user),
) -> UserProfileResponse:
    """当前登录用户资料（预留：可接数据库扩展）"""
    plan = user.plan
    return UserProfileResponse(
        user_id=user.user_id,
        email=user.email,
        name=user.name,
        image_url=user.image_url,
        extract_count=get_daily_extract_count(user.user_id),
        extract_limit=get_daily_extract_limit(plan),
        plan=plan,
    )


@router.post("/extract", response_model=None)
async def extract(
    body: ExtractRequest,
    request: Request,
    user: AuthUser | None = Depends(get_optional_user),
) -> ExtractResponse:
    if settings.clerk_require_auth and not user:
        raise HTTPException(status_code=401, detail="需要登录后才能抓取")

    if user and not can_extract_today(user.user_id, user.plan):
        limit = get_daily_extract_limit(user.plan) or FREE_DAILY_EXTRACT_LIMIT
        raise HTTPException(
            status_code=429,
            detail=f"今日抓取次数已用尽（{limit}/{limit}），请明日再试",
        )

    client_ip = request.client.host if request.client else "unknown"
    rate_key = user.user_id if user else client_ip
    _check_rate_limit(rate_key)

    url = str(body.url)
    logger.info(
        "extract url=%s user=%s ip=%s",
        url,
        user.user_id if user else "anonymous",
        client_ip,
    )

    result = await run_extraction(
        url,
        processing_prompt=body.processing_prompt,
        output_language=body.output_language,
        output_detail=body.output_detail,
    )

    if user and result.status == "success":
        record_extract(user.user_id)

    return result


def _check_rate_limit(key: str) -> None:
    now = time.time()
    window_start = now - _RATE_WINDOW
    hits = [t for t in _RATE[key] if t > window_start]
    if len(hits) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")
    hits.append(now)
    _RATE[key] = hits
