"""Structured failure analysis for API responses."""

from app.ai.failure_diagnosis import FailureContext, diagnose_failure, fallback_diagnosis
from app.config import settings
from app.intelligence.failure_model import from_fetch_error
from app.intelligence.types import FetchStage, StructuredFailure
from app.models.schemas import ExtractError
from app.utils.timeout import OperationTimeoutError, run_with_timeout


async def build_extract_error(
    *,
    requested_url: str,
    normalized_url: str | None,
    failure: StructuredFailure,
    recovery_attempts: list[str],
    intelligence_trace: dict | None = None,
    skip_ai_diagnosis: bool = False,
) -> ExtractError:
    ctx = FailureContext(
        requested_url=requested_url,
        normalized_url=normalized_url,
        error_message=failure.message,
        error_code=failure.error_code,
        recovery_attempts=recovery_attempts,
    )
    if skip_ai_diagnosis:
        diagnosis = fallback_diagnosis(ctx)
    else:
        try:
            diagnosis = await run_with_timeout(
                diagnose_failure(ctx),
                settings.ai_diagnosis_timeout_sec,
                operation="AI 诊断",
            )
        except OperationTimeoutError:
            diagnosis = fallback_diagnosis(ctx)

    full_diagnosis = diagnosis.summary
    if diagnosis.suggested_action and diagnosis.suggested_action not in full_diagnosis:
        full_diagnosis = f"{full_diagnosis}\n建议：{diagnosis.suggested_action}"

    return ExtractError(
        url=normalized_url or requested_url,
        error=failure.message,
        error_code=failure.error_code,
        stage=diagnosis.stage,
        stage_label=diagnosis.stage_label,
        diagnosis=full_diagnosis,
        root_cause=diagnosis.root_cause,
        suggested_action=failure.recommended_action or diagnosis.suggested_action,
        recovery_attempted=bool(recovery_attempts),
        recovery_note="；".join(recovery_attempts) if recovery_attempts else None,
    )


def structured_from_exception(exc: Exception, stage: FetchStage) -> StructuredFailure:
    from app.crawler.types import FetchError
    from app.crawler.url_validator import UrlValidationError
    from app.intelligence.failure_model import from_exception
    from app.intelligence.types import ErrorType, StructuredFailure

    if isinstance(exc, FetchError):
        return from_fetch_error(exc, stage=stage)
    if isinstance(exc, UrlValidationError):
        return StructuredFailure(
            error_type=ErrorType.HTTP_ERROR,
            stage="HTTP_FETCH",
            message=str(exc),
            recoverable=False,
            recommended_action="请检查 URL 格式",
            error_code=getattr(exc, "code", "invalid_url"),
        )
    return from_exception(exc, stage=stage)
