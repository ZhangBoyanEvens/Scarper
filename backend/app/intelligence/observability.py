"""Decision logging and Playwright usage tracking per domain."""

import logging
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import AsyncIterator
from urllib.parse import urlparse

from app.config import settings
from app.intelligence.types import DecisionTrace, StageTiming

logger = logging.getLogger(__name__)


class PlaywrightUsageTracker:
    """Track Playwright ratio per domain to enforce cost policy."""

    def __init__(self) -> None:
        self._total: dict[str, int] = defaultdict(int)
        self._playwright: dict[str, int] = defaultdict(int)

    def record(self, url: str, used_playwright: bool) -> None:
        domain = urlparse(url).netloc.lower() or "unknown"
        self._total[domain] += 1
        if used_playwright:
            self._playwright[domain] += 1

    def domain_ratio(self, url: str) -> float:
        domain = urlparse(url).netloc.lower() or "unknown"
        total = self._total[domain]
        if total == 0:
            return 0.0
        return self._playwright[domain] / total

    def should_block_playwright(self, url: str) -> bool:
        if self.domain_ratio(url) <= settings.intelligence_max_playwright_domain_ratio:
            return False
        logger.info(
            "playwright_budget_exceeded domain=%s ratio=%.2f limit=%.2f",
            urlparse(url).netloc,
            self.domain_ratio(url),
            settings.intelligence_max_playwright_domain_ratio,
        )
        return True


_tracker = PlaywrightUsageTracker()


def get_usage_tracker() -> PlaywrightUsageTracker:
    return _tracker


def log_decision_trace(trace: DecisionTrace) -> None:
    logger.info("intelligence_decision %s", trace.to_dict())


@asynccontextmanager
async def timed_stage(
    trace: DecisionTrace,
    stage: str,
    detail: str = "",
) -> AsyncIterator[None]:
    start = time.perf_counter()
    success = True
    try:
        yield
    except Exception:
        success = False
        raise
    finally:
        elapsed = (time.perf_counter() - start) * 1000
        trace.stage_timings.append(
            StageTiming(stage=stage, duration_ms=elapsed, success=success, detail=detail),
        )
