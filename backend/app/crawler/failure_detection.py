"""Detect blocked, empty, or challenge pages from HTML and navigation metadata."""

import re
from dataclasses import dataclass
from urllib.parse import urlparse

from app.crawler.types import CrawlStatus, FetchError

CLOUDFLARE_MARKERS = (
    "cf-browser-verification",
    "challenge-platform",
    "cf-challenge",
    "Just a moment",
    "Attention Required! | Cloudflare",
    "Enable JavaScript and cookies to continue",
)

CAPTCHA_MARKERS = (
    "g-recaptcha",
    "h-captcha",
    "cf-turnstile",
    "captcha-container",
    "verify you are human",
    "are you a robot",
    "hcaptcha.com",
)

LOGIN_WALL_MARKERS = (
    "sign in to continue",
    "log in to view",
    "please log in",
    "登录后",
    "请登录",
    "members only",
)

BLOCKED_MARKERS = (
    "access denied",
    "403 forbidden",
    "request blocked",
    "bot detection",
    "automated access",
)

SPA_HINTS = re.compile(
    r"<noscript[^>]*>[\s\S]*?(enable javascript|requires javascript)",
    re.I,
)
EMPTY_APP_ROOT = re.compile(
    r'<div[^>]+id=["\'](root|app|__next)["\'][^>]*>\s*</div>',
    re.I,
)


@dataclass(frozen=True)
class FailureAnalysis:
    status: CrawlStatus
    code: str
    message: str


def visible_text_length(html: str) -> int:
    text = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return len(text)


def needs_javascript_render(html: str) -> bool:
    if visible_text_length(html) < 200:
        return True
    if SPA_HINTS.search(html):
        return True
    if EMPTY_APP_ROOT.search(html):
        return True
    return False


def looks_like_cloudflare(html: str) -> bool:
    sample = html[:12_000]
    return any(m in sample for m in CLOUDFLARE_MARKERS)


def analyze_html(
    html: str,
    *,
    final_url: str,
    requested_url: str,
    status_code: int,
) -> FailureAnalysis | None:
    sample = html[:16_000].lower()

    if status_code >= 400:
        if status_code in (403, 503) and looks_like_cloudflare(html):
            return FailureAnalysis(
                "cloudflare",
                "cloudflare",
                "站点防护拦截（Cloudflare 等）",
            )
        return FailureAnalysis(
            "blocked",
            "http_error",
            f"HTTP {status_code}",
        )

    if looks_like_cloudflare(html):
        return FailureAnalysis(
            "cloudflare",
            "cloudflare",
            "站点防护拦截（Cloudflare 等）",
        )

    if any(m in sample for m in CAPTCHA_MARKERS):
        return FailureAnalysis("captcha", "captcha", "页面需要人机验证（CAPTCHA）")

    if any(m in sample for m in BLOCKED_MARKERS):
        return FailureAnalysis("blocked", "blocked", "访问被站点拒绝或限制")

    if _is_suspicious_redirect(requested_url, final_url):
        login_hint = any(m in sample for m in LOGIN_WALL_MARKERS)
        if login_hint or visible_text_length(html) < 120:
            return FailureAnalysis(
                "redirect_suspicious",
                "login_required",
                "页面可能需登录或已跳转到非目标页",
            )

    try:
        from app.intelligence.render_detector import detect_render_requirement

        vis = visible_text_length(html)
        render_decision = detect_render_requirement(html, requested_url, {})
        if render_decision.needs_render and vis < 150:
            return FailureAnalysis(
                "empty",
                "render_required",
                f"需要浏览器渲染（{render_decision.reason}）",
            )
    except Exception:
        pass

    if visible_text_length(html) < 80:
        return FailureAnalysis("empty", "empty_page", "页面正文为空或过短")

    return None


def raise_if_failure(
    analysis: FailureAnalysis | None,
    *,
    allow_empty: bool = False,
) -> None:
    if analysis is None:
        return
    if allow_empty and analysis.code == "empty_page":
        return
    raise FetchError(analysis.message, analysis.code)


def _is_suspicious_redirect(requested: str, final: str) -> bool:
    try:
        req = urlparse(requested)
        fin = urlparse(final)
    except Exception:
        return False
    if req.netloc == fin.netloc and req.path.rstrip("/") == fin.path.rstrip("/"):
        return False
    login_paths = ("/login", "/signin", "/sign-in", "/auth", "/account")
    return any(p in fin.path.lower() for p in login_paths)
