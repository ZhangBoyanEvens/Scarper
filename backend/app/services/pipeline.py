import logging

from app.ai.summarizer import SummarizationError, normalize_processing_prompt
from app.crawler.url_validator import UrlValidationError, normalize_url
from app.intelligence.failure_analyzer import build_extract_error, structured_from_exception
from app.intelligence.failure_model import from_fetch_error
from app.intelligence.orchestrator import get_orchestrator
from app.intelligence.types import FetchStage
from app.models.schemas import ExtractError, ExtractSuccess
from app.services.cache import cache, cache_key
from app.services.extraction import ContentQualityError, ExtractionFailedError
from app.services.pipeline_recovery import (
    attempt_recovery,
    cache_and_return_success,
    complete_from_fetch,
)

logger = logging.getLogger(__name__)


async def run_extraction(
    raw_url: str,
    processing_prompt: str | None = None,
    output_language: str = "zh",
    output_detail: str = "concise",
) -> ExtractSuccess | ExtractError:
    recovery_attempts: list[str] = []
    normalized: str | None = None
    orchestrator = get_orchestrator()

    try:
        normalized = normalize_url(raw_url)
    except UrlValidationError as e:
        failure = structured_from_exception(e, "HTTP_FETCH")
        return await build_extract_error(
            requested_url=raw_url,
            normalized_url=None,
            failure=failure,
            recovery_attempts=recovery_attempts,
        )

    safe_prompt = normalize_processing_prompt(processing_prompt)
    lang = output_language if output_language in ("zh", "original", "en") else "zh"
    detail = output_detail if output_detail in ("detailed", "concise") else "concise"

    key = cache_key(normalized, safe_prompt, lang, detail)
    cached = cache.get(key)
    if cached:
        logger.info("cache hit for %s", normalized)
        out = cached.model_copy(deep=True)
        if out.token_usage:
            out.token_usage = out.token_usage.model_copy(
                update={"page_cache_hit": True, "estimated_cost_usd": 0.0},
            )
        return out

    last_fetch = None
    try:
        last_fetch = await orchestrator.fetch(normalized)
        result = await complete_from_fetch(
            last_fetch,
            processing_prompt=safe_prompt,
            output_language=lang,
            output_detail=detail,
        )
        return cache_and_return_success(normalized, safe_prompt, lang, detail, result)

    except UrlValidationError as e:
        failure = structured_from_exception(e, "HTTP_FETCH")
        return await build_extract_error(
            requested_url=raw_url,
            normalized_url=normalized,
            failure=failure,
            recovery_attempts=recovery_attempts,
        )

    except Exception as e:
        from app.crawler.types import FetchError

        if isinstance(e, FetchError):
            failure = from_fetch_error(e, stage="HTTP_FETCH")
            recovered = await attempt_recovery(
                normalized,
                error=e,
                processing_prompt=safe_prompt,
                output_language=lang,
                output_detail=detail,
                recovery_attempts=recovery_attempts,
                last_fetch=last_fetch,
            )
            if recovered:
                return cache_and_return_success(
                    normalized, safe_prompt, lang, detail, recovered,
                )
            return await build_extract_error(
                requested_url=raw_url,
                normalized_url=normalized,
                failure=failure,
                recovery_attempts=recovery_attempts,
            )

        if isinstance(e, (ExtractionFailedError, ContentQualityError)):
            failure = structured_from_exception(e, "PARSE")
            html_snippet = last_fetch.html[:4000] if last_fetch else None
            recovered = await attempt_recovery(
                normalized,
                error=e,
                processing_prompt=safe_prompt,
                output_language=lang,
                output_detail=detail,
                recovery_attempts=recovery_attempts,
                last_fetch=last_fetch,
            )
            if recovered:
                return cache_and_return_success(
                    normalized, safe_prompt, lang, detail, recovered,
                )
            return await build_extract_error(
                requested_url=raw_url,
                normalized_url=normalized,
                failure=failure,
                recovery_attempts=recovery_attempts,
            )

        if isinstance(e, SummarizationError):
            failure = structured_from_exception(e, "AI")
            recovered = await attempt_recovery(
                normalized,
                error=e,
                processing_prompt=safe_prompt,
                output_language=lang,
                output_detail=detail,
                recovery_attempts=recovery_attempts,
                last_fetch=last_fetch,
            )
            if recovered:
                return cache_and_return_success(
                    normalized, safe_prompt, lang, detail, recovered,
                )
            return await build_extract_error(
                requested_url=raw_url,
                normalized_url=normalized,
                failure=failure,
                recovery_attempts=recovery_attempts,
            )

        logger.exception("pipeline failed for %s", raw_url)
        failure = structured_from_exception(e, "AI")
        return await build_extract_error(
            requested_url=raw_url,
            normalized_url=normalized,
            failure=failure,
            recovery_attempts=recovery_attempts,
        )


async def shutdown() -> None:
    await get_orchestrator().close()
