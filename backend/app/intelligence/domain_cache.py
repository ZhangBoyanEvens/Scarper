"""Lightweight per-domain routing bias from historical outcomes."""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field
from urllib.parse import urlparse


@dataclass
class DomainStats:
    http_wins: int = 0
    api_wins: int = 0
    playwright_wins: int = 0
    failures: int = 0
    total_latency_ms: float = 0.0
    latency_samples: int = 0
    block_signals: int = 0
    last_updated: float = field(default_factory=time.time)

    @property
    def total_attempts(self) -> int:
        return self.http_wins + self.api_wins + self.playwright_wins + self.failures

    def http_success_rate(self) -> float:
        wins = self.http_wins + self.api_wins
        total = wins + self.failures
        if total == 0:
            return 0.5
        return wins / total

    def playwright_ratio(self) -> float:
        total = self.http_wins + self.api_wins + self.playwright_wins
        if total == 0:
            return 0.0
        return self.playwright_wins / total

    def block_probability(self) -> float:
        if self.total_attempts == 0:
            return 0.0
        return min(1.0, self.block_signals / max(1, self.total_attempts))

    def avg_latency_ms(self) -> float:
        if self.latency_samples == 0:
            return 0.0
        return self.total_latency_ms / self.latency_samples

    def preferred_strategy_hint(self) -> str | None:
        if self.total_attempts < 2:
            return None
        if self.http_success_rate() >= 0.7:
            return "HTTP_ONLY"
        if self.playwright_wins > self.http_wins and self.playwright_ratio() < 0.5:
            return "SPA_BROWSER"
        if self.api_wins > self.http_wins:
            return "API_FETCH"
        return None


class DomainLearningCache:
    def __init__(self) -> None:
        self._domains: dict[str, DomainStats] = defaultdict(DomainStats)

    @staticmethod
    def domain_key(url: str) -> str:
        return (urlparse(url).netloc or "unknown").lower()

    def get(self, url: str) -> DomainStats:
        return self._domains[self.domain_key(url)]

    def record_success(
        self,
        url: str,
        *,
        strategy: str,
        latency_ms: float,
    ) -> None:
        stats = self.get(url)
        if strategy in ("HTTP_ONLY", "RETRY_HTTP"):
            stats.http_wins += 1
        elif strategy == "API_FETCH":
            stats.api_wins += 1
        elif strategy in ("SPA_BROWSER", "STEALTH_BROWSER"):
            stats.playwright_wins += 1
        stats.total_latency_ms += latency_ms
        stats.latency_samples += 1
        stats.last_updated = time.time()

    def record_failure(self, url: str, *, block_like: bool = False) -> None:
        stats = self.get(url)
        stats.failures += 1
        if block_like:
            stats.block_signals += 1
        stats.last_updated = time.time()

    def routing_bias(self, url: str) -> dict[str, float]:
        """Score deltas for http / api / playwright (-0.15 .. +0.15)."""
        stats = self.get(url)
        if stats.total_attempts < 2:
            return {"http": 0.0, "api": 0.0, "playwright": 0.0}

        http = (stats.http_success_rate() - 0.5) * 0.2
        block = -stats.block_probability() * 0.1
        pw_penalty = -max(0.0, stats.playwright_ratio() - 0.25) * 0.15
        api_boost = min(0.1, stats.api_wins / max(1, stats.total_attempts) * 0.15)

        return {
            "http": http + block,
            "api": api_boost,
            "playwright": pw_penalty,
        }


_cache = DomainLearningCache()


def get_domain_cache() -> DomainLearningCache:
    return _cache
