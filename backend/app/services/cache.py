import hashlib
import time
from typing import Any

from app.config import settings


class MemoryCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        if settings.cache_ttl_sec <= 0:
            return None
        entry = self._store.get(key)
        if not entry:
            return None
        expires, value = entry
        if time.time() > expires:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        if settings.cache_ttl_sec <= 0:
            return
        self._store[key] = (time.time() + settings.cache_ttl_sec, value)


cache = MemoryCache()


def cache_key(
    url: str,
    processing_prompt: str | None = None,
    output_language: str = "zh",
    output_detail: str = "concise",
) -> str:
    payload = f"{url}\0{processing_prompt or ''}\0{output_language}\0{output_detail}"
    return hashlib.sha256(payload.encode()).hexdigest()
