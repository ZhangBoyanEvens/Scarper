import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import TypeVar

from app.config import settings
from app.crawler.types import FetchError

logger = logging.getLogger(__name__)

T = TypeVar("T")

RETRYABLE_CODES = frozenset(
    {
        "timeout",
        "playwright_error",
        "empty_page",
        "network_error",
        "fetch_failed",
    },
)


async def retry_async(
    operation: Callable[[], Awaitable[T]],
    *,
    url: str,
    max_attempts: int | None = None,
    is_retryable: Callable[[Exception], bool] | None = None,
    on_retry: Callable[[int, Exception], None] | None = None,
) -> T:
    attempts = max_attempts if max_attempts is not None else settings.playwright_max_retries
    attempts = max(1, attempts)
    last_exc: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            return await operation()
        except Exception as exc:
            last_exc = exc
            retryable = is_retryable(exc) if is_retryable else _default_retryable(exc)
            if attempt >= attempts or not retryable:
                raise
            delay = settings.playwright_retry_backoff_base_sec * (2 ** (attempt - 1))
            logger.info(
                "crawl_retry url=%s attempt=%d/%d delay=%.1fs error=%s",
                url,
                attempt,
                attempts,
                delay,
                exc,
            )
            if on_retry:
                on_retry(attempt, exc)
            await asyncio.sleep(delay)

    assert last_exc is not None
    raise last_exc


def _default_retryable(exc: Exception) -> bool:
    if isinstance(exc, FetchError):
        return exc.code in RETRYABLE_CODES
    msg = str(exc).lower()
    return "timeout" in msg or "net::" in msg or "target closed" in msg
