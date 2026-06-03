"""Run blocking Neon repository calls off the asyncio event loop."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


async def neon_io(fn: Callable[..., T], /, *args, **kwargs) -> T:
    return await asyncio.to_thread(fn, *args, **kwargs)
