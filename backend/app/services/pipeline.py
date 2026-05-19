import logging

from app.ai.summarizer import AISummarizer, SummarizationError, normalize_processing_prompt
from app.crawler.fetcher import PageFetcher
from app.crawler.types import FetchError
from app.crawler.url_validator import UrlValidationError, normalize_url
from app.models.schemas import ExtractError, ExtractSuccess
from app.parser.content_extractor import extract_structured, structured_to_llm_payload
from app.sanitizer.html_cleaner import clean_html
from app.services.cache import cache, cache_key

logger = logging.getLogger(__name__)

_fetcher = PageFetcher()
_ai = AISummarizer()


async def run_extraction(
    raw_url: str,
    processing_prompt: str | None = None,
    output_language: str = "zh",
    output_detail: str = "concise",
) -> ExtractSuccess | ExtractError:
    try:
        url = normalize_url(raw_url)
    except UrlValidationError as e:
        return ExtractError(url=raw_url, error=str(e), error_code=e.code)

    safe_prompt = normalize_processing_prompt(processing_prompt)
    lang = output_language if output_language in ("zh", "original", "en") else "zh"
    detail = output_detail if output_detail in ("detailed", "concise") else "concise"
    key = cache_key(url, safe_prompt, lang, detail)
    cached = cache.get(key)
    if cached:
        logger.info("cache hit for %s", url)
        return cached

    try:
        fetch = await _fetcher.fetch(url)
        cleaned = clean_html(fetch.html)
        structured = extract_structured(cleaned, fetch.url)
        llm_payload = structured_to_llm_payload(structured)

        ai_result = await _ai.summarize(
            llm_payload,
            fetch.url,
            processing_prompt=safe_prompt,
            output_language=lang,
            output_detail=detail,
        )

        result = ExtractSuccess(
            url=fetch.url,
            title=structured.title,
            summary=ai_result.get("summary", ""),
            key_points=ai_result.get("key_points", []),
            content=structured.main_content,
            detected_language=ai_result.get("detected_language", ""),
            status="success",
        )
        cache.set(key, result)
        return result

    except UrlValidationError as e:
        return ExtractError(url=raw_url, error=str(e), error_code=e.code)
    except FetchError as e:
        return ExtractError(url=raw_url, error=str(e), error_code=e.code)
    except SummarizationError as e:
        return ExtractError(url=raw_url, error=str(e), error_code=e.code)
    except Exception:
        logger.exception("pipeline failed for %s", raw_url)
        return ExtractError(
            url=raw_url,
            error="服务器处理失败，请稍后重试",
            error_code="internal_error",
        )


async def shutdown() -> None:
    await _fetcher.close()
