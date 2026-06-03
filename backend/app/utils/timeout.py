import asyncio
import logging
from collections.abc import Awaitable
from typing import TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class OperationTimeoutError(TimeoutError):
    def __init__(self, message: str, *, code: str = "timeout"):
        super().__init__(message)
        self.code = code


async def run_with_timeout(
    coro: Awaitable[T],
    seconds: float,
    *,
    operation: str,
) -> T:
    if seconds <= 0:
        return await coro
    try:
        return await asyncio.wait_for(coro, timeout=seconds)
    except asyncio.TimeoutError as e:
        logger.warning("timeout operation=%s limit=%.1fs", operation, seconds)
        raise OperationTimeoutError(
            f"{operation}超时（{int(seconds)} 秒），已中止并返回结果",
            code="timeout",
        ) from e
