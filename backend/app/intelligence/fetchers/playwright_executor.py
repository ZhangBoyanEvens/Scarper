"""Playwright plugin executor — no routing logic."""

from app.crawler.playwright.crawler import PlaywrightCrawler
from app.crawler.types import FetchResult
from app.intelligence.types import FetchStrategy


class PlaywrightExecutor:
    """Executes browser strategies only when instructed by the orchestrator."""

    def __init__(self) -> None:
        self._crawler = PlaywrightCrawler()

    async def execute(self, url: str, strategy: FetchStrategy) -> FetchResult:
        if strategy == FetchStrategy.STEALTH_BROWSER:
            return await self._crawler.fetch(url)
        if strategy == FetchStrategy.SPA_BROWSER:
            return await self._crawler.fetch(url)
        raise ValueError(f"Not a browser strategy: {strategy}")

    async def close(self) -> None:
        await self._crawler.close()
