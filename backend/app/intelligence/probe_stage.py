"""Stage 1: lightweight GET probe — no HEAD, noise-tolerant retries."""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from urllib.parse import urlparse

import httpx

from app.config import settings
from app.intelligence.network_noise import (
    adaptive_probe_timeout,
    assess_probe_noise,
    signal_quality_hint_from_attempts,
)
from app.intelligence.types import NoiseAssessmentSnapshot, ProbeAttempt, ProbeBundle

logger = logging.getLogger(__name__)

_PROBE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

_domain_locks: dict[str, asyncio.Semaphore] = defaultdict(
    lambda: asyncio.Semaphore(max(1, settings.probe_domain_concurrency)),
)


def _domain_semaphore(url: str) -> asyncio.Semaphore:
    key = (urlparse(url).netloc or "unknown").lower()
    return _domain_locks[key]


async def run_probe_stage(url: str) -> ProbeBundle:
    """GET-only lightweight probe with per-domain rate limit and retries."""
    max_retries = settings.probe_max_retries
    attempts: list[ProbeAttempt] = []
    unstable = False

    async with _domain_semaphore(url):
        for attempt_idx in range(max_retries + 1):
            timeout_sec = adaptive_probe_timeout(
                settings.probe_timeout_sec,
                attempt_idx,
                unstable,
            )
            attempt = await _single_get_probe(url, timeout_sec)
            attempts.append(attempt)

            if attempt_idx == 0 and max_retries > 0:
                preview = assess_probe_noise(attempts)
                unstable = preview.network_unstable
                if attempt.ok and signal_quality_hint_from_attempts(attempts) == "high":
                    break
                if preview.consistent_hard_failure:
                    break
                if attempt.ok:
                    break
                continue

            noise = assess_probe_noise(attempts)
            unstable = noise.network_unstable
            if noise.consistent_hard_failure:
                break
            if attempt.ok:
                break
            if attempt_idx < max_retries and not noise.consistent_hard_failure:
                await asyncio.sleep(0.35 * (attempt_idx + 1))
                continue
            break

    noise = assess_probe_noise(attempts)
    best = _pick_best_attempt(attempts)
    noise_snap = NoiseAssessmentSnapshot(
        network_unstable=noise.network_unstable,
        consistent_hard_failure=noise.consistent_hard_failure,
        detail=noise.detail,
    )
    return ProbeBundle(
        url=url,
        attempts=attempts,
        final_url=best.final_url,
        status_code=best.status_code,
        content_type=best.content_type,
        snippet=best.snippet,
        bytes_received=best.bytes_received,
        latency_ms=best.latency_ms,
        noise=noise_snap,
    )


async def _single_get_probe(url: str, timeout_sec: float) -> ProbeAttempt:
    started = time.perf_counter()
    timeout = httpx.Timeout(timeout_sec)
    out = ProbeAttempt(url=url)

    async with httpx.AsyncClient(
        follow_redirects=True,
        max_redirects=settings.max_redirects,
        timeout=timeout,
    ) as client:
        try:
            async with client.stream("GET", url, headers=_PROBE_HEADERS) as resp:
                out.status_code = resp.status_code
                out.final_url = str(resp.url)
                out.content_type = resp.headers.get("content-type", "")
                chunk = b""
                async for part in resp.aiter_bytes():
                    chunk += part
                    if len(chunk) >= settings.probe_max_bytes:
                        break
                out.bytes_received = len(chunk)
                out.snippet = chunk.decode("utf-8", errors="replace")
                redirect_count = len(resp.history) if resp.history else 0
                out.redirect_count = redirect_count
        except httpx.TimeoutException:
            out.error = "timeout"
        except httpx.HTTPError as e:
            out.error = str(e)[:120]
        except Exception as e:
            out.error = str(e)[:120]

    out.latency_ms = (time.perf_counter() - started) * 1000
    out.ok = _attempt_ok(out)
    return out


def _attempt_ok(attempt: ProbeAttempt) -> bool:
    if attempt.status_code is None:
        return False
    if attempt.status_code >= 400:
        return False
    if attempt.bytes_received < 50 and not attempt.snippet.strip():
        return False
    return True


def _pick_best_attempt(attempts: list[ProbeAttempt]) -> ProbeAttempt:
    if not attempts:
        return ProbeAttempt(url="")
    for a in reversed(attempts):
        if a.ok:
            return a
    return max(
        attempts,
        key=lambda x: (x.bytes_received, x.status_code or 0, -x.latency_ms),
    )


async def optional_head_telemetry(url: str) -> dict:
    """Diagnostic only — never used for routing."""
    try:
        timeout = httpx.Timeout(6.0)
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=timeout,
        ) as client:
            resp = await client.head(url, headers=_PROBE_HEADERS)
            return {"status_code": resp.status_code, "final_url": str(resp.url)}
    except Exception as e:
        return {"status_code": None, "error": str(e)[:80]}
