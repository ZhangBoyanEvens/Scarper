import logging
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request

from app.utils.timeout import OperationTimeoutError, run_with_timeout

from app.auth.clerk_auth import (
    AuthUser,
    can_extract_today,
    get_daily_extract_count,
    get_daily_extract_limit,
    get_optional_user,
    record_extract,
    require_user,
)
from app.config import settings
from app.ai.integrator import integrate_extractions
from app.ai.token_usage import TokenUsageAccumulator
from app.models.schemas import (
    ExtractRequest,
    ExtractResponse,
    ExtractSuccess,
    MergeIntegrateRequest,
    UserProfileResponse,
)
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


@router.post("/merge", response_model=ExtractSuccess)
async def merge_integrate(body: MergeIntegrateRequest) -> ExtractSuccess:
    """将多个已成功抓取的结果 AI 整合为一条。"""
    if not (settings.deepseek_api_key or "").strip():
        raise HTTPException(
            status_code=503,
            detail="未配置 DEEPSEEK_API_KEY，无法执行 AI 整合",
        )
    sources = [s.model_dump() for s in body.sources]
    try:
        merged, usage = await run_with_timeout(
            integrate_extractions(
                sources,
                processing_prompt=body.processing_prompt,
                output_language=body.output_language,
                output_detail=body.output_detail,
            ),
            settings.ai_summarize_timeout_sec * 2,
            operation="AI 整合",
        )
    except OperationTimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e)) from e
    except Exception as e:
        logger.exception("merge integrate failed")
        raise HTTPException(status_code=502, detail=f"AI 整合失败：{e}") from e

    urls = [s.url for s in body.sources]
    display_url = " | ".join(urls)
    return ExtractSuccess(
        url=display_url,
        title=merged.get("title") or body.sources[0].title or "整合结果",
        summary=merged.get("summary", ""),
        key_points=merged.get("key_points", []),
        content=merged.get("content", ""),
        detected_language=merged.get("detected_language", "")
        or body.sources[0].detected_language,
        token_usage=usage.to_dict(),
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
        limit = get_daily_extract_limit(user.plan)
        raise HTTPException(
            status_code=429,
            detail=f"今日抓取次数已用尽（{limit} 次），请明日再试",
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

    try:
        result = await run_with_timeout(
            run_extraction(
                url,
                processing_prompt=body.processing_prompt,
                output_language=body.output_language,
                output_detail=body.output_detail,
            ),
            settings.extract_timeout_sec,
            operation="抓取与分析",
        )
    except OperationTimeoutError as e:
        from app.intelligence.failure_analyzer import build_extract_error
        from app.intelligence.types import ErrorType, StructuredFailure

        failure = StructuredFailure(
            error_type=ErrorType.TIMEOUT,
            stage="AI",
            message=str(e),
            recoverable=True,
            recommended_action="缩短链接或稍后重试",
            error_code=e.code,
        )
        return await build_extract_error(
            requested_url=url,
            normalized_url=url,
            failure=failure,
            recovery_attempts=[],
            skip_ai_diagnosis=True,
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
