"""Cost-aware escalation — Playwright only when confidence model allows."""

from app.config import settings
from app.intelligence.observability import get_usage_tracker
from app.intelligence.types import FetchStrategy, PreflightConfidence, URLClass

COST_ORDER: list[FetchStrategy] = [
    FetchStrategy.HTTP_ONLY,
    FetchStrategy.RETRY_HTTP,
    FetchStrategy.API_FETCH,
    FetchStrategy.FILE_FETCH,
    FetchStrategy.SPA_BROWSER,
    FetchStrategy.STEALTH_BROWSER,
]


def primary_strategy(url_class: URLClass, url: str) -> FetchStrategy:
    """Legacy helper — prefer routing_probability.select_strategy_decision."""
    return {
        URLClass.STATIC_ARTICLE: FetchStrategy.HTTP_ONLY,
        URLClass.SHORT_PAGE: FetchStrategy.HTTP_ONLY,
        URLClass.API_LIKE: FetchStrategy.API_FETCH,
        URLClass.SPA_APP: FetchStrategy.HTTP_ONLY,
        URLClass.BLOCKED: FetchStrategy.RETRY_HTTP,
        URLClass.FILE: FetchStrategy.FILE_FETCH,
        URLClass.UNKNOWN: FetchStrategy.HTTP_ONLY,
    }[url_class]


def escalation_chain(
    url_class: URLClass,
    url: str,
    *,
    playwright_allowed: bool | None = None,
    preflight_confidence: PreflightConfidence | None = None,
) -> list[FetchStrategy]:
    """HTTP-first chain; browser only when explicitly allowed by confidence."""
    pw = (
        playwright_allowed
        if playwright_allowed is not None
        else bool(preflight_confidence and preflight_confidence.allow_playwright)
    )
    if pw is False and settings.playwright_enabled:
        pw = False
    elif playwright_allowed is None and settings.playwright_enabled:
        pw = bool(preflight_confidence and preflight_confidence.allow_playwright)

    if not settings.playwright_enabled:
        pw = False

    tracker = get_usage_tracker()
    if pw and tracker.should_block_playwright(url):
        pw = False

    if url_class == URLClass.SHORT_PAGE:
        return [FetchStrategy.HTTP_ONLY, FetchStrategy.RETRY_HTTP]

    if url_class == URLClass.FILE:
        return [FetchStrategy.FILE_FETCH]

    chain: list[FetchStrategy] = [FetchStrategy.HTTP_ONLY, FetchStrategy.RETRY_HTTP]

    if url_class in (URLClass.API_LIKE, URLClass.SPA_APP, URLClass.UNKNOWN):
        chain.append(FetchStrategy.API_FETCH)
    elif url_class == URLClass.STATIC_ARTICLE:
        chain.append(FetchStrategy.API_FETCH)

    if pw and url_class in (URLClass.SPA_APP, URLClass.UNKNOWN):
        chain.extend([FetchStrategy.SPA_BROWSER, FetchStrategy.STEALTH_BROWSER])
    elif pw and url_class == URLClass.BLOCKED:
        if preflight_confidence and preflight_confidence.confidence_score < 0.35:
            chain.append(FetchStrategy.SPA_BROWSER)

    seen: set[FetchStrategy] = set()
    ordered: list[FetchStrategy] = []
    for s in chain:
        if s not in seen:
            seen.add(s)
            ordered.append(s)
    return ordered


def cost_tier(strategy: FetchStrategy) -> str:
    if strategy in (FetchStrategy.HTTP_ONLY, FetchStrategy.RETRY_HTTP):
        return "low"
    if strategy in (FetchStrategy.API_FETCH, FetchStrategy.FILE_FETCH):
        return "medium"
    return "high"
