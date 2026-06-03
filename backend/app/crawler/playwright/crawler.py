"""Production Playwright crawl — content-first minimal rendering."""

import logging

from playwright.async_api import TimeoutError as PlaywrightTimeout

from app.config import settings
from app.utils.timeout import OperationTimeoutError, run_with_timeout
from app.crawler.failure_detection import analyze_html, raise_if_failure
from app.crawler.playwright.browser_manager import BrowserManager
from app.crawler.playwright.content_extractable import is_content_extractable
from app.crawler.playwright.metrics import CrawlMetrics
from app.crawler.playwright.page_loader import (
    configure_page_timeouts,
    content_first_load,
    extract_page_title,
)
from app.crawler.playwright.resource_policy import ResourceBlockCounter, setup_routing
from app.crawler.playwright.retry_manager import retry_async
from app.crawler.types import FetchError, FetchResult
from app.sanitizer.html_cleaner import clean_html_minimal

logger = logging.getLogger(__name__)


class PlaywrightCrawler:
    """Content-first browser extract — exit when body text is available."""

    def __init__(self) -> None:
        self._browser_mgr = BrowserManager.shared()

    async def fetch(self, url: str) -> FetchResult:
        metrics = CrawlMetrics(url)

        async def _attempt() -> FetchResult:
            return await self._fetch_once(url, metrics)

        retry_count = 0

        def _on_retry(n: int, _e: Exception) -> None:
            nonlocal retry_count
            retry_count = n

        try:
            result = await run_with_timeout(
                retry_async(_attempt, url=url, on_retry=_on_retry),
                settings.playwright_total_timeout_sec,
                operation="浏览器抓取",
            )
            result.retry_count = retry_count
            metrics.retry_count = retry_count
            metrics.log_success(html_len=len(result.html), method="playwright")
            return result
        except OperationTimeoutError as e:
            metrics.log_failure(code="timeout", message=str(e))
            raise FetchError(str(e), "timeout") from e
        except FetchError as e:
            metrics.log_failure(code=e.code, message=str(e))
            raise
        except Exception as e:
            metrics.log_failure(code="playwright_error", message=str(e))
            if "timeout" in str(e).lower():
                raise FetchError("Playwright 加载超时", "timeout") from e
            raise FetchError(f"动态页面抓取失败: {e}", "playwright_error") from e

    async def _fetch_once(self, url: str, metrics: CrawlMetrics) -> FetchResult:
        block_counter = ResourceBlockCounter()

        async with self._browser_mgr.page_context() as context:
            page = await context.new_page()
            try:
                configure_page_timeouts(page)
                await setup_routing(page, block_counter)

                status, cf_trace = await content_first_load(
                    page,
                    url,
                    metrics,
                    blocked_count=block_counter.count,
                )
                cf_trace.blocked_resources = block_counter.count

                html = await page.content()
                final_url = page.url
                title = await extract_page_title(page)
                html = clean_html_minimal(html)

                if not is_content_extractable(html):
                    raise FetchError(
                        "浏览器渲染后正文仍不足（内容优先模式）",
                        "js_required",
                    )

                analysis = analyze_html(
                    html,
                    final_url=final_url,
                    requested_url=url,
                    status_code=status,
                )
                raise_if_failure(analysis)

                timings = metrics.finish()
                logger.info("playwright_content_first %s", cf_trace.to_dict())

                return FetchResult(
                    url=final_url,
                    html=html,
                    method="playwright",
                    status_code=status,
                    success=True,
                    title=title,
                    status="ok",
                    error=None,
                    timings=timings,
                    retry_count=metrics.retry_count,
                    meta={
                        "fetch_path": "playwright_content_first",
                        "content_first_trace": cf_trace.to_dict(),
                    },
                )
            except FetchError:
                raise
            except PlaywrightTimeout as e:
                raise FetchError("Playwright 加载超时", "timeout") from e
            finally:
                try:
                    await page.close()
                except Exception:
                    pass

    async def close(self) -> None:
        await BrowserManager.shutdown_shared()
