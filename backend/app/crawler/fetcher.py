import asyncio
import logging
import re
import httpx

from app.config import settings
from app.crawler.playwright_pool import PlaywrightFetcher
from app.crawler.types import FetchError, FetchResult
from app.crawler.url_validator import UrlValidationError, normalize_url

logger = logging.getLogger(__name__)

# Signals that static HTML is likely insufficient
SPA_HINTS = re.compile(
    r"<noscript[^>]*>[\s\S]*?(enable javascript|requires javascript)",
    re.I,
)
EMPTY_APP_ROOT = re.compile(
    r'<div[^>]+id=["\'](root|app|__next)["\'][^>]*>\s*</div>',
    re.I,
)

DANGEROUS_CONTENT_TYPES = re.compile(
    r"application/(octet-stream|zip|pdf|x-msdownload|javascript)|"
    r"image/|video/|audio/",
    re.I,
)


class PageFetcher:
    def __init__(self) -> None:
        self._playwright: PlaywrightFetcher | None = None

    async def fetch(self, raw_url: str) -> FetchResult:
        url = normalize_url(raw_url)
        last_error: Exception | None = None

        for attempt in range(settings.crawl_retries + 1):
            try:
                result = await self._fetch_with_fallback(url)
                if result.html.strip():
                    return result
                raise FetchError("页面内容为空", "empty_page")
            except UrlValidationError:
                raise
            except FetchError as e:
                last_error = e
                logger.warning("fetch attempt %s failed: %s", attempt + 1, e)
            except Exception as e:
                last_error = e
                logger.exception("unexpected fetch error")

        msg = str(last_error) if last_error else "抓取失败"
        code = getattr(last_error, "code", "fetch_failed")
        raise FetchError(msg, code)

    async def _fetch_with_fallback(self, url: str) -> FetchResult:
        try:
            static = await self._fetch_httpx(url)
            if _needs_javascript(static.html):
                logger.info("JS rendering likely required for %s", url)
                return await self._fetch_playwright(url)
            return static
        except FetchError as e:
            if e.code in ("cloudflare", "js_required", "non_html"):
                return await self._fetch_playwright(url)
            raise

    def _playwright_allowed(self) -> bool:
        return settings.playwright_enabled

    async def _fetch_httpx(self, url: str) -> FetchResult:
        headers = {
            "User-Agent": (
                "ScarperBot/1.0 (+https://github.com/scarper; secure extractor)"
            ),
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN,zh;q=0.8",
        }
        timeout = httpx.Timeout(settings.fetch_timeout_sec)

        async with httpx.AsyncClient(
            follow_redirects=True,
            max_redirects=settings.max_redirects,
            timeout=timeout,
        ) as client:
            try:
                resp = await client.get(url, headers=headers)
            except httpx.TooManyRedirects:
                raise FetchError("重定向次数过多", "too_many_redirects")
            except httpx.TimeoutException:
                raise FetchError("请求超时", "timeout")
            except httpx.HTTPError as e:
                raise FetchError(f"网络错误: {e}", "network_error")

        ctype = resp.headers.get("content-type", "")
        if DANGEROUS_CONTENT_TYPES.search(ctype):
            raise FetchError("不支持的响应类型", "blocked_content_type")
        if resp.status_code >= 400:
            if resp.status_code in (403, 503) and _looks_like_cloudflare(resp.text):
                raise FetchError("站点防护拦截（Cloudflare 等）", "cloudflare")
            raise FetchError(f"HTTP {resp.status_code}", "http_error")

        if "text/html" not in ctype.lower() and "application/xhtml" not in ctype.lower():
            raise FetchError("响应不是 HTML 页面", "non_html")

        content = _read_limited(resp.content)
        html = content.decode(resp.encoding or "utf-8", errors="replace")
        final_url = str(resp.url)

        return FetchResult(
            url=final_url,
            html=html,
            method="httpx",
            status_code=resp.status_code,
        )

    async def _fetch_playwright(self, url: str) -> FetchResult:
        if not self._playwright_allowed():
            raise FetchError(
                "当前部署未启用浏览器渲染（Playwright），仅支持静态 HTML 页面",
                "playwright_disabled",
            )
        if self._playwright is None:
            self._playwright = PlaywrightFetcher()
        return await self._playwright.fetch(url)

    async def close(self) -> None:
        if self._playwright:
            await self._playwright.close()


def _read_limited(data: bytes) -> bytes:
    if len(data) > settings.max_response_bytes:
        raise FetchError("页面体积超过限制", "page_too_large")
    return data


def _needs_javascript(html: str) -> bool:
    text = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
    visible = re.sub(r"<[^>]+>", " ", text)
    visible = re.sub(r"\s+", " ", visible).strip()
    if len(visible) < 200:
        return True
    if SPA_HINTS.search(html):
        return True
    if EMPTY_APP_ROOT.search(html):
        return True
    return False


def _looks_like_cloudflare(html: str) -> bool:
    markers = (
        "cf-browser-verification",
        "challenge-platform",
        "Just a moment",
        "Attention Required! | Cloudflare",
    )
    sample = html[:8000]
    return any(m in sample for m in markers)
