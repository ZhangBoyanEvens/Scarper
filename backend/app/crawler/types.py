from dataclasses import dataclass, field
from typing import Any, Literal

FetchMethod = Literal["httpx", "playwright"]

CrawlStatus = Literal[
    "ok",
    "empty",
    "blocked",
    "cloudflare",
    "captcha",
    "redirect_suspicious",
    "timeout",
    "error",
]


@dataclass
class CrawlTimings:
    navigation_ms: float = 0.0
    content_wait_ms: float = 0.0
    scroll_ms: float = 0.0
    network_idle_ms: float = 0.0
    total_ms: float = 0.0

    def as_dict(self) -> dict[str, float]:
        return {
            "navigation_ms": round(self.navigation_ms, 2),
            "content_wait_ms": round(self.content_wait_ms, 2),
            "scroll_ms": round(self.scroll_ms, 2),
            "network_idle_ms": round(self.network_idle_ms, 2),
            "total_ms": round(self.total_ms, 2),
        }


@dataclass
class FetchResult:
    url: str
    html: str
    method: FetchMethod
    status_code: int
    success: bool = True
    title: str = ""
    status: CrawlStatus = "ok"
    error: str | None = None
    timings: CrawlTimings = field(default_factory=CrawlTimings)
    retry_count: int = 0
    meta: dict[str, Any] = field(default_factory=dict)

    def to_log_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "method": self.method,
            "status_code": self.status_code,
            "success": self.success,
            "status": self.status,
            "retry_count": self.retry_count,
            "timings": self.timings.as_dict(),
            "html_len": len(self.html),
        }


class FetchError(Exception):
    def __init__(self, message: str, code: str = "fetch_failed"):
        super().__init__(message)
        self.code = code
