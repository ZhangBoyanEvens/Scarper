"""Content-first extractability checks (no intelligence layer imports)."""

from __future__ import annotations

import re

from app.crawler.failure_detection import visible_text_length

MIN_EXTRACTABLE_VISIBLE = 120

EMPTY_MOUNT_RE = re.compile(
    r'id=["\'](?:app|App|root|__next)["\'][^>]*>\s*</',
    re.I,
)

# Intro/splash overlays that satisfy the 120-char threshold before real content loads.
SPLASH_TEXT_MARKERS = (
    "keşfetmeye başla",
    "kesfetmeye basla",
    "the heart of the boiler",
    "enerkon bir barış enerji",
    "enerkon bir baris enerji",
)

LIVE_EXTRACTABLE_JS = """
() => {
  const body = document.body?.innerText || '';
  const visible = body.replace(/\\s+/g, ' ').trim().length;
  const htmlLen = document.documentElement?.outerHTML?.length || 0;
  const lower = body.toLowerCase();

  if (visible < 120) return false;

  const splashHints = [
    'keşfetmeye başla', 'kesfetmeye basla',
    'the heart of the boiler', 'enerkon bir barış enerji',
  ];
  const hasSplash = splashHints.some((h) => lower.includes(h));
  if (hasSplash && visible < 800) return false;

  for (const sel of ['main', 'article', '[role=main]']) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length >= 120) return true;
  }

  if (htmlLen >= 150000 && visible >= 200) return true;
  if (htmlLen >= 80000 && visible >= 400) return true;
  return visible >= 300;
}
"""


def looks_like_splash_only(html: str, visible: int | None = None) -> bool:
    """Detect intro overlays (e.g. Wix splash) mistaken for full page content."""
    vis = visible if visible is not None else visible_text_length(html)
    sample = html[:80_000].lower()
    if not any(marker in sample for marker in SPLASH_TEXT_MARKERS):
        return False
    if vis >= 800:
        return False
    if "çevre politikamız" in sample or "isg politikamız" in sample:
        return False
    if "kalite politikamız" in sample and vis >= 400:
        return False
    return True


def is_content_extractable(html: str, *, min_visible: int = MIN_EXTRACTABLE_VISIBLE) -> bool:
    """True when HTML has enough body text and is not an empty SPA shell."""
    if not html or not html.strip():
        return False

    vis = visible_text_length(html)
    if vis < min_visible:
        return False

    if looks_like_splash_only(html, vis):
        return False

    if EMPTY_MOUNT_RE.search(html[:30_000]) and vis < max(min_visible + 80, 200):
        return False

    lower = html[:16_000].lower()
    if vis < 200 and any(
        m in lower
        for m in ("enable javascript", "requires javascript", "cf-browser-verification")
    ):
        return False

    html_len = len(html)
    if html_len < 80_000 and vis < 300:
        return False

    return True
