"""Backward-compatible facade over the modular Playwright crawler."""

from app.crawler.playwright.crawler import PlaywrightCrawler


class PlaywrightFetcher:
    """Reuses browser pool via PlaywrightCrawler."""

    def __init__(self) -> None:
        self._crawler = PlaywrightCrawler()

    async def fetch(self, url: str):
        return await self._crawler.fetch(url)

    async def close(self) -> None:
        await self._crawler.close()
