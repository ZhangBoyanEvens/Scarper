"""Legacy facade — delegates to IntelligenceOrchestrator."""

import logging

from app.intelligence.orchestrator import get_orchestrator
from app.crawler.types import FetchResult

logger = logging.getLogger(__name__)


class PageFetcher:
    """Backward-compatible entry; all routing lives in app.intelligence."""

    def __init__(self) -> None:
        self._orchestrator = get_orchestrator()

    async def fetch(self, raw_url: str) -> FetchResult:
        from app.crawler.url_validator import normalize_url

        url = normalize_url(raw_url)
        return await self._orchestrator.fetch(url)

    async def fetch_playwright_only(self, url: str) -> FetchResult:
        from app.crawler.url_validator import normalize_url
        from app.intelligence.types import FetchStrategy
        from app.config import settings

        if not settings.playwright_enabled:
            from app.crawler.types import FetchError

            raise FetchError(
                "当前部署未启用浏览器渲染（Playwright）",
                "playwright_disabled",
            )
        url = normalize_url(url)
        return await self._orchestrator.execute_strategy(
            FetchStrategy.SPA_BROWSER,
            url,
        )

    async def close(self) -> None:
        await self._orchestrator.close()
