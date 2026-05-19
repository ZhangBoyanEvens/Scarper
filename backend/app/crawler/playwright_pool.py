import logging

from playwright.async_api import Browser, async_playwright

from app.config import settings
from app.crawler.types import FetchError, FetchResult

logger = logging.getLogger(__name__)


class PlaywrightFetcher:
    """Reuses a single browser; creates short-lived contexts per request."""

    def __init__(self) -> None:
        self._browser: Browser | None = None
        self._pw = None

    async def _ensure_browser(self) -> Browser:
        if self._browser is None:
            self._pw = await async_playwright().start()
            self._browser = await self._pw.chromium.launch(headless=True)
            logger.info("Playwright browser started")
        return self._browser

    async def fetch(self, url: str) -> FetchResult:
        browser = await self._ensure_browser()
        context = await browser.new_context(
            user_agent=(
                "ScarperBot/1.0 (+https://github.com/scarper; secure extractor)"
            ),
            java_script_enabled=True,
            ignore_https_errors=False,
        )
        page = await context.new_page()

        # Security: block file downloads and non-http(s) navigations
        async def _route_handler(route):
            req = route.request
            if req.resource_type in ("media", "font", "websocket"):
                await route.abort()
                return
            if req.url.startswith(("http://", "https://")):
                await route.continue_()
            else:
                await route.abort()

        await page.route("**/*", _route_handler)

        try:
            timeout_ms = int(settings.playwright_timeout_sec * 1000)
            resp = await page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=timeout_ms,
            )
            await page.wait_for_timeout(800)
            html = await page.content()
            status = resp.status if resp else 200
            final_url = page.url

            if status >= 400:
                raise FetchError(f"HTTP {status}", "http_error")

            return FetchResult(
                url=final_url,
                html=html,
                method="playwright",
                status_code=status,
            )
        except FetchError:
            raise
        except Exception as e:
            if "timeout" in str(e).lower():
                raise FetchError("Playwright 加载超时", "timeout")
            raise FetchError(f"动态页面抓取失败: {e}", "playwright_error")
        finally:
            await context.close()

    async def close(self) -> None:
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._pw:
            await self._pw.stop()
            self._pw = None
