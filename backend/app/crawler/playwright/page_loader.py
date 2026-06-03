"""Content-first Playwright loading — minimal extractable rendering."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from playwright.async_api import Page, TimeoutError as PlaywrightTimeout

from app.config import settings
from app.crawler.playwright.content_extractable import (
    LIVE_EXTRACTABLE_JS,
    is_content_extractable,
)
from app.crawler.playwright.metrics import CrawlMetrics, timed_phase

logger = logging.getLogger(__name__)

EARLY_SELECTORS: tuple[str, ...] = (
    "main",
    "article",
    "[role='main']",
    "#app",
    "#App",
    "#root",
    ".content",
    "#content",
    ".main-content",
)

SPLASH_DISMISS_SELECTORS: tuple[str, ...] = (
    "[aria-label='Close']",
    "[aria-label='close']",
    "button:has-text('✕')",
)


@dataclass
class ContentFirstTrace:
    url: str = ""
    domcontentloaded_ms: float = 0.0
    selector_found_ms: float = 0.0
    content_extractable: bool = False
    early_exit: bool = False
    networkidle_skipped: bool = True
    blocked_resources: int = 0
    dom_timeout_partial: bool = False
    stage_reached: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "domcontentloaded_ms": round(self.domcontentloaded_ms, 1),
            "selector_found_ms": round(self.selector_found_ms, 1),
            "content_extractable": self.content_extractable,
            "early_exit": self.early_exit,
            "networkidle_skipped": self.networkidle_skipped,
            "blocked_resources": self.blocked_resources,
            "dom_timeout_partial": self.dom_timeout_partial,
            "stage_reached": self.stage_reached,
        }


def configure_page_timeouts(page: Page) -> None:
    """Stage budgets — not monolithic 45s navigation."""
    dom_ms = int(settings.playwright_dom_timeout_sec * 1000)
    page.set_default_timeout(dom_ms + int(settings.playwright_selector_timeout_sec * 1000))
    page.set_default_navigation_timeout(dom_ms)


async def content_first_load(
    page: Page,
    url: str,
    metrics: CrawlMetrics,
    *,
    blocked_count: int = 0,
) -> tuple[int, ContentFirstTrace]:
    """Navigate with staged budgets; exit as soon as content is extractable."""
    trace = ContentFirstTrace(url=url, blocked_resources=blocked_count)
    status = 200
    dom_ms = int(settings.playwright_dom_timeout_sec * 1000)

    t_dom = time.perf_counter()
    async with timed_phase(metrics, "navigation_ms"):
        loaded = False
        for wait_until in ("commit", "domcontentloaded"):
            try:
                resp = await page.goto(
                    url,
                    wait_until=wait_until,
                    timeout=dom_ms,
                )
                status = resp.status if resp else 200
                trace.stage_reached = wait_until
                loaded = True
                break
            except PlaywrightTimeout:
                logger.debug(
                    "content_first goto %s timeout wait_until=%s url=%s",
                    wait_until,
                    wait_until,
                    url,
                )
                continue
        if not loaded:
            trace.dom_timeout_partial = True
            trace.stage_reached = "dom_timeout_partial"
            logger.info("content_first dom timeout (partial ok) url=%s", url)

    trace.domcontentloaded_ms = (time.perf_counter() - t_dom) * 1000

    await _dismiss_splash_overlays(page)

    if await _try_early_exit(page, trace, stage="post_dom"):
        return status, trace

    # Vue/React/Wix hydration poll (≤5s) before selector stage
    for _ in range(10):
        if await _live_extractable(page):
            trace.stage_reached = "hydration_poll"
            return await _finalize(page, trace, status, stage="hydration_poll")
        await asyncio.sleep(0.5)

    selector_ms = int(settings.playwright_selector_timeout_sec * 1000)
    per_sel = max(800, selector_ms // max(len(EARLY_SELECTORS), 1))
    t_sel = time.perf_counter()

    async with timed_phase(metrics, "content_wait_ms"):
        for selector in EARLY_SELECTORS:
            try:
                await page.wait_for_selector(selector, timeout=per_sel)
                trace.selector_found_ms = (time.perf_counter() - t_sel) * 1000
                trace.stage_reached = f"selector:{selector}"
                if await _live_extractable(page):
                    return await _finalize(page, trace, status, stage="selector_live")
                html = await page.content()
                if is_content_extractable(html):
                    return await _finalize(page, trace, status, stage="selector_html")
            except PlaywrightTimeout:
                continue
            except Exception:
                continue

    extract_ms = int(settings.playwright_extract_timeout_sec * 1000)
    async with timed_phase(metrics, "content_wait_ms"):
        try:
            await page.wait_for_function(
                LIVE_EXTRACTABLE_JS,
                timeout=extract_ms,
            )
            trace.stage_reached = "extract_wait"
            return await _finalize(page, trace, status, stage="extract_wait")
        except PlaywrightTimeout:
            pass

    if await _try_early_exit(page, trace, stage="post_extract"):
        return status, trace

    retry_ms = int(settings.playwright_optional_retry_sec * 1000)
    async with timed_phase(metrics, "content_wait_ms"):
        try:
            await page.wait_for_function(
                LIVE_EXTRACTABLE_JS,
                timeout=retry_ms,
            )
            trace.stage_reached = "optional_retry"
            return await _finalize(page, trace, status, stage="optional_retry")
        except PlaywrightTimeout:
            pass

    html = await page.content()
    trace.blocked_resources = blocked_count
    if not is_content_extractable(html):
        trace.stage_reached = "await_hydration"
        for _ in range(16):
            await asyncio.sleep(0.5)
            if await _live_extractable(page):
                trace.stage_reached = "hydration_late"
                return await _finalize(page, trace, status, stage="hydration_late")
            html = await page.content()
            if is_content_extractable(html):
                trace.content_extractable = True
                trace.early_exit = True
                trace.stage_reached = "hydration_late_html"
                logger.info("content_first_trace %s", trace.to_dict())
                return status, trace

    trace.content_extractable = is_content_extractable(html)
    trace.stage_reached = "exhausted"
    logger.info("content_first_trace %s", trace.to_dict())
    return status, trace


async def _try_early_exit(page: Page, trace: ContentFirstTrace, *, stage: str) -> bool:
    if await _live_extractable(page):
        trace.stage_reached = stage
        trace.content_extractable = True
        trace.early_exit = True
        logger.info("content_first early_exit live stage=%s url=%s", stage, trace.url)
        logger.info("content_first_trace %s", trace.to_dict())
        return True
    html = await page.content()
    if is_content_extractable(html):
        trace.stage_reached = stage
        trace.content_extractable = True
        trace.early_exit = True
        logger.info("content_first early_exit html stage=%s url=%s", stage, trace.url)
        logger.info("content_first_trace %s", trace.to_dict())
        return True
    return False


async def _finalize(
    page: Page,
    trace: ContentFirstTrace,
    status: int,
    *,
    stage: str,
) -> tuple[int, ContentFirstTrace]:
    trace.content_extractable = True
    trace.early_exit = True
    trace.stage_reached = stage
    logger.info("content_first_trace %s", trace.to_dict())
    return status, trace


async def _dismiss_splash_overlays(page: Page) -> None:
    """Close intro overlays (Wix splash, promo modals) so body text can load."""
    for selector in SPLASH_DISMISS_SELECTORS:
        try:
            locator = page.locator(selector).first
            if await locator.count() > 0 and await locator.is_visible():
                await locator.click(timeout=1500)
                await asyncio.sleep(0.4)
        except Exception:
            continue


async def _live_extractable(page: Page) -> bool:
    try:
        return bool(await page.evaluate(LIVE_EXTRACTABLE_JS))
    except Exception:
        return False


async def extract_page_title(page: Page) -> str:
    try:
        title = await page.title()
        return (title or "").strip()[:500]
    except Exception:
        return ""
