"""Soft URL classification from GET probe snippet — no HEAD, no binary gating."""

from urllib.parse import urlparse

from app.crawler.failure_detection import looks_like_cloudflare, visible_text_length
from app.crawler.url_validator import BLOCKED_EXTENSIONS
from app.intelligence.network_noise import assess_probe_noise
from app.intelligence.preflight_confidence import compute_preflight_confidence
from app.intelligence.probe_stage import optional_head_telemetry, run_probe_stage
from app.intelligence.render_detector import detect_render_requirement, has_spa_signals
from app.intelligence.types import PreflightResult, URLClass

SPA_FRAMEWORK_MARKERS = (
    "__NEXT_DATA__",
    'id="root"',
    "id='root'",
    'id="app"',
    "ng-version",
    "data-reactroot",
    "__NUXT__",
    "window.__INITIAL_STATE__",
)

API_MARKERS = (
    "application/json",
    "application/ld+json",
    '"@type"',
    "__NEXT_DATA__",
    "window.__APOLLO_STATE__",
)


async def run_preflight(url: str) -> PreflightResult:
    """Stage-1 probe + soft classification + confidence (never hard-fail)."""
    result = PreflightResult(url=url)
    signals: list[str] = []

    path = urlparse(url).path or ""
    if BLOCKED_EXTENSIONS.search(path):
        result.classification = URLClass.FILE
        signals.append("blocked_extension_in_path")
        result.classification_signals = signals
        result.confidence = compute_preflight_confidence(
            probe=_empty_probe(url),
            url_class=URLClass.FILE,
            classification_signals=signals,
            noise=_stable_noise(),
        )
        return result

    probe = await run_probe_stage(url)
    result.probe = probe
    result.final_url = probe.final_url
    result.status_code = probe.status_code
    result.content_type = probe.content_type
    result.content_length = probe.bytes_received
    result.html_snippet = probe.snippet

    if settings_preflight_telemetry():
        probe.head_telemetry = await optional_head_telemetry(url)

    noise_assessment = assess_probe_noise(probe.attempts) if probe.attempts else _stable_noise()

    snippet = probe.snippet or ""
    ctype = (probe.content_type or "").lower()

    if "application/json" in ctype:
        result.classification = URLClass.API_LIKE
        signals.append("content_type_json")
    elif "application/pdf" in ctype or "octet-stream" in ctype:
        result.classification = URLClass.FILE
        signals.append("content_type_file")
    elif snippet and looks_like_cloudflare(snippet):
        result.classification = URLClass.BLOCKED
        signals.append("cloudflare_in_snippet")
    elif noise_assessment.consistent_hard_failure and probe.status_code in (401, 403, 410):
        result.classification = URLClass.BLOCKED
        signals.append(f"confirmed_http_{probe.status_code}")
    elif probe.status_code and probe.status_code >= 403 and not noise_assessment.network_unstable:
        signals.append(f"soft_http_{probe.status_code}")
        result.classification = _classify_from_html(snippet, url, signals)
    else:
        if probe.status_code and probe.status_code >= 400:
            signals.append(f"probe_http_{probe.status_code}_non_gating")
        result.classification = _classify_from_html(snippet, url, signals)

    result.classification_signals = signals
    result.confidence = compute_preflight_confidence(
        probe=probe,
        url_class=result.classification,
        classification_signals=signals,
        noise=noise_assessment,
    )
    return result


def _classify_from_html(snippet: str, url: str, signals: list[str]) -> URLClass:
    if not snippet:
        signals.append("no_snippet")
        return URLClass.UNKNOWN

    lower = snippet.lower()
    vis = visible_text_length(snippet)

    render_hint = detect_render_requirement(snippet, url, {})
    if render_hint.spa_signals:
        signals.extend(render_hint.spa_signals[:6])

    if vis < 120 and len(snippet) < 4096:
        signals.append(f"thin_page_visible={vis}")
        if has_spa_signals(signals) or render_hint.needs_render:
            signals.append("short_page_with_spa_signals")
            return URLClass.SPA_APP
        return URLClass.SHORT_PAGE

    if any(m.lower() in lower for m in SPA_FRAMEWORK_MARKERS):
        signals.append("spa_markers")
        if any(m in snippet for m in API_MARKERS):
            signals.append("api_embedded")
            return URLClass.API_LIKE
        return URLClass.SPA_APP

    if any(m in snippet for m in API_MARKERS):
        signals.append("api_markers_in_html")
        return URLClass.API_LIKE

    article_paths = ("/blog/", "/news/", "/article/", "/post/", "/wiki/", "/docs/")
    if any(p in urlparse(url).path.lower() for p in article_paths):
        signals.append("article_path_heuristic")
        return URLClass.STATIC_ARTICLE

    if vis >= 200:
        signals.append(f"substantial_text={vis}")
        return URLClass.STATIC_ARTICLE

    signals.append("unclassified")
    return URLClass.UNKNOWN


def settings_preflight_telemetry() -> bool:
    from app.config import settings

    return settings.probe_head_telemetry_enabled


def _empty_probe(url: str):
    from app.intelligence.types import ProbeBundle

    return ProbeBundle(url=url)


def _stable_noise():
    from app.intelligence.network_noise import NoiseAssessment

    return NoiseAssessment(
        network_unstable=False,
        consistent_hard_failure=False,
        status_codes_seen=[],
        latency_variance_ms=0.0,
        disconnect_count=0,
        detail="stable",
    )

