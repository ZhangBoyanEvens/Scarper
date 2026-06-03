"""Probabilistic preflight confidence — no binary pass/fail gating."""

from __future__ import annotations

import math
import re

from app.config import settings
from app.crawler.failure_detection import looks_like_cloudflare, visible_text_length
from app.intelligence.domain_cache import get_domain_cache
from app.intelligence.network_noise import NoiseAssessment
from app.intelligence.render_detector import has_spa_signals
from app.intelligence.types import (
    PreflightConfidence,
    ProbeBundle,
    SignalQuality,
    URLClass,
)

BLOCK_MARKERS = re.compile(
    r"cf-browser-verification|challenge-platform|attention required|access denied",
    re.I,
)


def compute_preflight_confidence(
    *,
    probe: ProbeBundle,
    url_class: URLClass,
    classification_signals: list[str],
    noise: NoiseAssessment,
) -> PreflightConfidence:
    risk_flags: list[str] = []
    score = 0.55

    if noise.network_unstable:
        risk_flags.append("network_unstable")
        score -= 0.12

    if noise.consistent_hard_failure:
        risk_flags.append("consistent_hard_failure")
        score -= 0.25

    status = probe.status_code
    if status is not None:
        if 200 <= status < 300:
            score += 0.15
        elif status in (401, 403, 410):
            if noise.consistent_hard_failure:
                risk_flags.append(f"http_{status}_confirmed")
                score -= 0.35
            else:
                risk_flags.append(f"http_{status}_unconfirmed")
                score -= 0.08
        elif status >= 500:
            risk_flags.append("server_error")
            score -= 0.1
    else:
        risk_flags.append("no_status")
        score -= 0.15

    snippet = probe.snippet or ""
    vis = visible_text_length(snippet) if snippet else 0
    byte_len = probe.bytes_received or len(snippet.encode("utf-8", errors="ignore"))

    if byte_len >= 2048:
        score += 0.08
    elif byte_len >= 200:
        score += 0.03
    elif byte_len < 80 and not snippet.strip():
        risk_flags.append("empty_probe_body")
        score -= 0.1

    entropy = _html_entropy(snippet)
    if entropy > 4.0 and vis >= 120:
        score += 0.06
        risk_flags.append("healthy_html_entropy")
    elif snippet and entropy < 2.0 and vis < 80:
        risk_flags.append("low_entropy_thin")
        score -= 0.05

    if snippet and looks_like_cloudflare(snippet):
        risk_flags.append("block_indicator_in_snippet")
        score -= 0.2
    elif snippet and BLOCK_MARKERS.search(snippet):
        risk_flags.append("block_marker_text")
        score -= 0.15

    if probe.latency_ms > 8000:
        risk_flags.append("high_latency")
        score -= 0.05
    elif 0 < probe.latency_ms < 2500:
        score += 0.03

    if probe.attempts and len(probe.attempts) > 1:
        oks = sum(1 for a in probe.attempts if a.ok)
        if oks >= 1:
            score += 0.05
            risk_flags.append("probe_retry_recovered")

    bias = get_domain_cache().routing_bias(probe.url)
    score += bias["http"]

    class_adj = {
        URLClass.STATIC_ARTICLE: 0.12,
        URLClass.API_LIKE: 0.08,
        URLClass.SPA_APP: -0.05,
        URLClass.SHORT_PAGE: -0.03,
        URLClass.BLOCKED: -0.15,
        URLClass.FILE: 0.0,
        URLClass.UNKNOWN: 0.0,
    }.get(url_class, 0.0)
    score += class_adj

    score = max(0.05, min(0.98, score))
    signal_quality = _signal_quality(score, byte_len, noise)

    http_s, api_s, pw_s = _strategy_scores(
        score=score,
        url_class=url_class,
        signals=classification_signals,
        bias=bias,
        risk_flags=risk_flags,
    )

    spa_confirmed = url_class == URLClass.SPA_APP and any(
        s in classification_signals for s in ("spa_markers", "api_embedded")
    )
    repeated_probe_fail = (
        not any(a.ok for a in probe.attempts)
        and len(probe.attempts) >= 2
        and noise.consistent_hard_failure
    )
    allow_playwright = _playwright_allowed(
        confidence=score,
        url_class=url_class,
        spa_confirmed=spa_confirmed,
        repeated_probe_fail=repeated_probe_fail,
        risk_flags=risk_flags,
        classification_signals=classification_signals,
    )

    recommended = _pick_recommended(http_s, api_s, pw_s, allow_playwright)
    fail_fast = noise.consistent_hard_failure and status in (401, 403, 410)

    return PreflightConfidence(
        confidence_score=round(score, 3),
        signal_quality=signal_quality,
        recommended_strategy=recommended,
        risk_flags=risk_flags,
        http_score=round(http_s, 3),
        api_score=round(api_s, 3),
        playwright_score=round(pw_s, 3),
        allow_playwright=allow_playwright,
        fail_fast_certain=fail_fast,
    )


def _html_entropy(text: str) -> float:
    if not text:
        return 0.0
    freq: dict[str, int] = {}
    for ch in text[:8000]:
        freq[ch] = freq.get(ch, 0) + 1
    n = len(text[:8000])
    ent = 0.0
    for c in freq.values():
        p = c / n
        ent -= p * math.log2(p)
    return ent


def _signal_quality(score: float, byte_len: int, noise: NoiseAssessment) -> SignalQuality:
    if noise.network_unstable and score < 0.45:
        return "low"
    if score >= 0.72 and byte_len >= 512:
        return "high"
    if score >= 0.45:
        return "medium"
    return "low"


def _strategy_scores(
    *,
    score: float,
    url_class: URLClass,
    signals: list[str],
    bias: dict[str, float],
    risk_flags: list[str],
) -> tuple[float, float, float]:
    http = 0.55 + score * 0.35 + bias["http"]
    api = 0.12 + bias["api"]
    pw = 0.05 + bias["playwright"]

    if url_class == URLClass.API_LIKE:
        api += 0.35
        http += 0.1
    elif url_class == URLClass.STATIC_ARTICLE:
        http += 0.25
    elif url_class == URLClass.SPA_APP:
        api += 0.15
        pw += 0.12
    elif url_class == URLClass.SHORT_PAGE:
        http += 0.15
        if has_spa_signals(signals):
            pw += 0.35
        else:
            pw -= 0.15
    elif url_class == URLClass.BLOCKED:
        http += 0.15
        pw += 0.05
    elif url_class == URLClass.FILE:
        http = 0.1
        api = 0.05
        pw = 0.0

    if "spa_markers" in signals:
        pw += 0.08
    if "api_markers_in_html" in signals or "api_embedded" in signals:
        api += 0.2

    if "network_unstable" in risk_flags:
        http += 0.1
        pw -= 0.12

    total = http + api + pw
    if total <= 0:
        return 0.7, 0.2, 0.1
    return http / total, api / total, pw / total


def _playwright_allowed(
    *,
    confidence: float,
    url_class: URLClass,
    spa_confirmed: bool,
    repeated_probe_fail: bool,
    risk_flags: list[str],
    classification_signals: list[str],
) -> bool:
    if not settings.playwright_enabled:
        return False
    if url_class == URLClass.FILE:
        return False

    if url_class == URLClass.SHORT_PAGE:
        if has_spa_signals(classification_signals) or "short_page_with_spa_signals" in classification_signals:
            return True
        return False

    if spa_confirmed and confidence < 0.55:
        return True

    if confidence < settings.confidence_playwright_threshold and repeated_probe_fail:
        return True

    if url_class == URLClass.SPA_APP and spa_confirmed:
        return True

    return False


def _pick_recommended(http: float, api: float, pw: float, allow_playwright: bool) -> str:
    scores = {"HTTP_ONLY": http, "API_FETCH": api}
    if allow_playwright:
        scores["SPA_BROWSER"] = pw
    return max(scores, key=scores.get)  # type: ignore[arg-type]
