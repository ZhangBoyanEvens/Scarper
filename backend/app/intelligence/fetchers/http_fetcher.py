"""HTTP-only fetcher (httpx). No routing decisions."""

import re

import httpx

from app.config import settings
from app.crawler.failure_detection import looks_like_cloudflare
from app.crawler.types import CrawlTimings, FetchError, FetchResult

DANGEROUS_CONTENT_TYPES = re.compile(
    r"application/(octet-stream|zip|pdf|x-msdownload|javascript)|"
    r"image/|video/|audio/",
    re.I,
)


class HttpFetcher:
    async def fetch(self, url: str) -> FetchResult:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
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
            if resp.status_code in (403, 503) and looks_like_cloudflare(resp.text):
                raise FetchError("站点防护拦截（Cloudflare 等）", "cloudflare")
            raise FetchError(f"HTTP {resp.status_code}", "http_error")

        if "text/html" not in ctype.lower() and "application/xhtml" not in ctype.lower():
            if "json" in ctype.lower():
                html = self._json_as_html(resp.text)
                return FetchResult(
                    url=str(resp.url),
                    html=html,
                    method="httpx",
                    status_code=resp.status_code,
                    timings=CrawlTimings(),
                    meta={"source": "json_response"},
                )
            raise FetchError("响应不是 HTML 页面", "non_html")

        content = resp.content
        if len(content) > settings.max_response_bytes:
            raise FetchError("页面体积超过限制", "page_too_large")

        html = content.decode(resp.encoding or "utf-8", errors="replace")
        return FetchResult(
            url=str(resp.url),
            html=html,
            method="httpx",
            status_code=resp.status_code,
            timings=CrawlTimings(),
        )

    @staticmethod
    def _json_as_html(text: str) -> str:
        return f"<html><body><pre class=\"json-body\">{text[: settings.max_response_bytes]}</pre></body></html>"
