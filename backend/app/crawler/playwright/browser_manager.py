"""Singleton browser + pooled contexts — no lock re-entry deadlock."""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from playwright.async_api import Browser, BrowserContext, async_playwright

from app.config import settings
from app.crawler.playwright.stealth import apply_stealth, context_options

logger = logging.getLogger(__name__)

_BROWSER_LAUNCH_TIMEOUT_SEC = 25.0


def _ensure_windows_proactor_loop() -> None:
    """Playwright subprocess launch needs ProactorEventLoop on Windows."""
    if sys.platform != "win32":
        return
    policy = asyncio.get_event_loop_policy()
    if not isinstance(policy, asyncio.WindowsProactorEventLoopPolicy):
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    loop = asyncio.get_running_loop()
    if not isinstance(loop, asyncio.ProactorEventLoop):
        raise RuntimeError(
            "Playwright on Windows requires ProactorEventLoop; "
            f"restart via `python run_dev.py` (current={type(loop).__name__})"
        )


class BrowserManager:
    """Reuses one Chromium instance and a small pool of browser contexts."""

    _instance: "BrowserManager | None" = None

    def __init__(self) -> None:
        self._playwright = None
        self._browser: Browser | None = None
        self._pool: asyncio.Queue[BrowserContext] = asyncio.Queue()
        self._pool_size = 0
        self._browser_lock = asyncio.Lock()
        self._pool_lock = asyncio.Lock()
        self._storage_path = self._resolve_storage_path()
        self._closed = False

    @classmethod
    def shared(cls) -> "BrowserManager":
        if cls._instance is None:
            cls._instance = BrowserManager()
        return cls._instance

    def _resolve_storage_path(self) -> Path:
        raw = settings.playwright_storage_state_path.strip()
        if raw:
            return Path(raw)
        return Path(settings.playwright_data_dir) / "storage_state.json"

    async def _ensure_browser(self) -> Browser:
        if self._browser and self._browser.is_connected():
            return self._browser

        async with self._browser_lock:
            if self._browser and self._browser.is_connected():
                return self._browser

            if self._playwright:
                try:
                    await self._playwright.stop()
                except Exception:
                    pass

            async def _launch() -> Browser:
                _ensure_windows_proactor_loop()
                self._playwright = await async_playwright().start()
                return await self._playwright.chromium.launch(
                    headless=settings.playwright_headless,
                    args=[
                        "--disable-blink-features=AutomationControlled",
                        "--disable-dev-shm-usage",
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-infobars",
                    ],
                )

            try:
                self._browser = await asyncio.wait_for(
                    _launch(),
                    timeout=_BROWSER_LAUNCH_TIMEOUT_SEC,
                )
            except asyncio.TimeoutError as e:
                raise RuntimeError("Playwright 浏览器启动超时") from e

            logger.info(
                "Playwright browser launched (headless=%s)",
                settings.playwright_headless,
            )
            return self._browser

    async def _new_context(self) -> BrowserContext:
        browser = await self._ensure_browser()
        storage = None
        if settings.playwright_persistent_context and self._storage_path.is_file():
            try:
                storage = str(self._storage_path)
            except Exception:
                storage = None
        ctx = await browser.new_context(**context_options(storage_state=storage))
        await apply_stealth(ctx)
        return ctx

    async def _acquire_context(self) -> BrowserContext:
        if self._closed:
            raise RuntimeError("BrowserManager is closed")

        try:
            return self._pool.get_nowait()
        except asyncio.QueueEmpty:
            pass

        async with self._pool_lock:
            if self._pool_size < settings.playwright_context_pool_size:
                ctx = await self._new_context()
                self._pool_size += 1
                return ctx

        try:
            return await asyncio.wait_for(
                self._pool.get(),
                timeout=settings.playwright_pool_acquire_timeout_sec,
            )
        except asyncio.TimeoutError as e:
            raise RuntimeError("浏览器池繁忙，请稍后重试") from e

    async def _release_context(self, ctx: BrowserContext) -> None:
        if self._closed:
            await self._safe_close_context(ctx)
            return

        if settings.playwright_persistent_context:
            try:
                self._storage_path.parent.mkdir(parents=True, exist_ok=True)
                await ctx.storage_state(path=str(self._storage_path))
            except Exception:
                logger.debug("storage_state save skipped", exc_info=True)

        for page in ctx.pages:
            try:
                await page.close()
            except Exception:
                pass

        try:
            self._pool.put_nowait(ctx)
        except asyncio.QueueFull:
            await self._safe_close_context(ctx)
            async with self._pool_lock:
                self._pool_size = max(0, self._pool_size - 1)

    @asynccontextmanager
    async def page_context(self) -> AsyncIterator[BrowserContext]:
        ctx = await self._acquire_context()
        try:
            yield ctx
        finally:
            await self._release_context(ctx)

    async def _safe_close_context(self, ctx: BrowserContext) -> None:
        try:
            await ctx.close()
        except Exception:
            pass

    async def close(self) -> None:
        self._closed = True
        while not self._pool.empty():
            ctx = await self._pool.get()
            await self._safe_close_context(ctx)
        self._pool_size = 0

        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
            self._browser = None

        if self._playwright:
            try:
                await self._playwright.stop()
            except Exception:
                pass
            self._playwright = None

        logger.info("Playwright browser manager shut down")

    @classmethod
    async def shutdown_shared(cls) -> None:
        if cls._instance:
            await cls._instance.close()
            cls._instance = None
