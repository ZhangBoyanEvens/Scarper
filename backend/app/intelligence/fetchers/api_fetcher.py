"""Extract structured content from embedded JSON / API endpoints in HTML."""

import json
import logging
import re
from html import escape
import httpx

from app.config import settings
from app.crawler.types import CrawlTimings, FetchError, FetchResult

logger = logging.getLogger(__name__)

_JSON_LD_RE = re.compile(
    r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',
    re.I,
)
_NEXT_DATA_RE = re.compile(r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>([\s\S]*?)</script>', re.I)
_INITIAL_STATE_RE = re.compile(
    r"window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;",
    re.I,
)


class ApiFetcher:
    """Stateless executor: given URL + optional HTML snippet, try API-first extraction."""

    async def fetch(self, url: str, html_hint: str = "") -> FetchResult:
        if html_hint:
            payload = self._extract_from_html(html_hint, url)
            if payload:
                return self._result_from_payload(url, payload, status_code=200)

        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=httpx.Timeout(settings.fetch_timeout_sec),
        ) as client:
            try:
                resp = await client.get(
                    url,
                    headers={"Accept": "application/json,text/html;q=0.9"},
                )
            except httpx.HTTPError as e:
                raise FetchError(f"API 路径网络错误: {e}", "network_error") from e

        ctype = resp.headers.get("content-type", "").lower()
        if "json" in ctype:
            try:
                data = resp.json()
            except json.JSONDecodeError:
                raise FetchError("JSON 解析失败", "non_html")
            return self._result_from_payload(str(resp.url), data, resp.status_code)

        if resp.status_code >= 400:
            raise FetchError(f"HTTP {resp.status_code}", "http_error")

        text = resp.text
        payload = self._extract_from_html(text, str(resp.url))
        if not payload:
            raise FetchError("未检测到可用 API/嵌入 JSON", "js_required")
        return self._result_from_payload(str(resp.url), payload, resp.status_code)

    def _extract_from_html(self, html: str, base_url: str) -> dict | list | None:
        for pattern, parser in (
            (_JSON_LD_RE, self._parse_json_safe),
            (_NEXT_DATA_RE, self._parse_json_safe),
            (_INITIAL_STATE_RE, self._parse_json_safe),
        ):
            m = pattern.search(html)
            if m:
                data = parser(m.group(1))
                if data:
                    return data
        return None

    @staticmethod
    def _parse_json_safe(raw: str) -> dict | list | None:
        try:
            return json.loads(raw.strip())
        except json.JSONDecodeError:
            return None

    def _result_from_payload(self, url: str, payload: object, status_code: int) -> FetchResult:
        text = json.dumps(payload, ensure_ascii=False, indent=0)
        if len(text) > settings.max_response_bytes:
            text = text[: settings.max_response_bytes] + "…"
        html = (
            f"<html><head><title>API Extract</title></head>"
            f"<body><article><pre>{escape(text)}</pre></article></body></html>"
        )
        return FetchResult(
            url=url,
            html=html,
            method="httpx",
            status_code=status_code,
            timings=CrawlTimings(),
            meta={"source": "api_fetch", "api_extract": True},
        )
