"""
Treat all HTML as untrusted before parsing or LLM usage.
Removes executable content, hidden nodes, and injection-prone attributes.
"""

import re
from bs4 import BeautifulSoup, Comment

# Attributes that can carry executable behavior
EVENT_HANDLER_ATTRS = re.compile(r"^on[a-z]+", re.I)
DANGEROUS_URL_ATTRS = ("href", "src", "xlink:href", "formaction", "action")
INJECTION_PATTERNS = re.compile(
    r"(ignore\s+(all\s+)?(previous|above)\s+instructions|"
    r"system\s*:\s*you\s+are|"
    r"<\s*/?\s*system\s*>|"
    r"jailbreak|DAN\s+mode)",
    re.I,
)

TAGS_TO_REMOVE = frozenset(
    {
        "script",
        "style",
        "iframe",
        "frame",
        "frameset",
        "object",
        "embed",
        "svg",
        "math",
        "link",
        "meta",
        "base",
        "template",
        "noscript",
    }
)

# Layout wrappers (e.g. ASP.NET WebForms) — unwrap instead of deleting children.
TAGS_TO_UNWRAP = frozenset({"form"})

# Cookie / consent overlays (Complianz, OneTrust, etc.) — not page content.
CONSENT_SELECTORS = (
    ".cmplz-cookiebanner",
    "#cmplz-cookiebanner-container",
    ".cmplz-manage-consent",
    "#cookie-law-info-bar",
    "#onetrust-banner-sdk",
    "#onetrust-consent-sdk",
    ".osano-cm-dialog",
    ".cc-window",
    "[class*='cookie-banner']",
    "[class*='cookies-banner']",
    "[class*='cookie-consent']",
    "[id*='cookie-consent']",
    "[id*='cookie-banner']",
)

KEEP_ATTRS = frozenset(
    {
        "href",
        "src",
        "alt",
        "title",
        "colspan",
        "rowspan",
        "id",
        "class",
        "role",
        "lang",
    }
)


def _strip_unsafe_tags(soup: BeautifulSoup) -> None:
    for tag in list(soup.find_all(TAGS_TO_UNWRAP)):
        tag.unwrap()
    for tag in soup.find_all(TAGS_TO_REMOVE):
        tag.decompose()


def _remove_consent_chrome(soup: BeautifulSoup) -> None:
    for selector in CONSENT_SELECTORS:
        for tag in soup.select(selector):
            tag.decompose()


def clean_html_minimal(html: str) -> str:
    """Lightweight sanitize when full clean_html fails on malformed DOM."""
    soup = BeautifulSoup(html, "lxml")
    _strip_unsafe_tags(soup)
    _remove_consent_chrome(soup)
    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()
    return str(soup)


def clean_html(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")

    _strip_unsafe_tags(soup)

    _remove_consent_chrome(soup)

    for comment in soup.find_all(string=lambda t: isinstance(t, Comment)):
        comment.extract()

    for tag in soup.find_all(True):
        if _is_hidden(tag):
            tag.decompose()
            continue

        _strip_dangerous_attrs(tag)

    # Remove metadata that may contain prompt-like instructions
    for meta in soup.find_all("meta"):
        meta.decompose()

    text = str(soup)
    return text


def scrub_text_for_llm(text: str) -> str:
    """Secondary plain-text scrub before LLM."""
    if not text:
        return ""
    cleaned = INJECTION_PATTERNS.sub("[filtered]", text)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _is_hidden(tag) -> bool:
    # Some malformed nodes have attrs=None; tag.has_attr() then raises TypeError.
    attrs = getattr(tag, "attrs", None)
    if not attrs:
        return False
    if "hidden" in attrs:
        return True
    if attrs.get("aria-hidden") == "true":
        return True
    if attrs.get("type") == "hidden":
        return True
    style = attrs.get("style", "")
    if isinstance(style, list):
        style = " ".join(style)
    if re.search(r"display\s*:\s*none", style, re.I):
        return True
    if re.search(r"visibility\s*:\s*hidden", style, re.I):
        return True
    return False


def _strip_dangerous_attrs(tag) -> None:
    if not getattr(tag, "attrs", None):
        return
    attrs = dict(tag.attrs)
    for name in list(attrs.keys()):
        if EVENT_HANDLER_ATTRS.match(name):
            del tag.attrs[name]
            continue
        if name not in KEEP_ATTRS and name not in ("headers",):
            del tag.attrs[name]
            continue
        if name in DANGEROUS_URL_ATTRS:
            val = " ".join(tag.attrs[name]) if isinstance(tag.attrs[name], list) else str(tag.attrs[name])
            if val.strip().lower().startswith(("javascript:", "data:", "vbscript:")):
                del tag.attrs[name]
