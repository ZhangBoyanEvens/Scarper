import logging

from app.ai.crawl_recovery import CrawlRecovery
from app.ai.errors import SummarizationError
from app.config import settings
from app.models.schemas import StructuredPage
from app.parser.content_extractor import extract_structured
from app.sanitizer.html_cleaner import clean_html, clean_html_minimal

logger = logging.getLogger(__name__)

_recovery = CrawlRecovery()


class ExtractionFailedError(Exception):
    """All rule-based and optional AI recovery paths failed."""


class ContentQualityError(ExtractionFailedError):
    """Extracted text failed quality gates (SPA shell / too short)."""

    def __init__(self, message: str, reason: str = "quality_low") -> None:
        super().__init__(message)
        self.reason = reason
        self.code = "content_quality_low"


async def extract_page_content(html: str, url: str) -> StructuredPage:
    errors: list[str] = []

    for label, cleaner in (
        ("standard", clean_html),
        ("minimal", clean_html_minimal),
    ):
        try:
            cleaned = cleaner(html)
            page = extract_structured(cleaned, url)
            if (page.main_content or "").strip():
                return page
            errors.append(f"{label}: empty main_content")
        except Exception as e:
            msg = f"{label}: {e}"
            errors.append(msg)
            logger.warning("page extract %s failed for %s: %s", label, url, e)

    if not settings.ai_crawl_recovery_enabled:
        raise ExtractionFailedError("; ".join(errors))

    try:
        return await _recovery.recover(
            html,
            url,
            failure_reason="; ".join(errors),
        )
    except SummarizationError:
        raise
    except Exception as e:
        errors.append(f"ai_recovery: {e}")
        raise ExtractionFailedError("; ".join(errors)) from e
