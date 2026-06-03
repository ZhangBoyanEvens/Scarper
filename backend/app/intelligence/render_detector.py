"""Render necessity detection — SPA shell vs static HTML."""

from __future__ import annotations

import logging
import math
import re
from dataclasses import dataclass, field
from typing import Any, Literal

from bs4 import BeautifulSoup

from app.crawler.failure_detection import visible_text_length

logger = logging.getLogger(__name__)

# --- A. Hydration / framework (strong) ---
STRONG_FRAMEWORK_PATTERNS: list[tuple[str, str]] = [
    ("next_data", r"__NEXT_DATA__"),
    ("nuxt", r"window\.__NUXT__"),
    ("reactroot", r"data-reactroot"),
    ("vue_data_v", r"\bdata-v-[a-f0-9]+\b"),
]

EMPTY_MOUNT_RE = re.compile(
    r"<(?:div|motion\.motion\.div|motion\.motion)[^>]*\s+id=[\"'](?:app|App|root|__next)[\"'][^>]*>\s*</",
    re.I,
)
QualityStatus = Literal["OK", "QUALITY_LOW"]


@dataclass
class RenderDecision:
    needs_render: bool
    reason: str
    confidence: float
    text_ratio: float = 0.0
    script_density: float = 0.0
    spa_signals: list[str] = field(default_factory=list)

    def to_debug_log(self, url: str) -> dict[str, Any]:
        return {
            "url": url,
            "render_required": self.needs_render,
            "reason": self.reason,
            "confidence": round(self.confidence, 3),
            "text_ratio": round(self.text_ratio, 4),
            "script_density": round(self.script_density, 4),
            "spa_signals": self.spa_signals,
        }


@dataclass
class ContentQualityResult:
    status: QualityStatus
    reason: str
    text_length: int = 0
    entropy: float = 0.0


def has_spa_signals(signals: list[str]) -> bool:
    spa_keys = (
        "spa_markers",
        "vue_spa_shell",
        "empty_app_mount",
        "api_embedded",
        "framework_strong",
        "spa_shell_candidate",
        "script_heavy_spa",
        "content_distribution_anomaly",
    )
    return any(s in signals for s in spa_keys)


def detect_render_requirement(html: str, url: str, meta: dict | None = None) -> RenderDecision:
    """Decide if browser rendering is required before treating fetch as successful."""
    meta = meta or {}
    if not html or not html.strip():
        return RenderDecision(
            needs_render=True,
            reason="empty_html",
            confidence=0.9,
            spa_signals=["empty_html"],
        )

    sample = html[:80_000]
    lower = sample.lower()
    signals: list[str] = []
    html_len = max(len(sample), 1)
    vis_len = visible_text_length(sample)
    text_ratio = vis_len / html_len

    # --- A. Strong framework signals ---
    for name, pattern in STRONG_FRAMEWORK_PATTERNS:
        if re.search(pattern, sample, re.I):
            signals.append(f"framework_strong:{name}")

    if EMPTY_MOUNT_RE.search(sample):
        signals.append("empty_app_mount")

    if 'id="app"' in lower or "id='app'" in lower or 'id="app"' in lower:
        if _mount_node_mostly_empty(sample, mount_id="app"):
            signals.append("empty_app_mount")

    if 'id="root"' in lower and _mount_node_mostly_empty(sample, mount_id="root"):
        signals.append("empty_root_mount")

    strong = [s for s in signals if s.startswith("framework_strong") or "empty_" in s]
    if strong:
        script_density = _script_density(sample)
        return RenderDecision(
            needs_render=True,
            reason=_primary_reason(strong),
            confidence=0.95,
            text_ratio=text_ratio,
            script_density=script_density,
            spa_signals=signals,
        )

    script_density = _script_density(sample)
    script_count, node_count, text_blocks = _dom_stats(sample)

    # --- B. DOM shell ---
    shell_candidate = False
    if text_ratio < 0.08:
        signals.append("spa_shell_candidate:text_ratio")
        shell_candidate = True
    if vis_len < 120 and text_blocks < max(1, script_count // 2):
        signals.append("spa_shell_candidate:thin_text_script_heavy")
        shell_candidate = True

    # --- C. Script-heavy ---
    if node_count > 0 and script_count / node_count > 0.22:
        signals.append("script_heavy_spa")
        shell_candidate = True
    if script_density > 0.45 and vis_len < 200:
        signals.append("script_heavy_spa:density")
        shell_candidate = True

    # --- D. Content distribution anomaly ---
    if _nav_footer_dominates(sample):
        signals.append("content_distribution_anomaly")
        shell_candidate = True
    if _main_regions_empty(sample):
        signals.append("content_distribution_anomaly:empty_main")
        shell_candidate = True

    if meta.get("url_class") == "SHORT_PAGE" and shell_candidate:
        signals.append("short_page_spa")

    confidence = 0.5
    if shell_candidate:
        confidence = 0.72 + min(0.2, (0.08 - text_ratio) * 2) if text_ratio < 0.08 else 0.75
    if "content_distribution_anomaly" in " ".join(signals):
        confidence = max(confidence, 0.85)

    needs = shell_candidate or bool(strong)
    reason = _primary_reason(signals) if needs else "static_html_ok"

    return RenderDecision(
        needs_render=needs,
        reason=reason,
        confidence=confidence if needs else 0.15,
        text_ratio=text_ratio,
        script_density=script_density,
        spa_signals=signals,
    )


def validate_content_quality(
    extracted_text: str,
    *,
    html: str | None = None,
) -> ContentQualityResult:
    """Post-extraction check — catches HTTP false positives."""
    text = (extracted_text or "").strip()
    text_len = len(text)

    if text_len < 120:
        return ContentQualityResult(
            status="QUALITY_LOW",
            reason="text_below_120",
            text_length=text_len,
        )

    entropy = _text_entropy(text)
    if entropy < 2.8 and text_len < 400:
        return ContentQualityResult(
            status="QUALITY_LOW",
            reason="low_entropy_thin_content",
            text_length=text_len,
            entropy=entropy,
        )

    if html and _nav_footer_only_extraction(text, html):
        return ContentQualityResult(
            status="QUALITY_LOW",
            reason="nav_footer_only",
            text_length=text_len,
            entropy=entropy,
        )

    return ContentQualityResult(
        status="OK",
        reason="ok",
        text_length=text_len,
        entropy=entropy,
    )


def should_retry_with_render(
    *,
    fetch_method: str,
    quality: ContentQualityResult,
    render_detection: dict | None,
    render_fallback_used: bool,
) -> bool:
    if render_fallback_used or fetch_method == "playwright":
        return False
    if quality.status != "QUALITY_LOW":
        return False
    return True


def log_render_detection(url: str, decision: RenderDecision) -> None:
    payload = decision.to_debug_log(url)
    logger.info("render_detection %s", payload)


# --- helpers ---


def _primary_reason(signals: list[str]) -> str:
    if not signals:
        return "static_html_ok"
    s = signals[0]
    if "next_data" in s:
        return "nextjs_spa_detected"
    if "nuxt" in s:
        return "nuxt_spa_detected"
    if "reactroot" in s:
        return "react_spa_detected"
    if "vue" in s or "empty_app" in s or "empty_root" in s:
        return "vue_spa_shell_detected"
    if "content_distribution" in s:
        return "content_distribution_anomaly"
    if "script_heavy" in s:
        return "script_heavy_spa"
    if "text_ratio" in s:
        return "spa_shell_low_text_ratio"
    return "spa_render_required"


def _mount_node_mostly_empty(html: str, mount_id: str) -> bool:
    try:
        soup = BeautifulSoup(html[:50_000], "lxml")
        node = soup.find(id=mount_id) or soup.find(id=mount_id.capitalize())
        if not node:
            return False
        inner = visible_text_length(str(node))
        return inner < 40
    except Exception:
        return EMPTY_MOUNT_RE.search(html) is not None


def _script_density(html: str) -> float:
    try:
        soup = BeautifulSoup(html[:50_000], "lxml")
        scripts = soup.find_all("script")
        script_len = sum(len(s.get_text() or "") + len(str(s)) for s in scripts)
        return script_len / max(len(html), 1)
    except Exception:
        scripts = len(re.findall(r"<script\b", html, re.I))
        return min(1.0, scripts * 0.05)


def _dom_stats(html: str) -> tuple[int, int, int]:
    try:
        soup = BeautifulSoup(html[:50_000], "lxml")
        scripts = len(soup.find_all("script"))
        nodes = len(soup.find_all(True))
        blocks = len(
            [
                t
                for t in soup.find_all(["p", "article", "section", "main", "h1", "h2", "h3"])
                if visible_text_length(t.get_text()) > 30
            ],
        )
        return scripts, max(nodes, 1), blocks
    except Exception:
        return html.count("<script"), max(html.count("<"), 1), 0


def _nav_footer_dominates(html: str) -> bool:
    try:
        soup = BeautifulSoup(html[:50_000], "lxml")
        nav_len = sum(visible_text_length(el.get_text()) for el in soup.find_all(["nav", "header", "footer"]))
        main_el = soup.find("main") or soup.find("article") or soup.find(id=re.compile(r"app|root", re.I))
        main_len = visible_text_length(main_el.get_text()) if main_el else 0
        total = visible_text_length(html)
        if total < 150:
            return False
        return nav_len > main_len * 2 and main_len < 80
    except Exception:
        return False


def _main_regions_empty(html: str) -> bool:
    try:
        soup = BeautifulSoup(html[:50_000], "lxml")
        for sel in ("main", "article", "#app", "#root", "#App"):
            if sel.startswith("#"):
                el = soup.find(id=sel[1:])
            else:
                el = soup.find(sel)
            if el is not None and visible_text_length(el.get_text()) < 50:
                if soup.find_all("script"):
                    return True
        return False
    except Exception:
        return False


def _nav_footer_only_extraction(extracted: str, html: str) -> bool:
    try:
        soup = BeautifulSoup(html[:50_000], "lxml")
        main_el = soup.find("main") or soup.find("article")
        if not main_el:
            return False
        main_text = main_el.get_text(" ", strip=True)
        if len(main_text) < 40 and len(extracted) >= 120:
            nav_text = " ".join(
                el.get_text(" ", strip=True) for el in soup.find_all(["nav", "footer", "header"])
            )
            if nav_text and extracted[:200] in nav_text:
                return True
    except Exception:
        pass
    return False


def _text_entropy(text: str) -> float:
    if not text:
        return 0.0
    freq: dict[str, int] = {}
    for ch in text[:4000]:
        freq[ch] = freq.get(ch, 0) + 1
    n = len(text[:4000])
    ent = 0.0
    for c in freq.values():
        p = c / n
        ent -= p * math.log2(p)
    return ent
