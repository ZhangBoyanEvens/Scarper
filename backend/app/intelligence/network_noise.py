"""Detect unstable network / probe noise vs consistent server policy."""

from __future__ import annotations

from dataclasses import dataclass

from app.intelligence.types import ProbeAttempt


@dataclass
class NoiseAssessment:
    network_unstable: bool
    consistent_hard_failure: bool
    status_codes_seen: list[int]
    latency_variance_ms: float
    disconnect_count: int
    detail: str


def assess_probe_noise(attempts: list[ProbeAttempt]) -> NoiseAssessment:
    if not attempts:
        return NoiseAssessment(
            network_unstable=True,
            consistent_hard_failure=False,
            status_codes_seen=[],
            latency_variance_ms=0.0,
            disconnect_count=0,
            detail="no_attempts",
        )

    codes = [a.status_code for a in attempts if a.status_code is not None]
    ok_flags = [a.ok for a in attempts]
    disconnects = sum(1 for a in attempts if a.error and not a.status_code)
    latencies = [a.latency_ms for a in attempts if a.latency_ms > 0]

    variance = 0.0
    if len(latencies) >= 2:
        mean = sum(latencies) / len(latencies)
        variance = sum((x - mean) ** 2 for x in latencies) / len(latencies)

    inconsistent_ok = len(set(ok_flags)) > 1
    inconsistent_status = len(set(codes)) > 1 if codes else False
    unstable = inconsistent_ok or disconnects >= 2 or (variance > 2_500_000 and len(latencies) >= 2)

    hard_codes = {401, 403, 410}
    consistent_hard = (
        len(attempts) >= 2
        and len(codes) >= 2
        and all(c in hard_codes for c in codes)
        and not any(a.ok for a in attempts)
    )

    detail_parts: list[str] = []
    if unstable:
        detail_parts.append("unstable")
    if consistent_hard:
        detail_parts.append("consistent_hard_failure")
    if disconnects:
        detail_parts.append(f"disconnects={disconnects}")

    return NoiseAssessment(
        network_unstable=unstable,
        consistent_hard_failure=consistent_hard,
        status_codes_seen=codes,
        latency_variance_ms=variance,
        disconnect_count=disconnects,
        detail=",".join(detail_parts) or "stable",
    )


def signal_quality_hint_from_attempts(attempts: list) -> str:
    """Quick quality hint after first successful probe."""
    if not attempts:
        return "low"
    a = attempts[-1]
    if getattr(a, "ok", False) and getattr(a, "bytes_received", 0) >= 512:
        return "high"
    if getattr(a, "ok", False):
        return "medium"
    return "low"


def adaptive_probe_timeout(base_sec: float, attempt_index: int, unstable: bool) -> float:
    """Increase timeout on retries when network looks noisy."""
    t = base_sec
    if attempt_index > 0:
        t += 4.0 * attempt_index
    if unstable:
        t += 3.0
    return min(t, 28.0)
