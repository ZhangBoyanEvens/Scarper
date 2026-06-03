"""Aggressive resource blocking — keep only what renders SPA body text."""

import re
from dataclasses import dataclass
from urllib.parse import urlparse

from playwright.async_api import Page, Route

from app.config import settings

BLOCKED_RESOURCE_TYPES = frozenset(
    {
        "image",
        "media",
        "font",
        "websocket",
        "manifest",
        "other",
    },
)

TRACKER_HOST_PATTERNS = re.compile(
    r"(google-analytics|googletagmanager|googletag|doubleclick|facebook\.net|"
    r"connect\.facebook|hotjar|segment\.io|mixpanel|sentry\.io|adservice|adsystem|"
    r"taboola|outbrain|scorecardresearch|quantserve|gtag|googleadservices|"
    r"analytics|tracking|pixel|clarity\.ms|newrelic|datadoghq|fullstory|"
    r"optimizely|mouseflow|crazyegg|linkedin\.com/px|twitter\.com/i/ads)",
    re.I,
)

TRACKER_URL_PATTERNS = re.compile(
    r"(gtag|gtm\.js|fbevents|analytics\.js|hotjar|doubleclick|ads\.|/pixel|"
    r"facebook\.com/tr|collect\?|beacon|telemetry)",
    re.I,
)


@dataclass
class ResourceBlockCounter:
    count: int = 0

    def increment(self) -> None:
        self.count += 1


def _should_block_url(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return True
    if TRACKER_HOST_PATTERNS.search(host):
        return True
    if TRACKER_URL_PATTERNS.search(url):
        return True
    if re.search(r"\.(png|jpe?g|gif|webp|svg|ico|avif|woff2?|ttf|eot)(\?|$)", url, re.I):
        return True
    return False


async def setup_routing(
    page: Page,
    counter: ResourceBlockCounter | None = None,
) -> None:
    async def handler(route: Route) -> None:
        req = route.request
        rtype = req.resource_type

        if not req.url.startswith(("http://", "https://")):
            if counter:
                counter.increment()
            await route.abort()
            return

        if rtype in BLOCKED_RESOURCE_TYPES:
            if counter:
                counter.increment()
            await route.abort()
            return

        if _should_block_url(req.url):
            if counter:
                counter.increment()
            await route.abort()
            return

        await route.continue_()

    await page.route("**/*", handler)
