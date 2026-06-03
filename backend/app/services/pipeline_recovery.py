import logging

from app.ai.summarizer import AISummarizer, SummarizationError, normalize_processing_prompt
from app.config import settings
from app.crawler.types import FetchError
from app.intelligence.orchestrator import get_orchestrator
from app.models.schemas import ExtractSuccess, ExtractTokenUsage
from app.ai.token_usage import TokenUsageAccumulator
from app.parser.content_extractor import structured_to_llm_payload
from app.services.cache import cache, cache_key
from app.intelligence.render_detector import (
    should_retry_with_render,
    validate_content_quality,
)
from app.services.extraction import (
    ContentQualityError,
    ExtractionFailedError,
    extract_page_content,
)
from app.utils.timeout import OperationTimeoutError, run_with_timeout

logger = logging.getLogger(__name__)

_ai = AISummarizer()


async def _localize_outputs(
    *,
    summary: str,
    key_points: list[str],
    title: str,
    main_content: str,
    output_language: str,
    source_url: str,
    usage: TokenUsageAccumulator,
) -> tuple[str, list[str], str, str]:
    """Translate summary/body when AI summary ignored output_language."""
    from app.ai.summarizer import _output_language_mismatch

    display_content = main_content
    timeout = settings.ai_summarize_timeout_sec

    async def _translate(label: str, text: str) -> str:
        if not text.strip():
            return text

        async def _run() -> str:
            translated, u = await _ai.translate_text(text, output_language)
            usage.add(u)
            return translated

        return await run_with_timeout(_run(), timeout, operation=label)

    try:
        if _output_language_mismatch(output_language, summary, key_points):
            summary = await _translate("摘要翻译", summary)
            if key_points:
                joined = "\n".join(f"- {p}" for p in key_points)
                translated = await _translate("要点翻译", joined)
                key_points = [
                    line.lstrip("- ").strip()
                    for line in translated.splitlines()
                    if line.strip()
                ]
        display_content = await _translate("正文翻译", main_content)
        if title.strip():
            title = await _translate("标题翻译", title)
    except OperationTimeoutError:
        logger.warning("localization timed out for %s", source_url)
    except SummarizationError as e:
        logger.warning("localization skipped for %s: %s", source_url, e)

    return summary, key_points, title, display_content


async def complete_from_fetch(
    fetch,
    *,
    processing_prompt: str | None,
    output_language: str,
    output_detail: str,
) -> ExtractSuccess:
    meta = fetch.meta or {}
    exec_trace = dict(meta.get("execution_trace") or {})

    structured = await extract_page_content(fetch.html, fetch.url)
    quality = validate_content_quality(structured.main_content, html=fetch.html)

    if should_retry_with_render(
        fetch_method=fetch.method,
        quality=quality,
        render_detection=meta.get("render_detection"),
        render_fallback_used=bool(meta.get("render_fallback_used")),
    ):
        exec_trace["quality_retry_triggered"] = True
        logger.info(
            "content_quality_low url=%s reason=%s len=%s — playwright fallback",
            fetch.url,
            quality.reason,
            quality.text_length,
        )
        if not settings.playwright_enabled:
            raise ContentQualityError(
                f"正文质量不足（{quality.reason}），需要 Playwright 渲染但未启用",
                quality.reason,
            )
        fetch = await get_orchestrator().fetch_render_fallback(
            fetch.url,
            reason=quality.reason,
        )
        meta = fetch.meta or {}
        exec_trace.update(meta.get("execution_trace") or {})
        structured = await extract_page_content(fetch.html, fetch.url)
        quality = validate_content_quality(structured.main_content, html=fetch.html)
        if quality.status == "QUALITY_LOW":
            raise ContentQualityError(
                f"浏览器渲染后正文仍不足（{quality.reason}，{quality.text_length} 字）",
                quality.reason,
            )
    elif quality.status == "QUALITY_LOW":
        raise ContentQualityError(
            f"正文质量不足（{quality.reason}，{quality.text_length} 字）",
            quality.reason,
        )

    llm_payload = structured_to_llm_payload(structured)
    try:
        async def _summarize() -> tuple[dict, TokenUsageAccumulator]:
            return await _ai.summarize(
                llm_payload,
                fetch.url,
                processing_prompt=processing_prompt,
                output_language=output_language,
                output_detail=output_detail,
            )

        ai_result, usage_acc = await run_with_timeout(
            _summarize(),
            settings.ai_summarize_timeout_sec,
            operation="AI 摘要",
        )
    except OperationTimeoutError as e:
        raise SummarizationError(str(e), "ai_timeout") from e
    main_content = (structured.main_content or "").strip()
    if len(main_content) < 120:
        raise ContentQualityError(
            f"正文过短（{len(main_content)} 字），页面可能未正确渲染",
            "text_below_120",
        )

    title = structured.title or getattr(fetch, "title", "") or ""
    summary = ai_result.get("summary", "")
    key_points = ai_result.get("key_points", [])
    display_content = main_content

    if output_language in ("zh", "en"):
        summary, key_points, title, display_content = await _localize_outputs(
            summary=summary,
            key_points=key_points,
            title=title,
            main_content=main_content,
            output_language=output_language,
            source_url=fetch.url,
            usage=usage_acc,
        )

    usage_dict = usage_acc.to_dict()
    return ExtractSuccess(
        url=fetch.url,
        title=title,
        summary=summary,
        key_points=key_points,
        content=display_content,
        detected_language=ai_result.get("detected_language", ""),
        status="success",
        token_usage=ExtractTokenUsage(**usage_dict),
    )


async def attempt_recovery(
    url: str,
    *,
    error: Exception,
    processing_prompt: str | None,
    output_language: str,
    output_detail: str,
    recovery_attempts: list[str],
    last_fetch=None,
) -> ExtractSuccess | None:
    """Parse/AI recovery only — fetch escalation handled by IntelligenceOrchestrator."""
    safe_prompt = normalize_processing_prompt(processing_prompt)

    if isinstance(error, (ExtractionFailedError, ContentQualityError)) and last_fetch is not None:
        if last_fetch.method == "playwright":
            return None
        recovery_attempts.append("解析/质量失败，由智能路由再次尝试浏览器抓取")
        try:
            fetch = await get_orchestrator().fetch(url)
            return await complete_from_fetch(
                fetch,
                processing_prompt=safe_prompt,
                output_language=output_language,
                output_detail=output_detail,
            )
        except Exception as e:
            logger.warning("parse recovery via orchestrator failed: %s", e)
            recovery_attempts.append(f"二次抓取未成功：{e}")
            return None

    if isinstance(error, SummarizationError) and error.code == "ai_timeout":
        recovery_attempts.append("摘要超时后重试一次")
        if last_fetch:
            try:
                return await complete_from_fetch(
                    last_fetch,
                    processing_prompt=safe_prompt,
                    output_language=output_language,
                    output_detail=output_detail,
                )
            except Exception:
                pass

    if isinstance(error, FetchError):
        return None

    return None


def cache_and_return_success(
    url: str,
    safe_prompt: str | None,
    lang: str,
    detail: str,
    result: ExtractSuccess,
) -> ExtractSuccess:
    if len((result.content or "").strip()) >= 120:
        key = cache_key(url, safe_prompt, lang, detail)
        cache.set(key, result)
    return result
