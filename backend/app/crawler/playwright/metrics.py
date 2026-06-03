import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from app.crawler.types import CrawlTimings

logger = logging.getLogger(__name__)


class CrawlMetrics:
    def __init__(self, url: str) -> None:
        self.url = url
        self.timings = CrawlTimings()
        self.retry_count = 0
        self._started = time.perf_counter()

    def finish(self) -> CrawlTimings:
        self.timings.total_ms = (time.perf_counter() - self._started) * 1000
        return self.timings

    def log_success(self, *, html_len: int, method: str) -> None:
        t = self.finish()
        logger.info(
            "crawl_ok url=%s method=%s html_len=%d retries=%d timings=%s",
            self.url,
            method,
            html_len,
            self.retry_count,
            t.as_dict(),
        )

    def log_failure(self, *, code: str, message: str) -> None:
        t = self.finish()
        logger.warning(
            "crawl_fail url=%s code=%s retries=%d timings=%s msg=%s",
            self.url,
            code,
            self.retry_count,
            t.as_dict(),
            message[:200],
        )


@asynccontextmanager
async def timed_phase(
    metrics: CrawlMetrics,
    field: str,
) -> AsyncIterator[None]:
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = (time.perf_counter() - start) * 1000
        setattr(metrics.timings, field, getattr(metrics.timings, field) + elapsed)
