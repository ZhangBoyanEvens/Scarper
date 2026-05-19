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
        "form",
        "svg",
        "math",
        "link",
        "meta",
        "base",
        "template",
        "noscript",
    }
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


def clean_html(html: str) -> str:
    soup = BeautifulSoup(html, "lxml")

    for tag in soup.find_all(TAGS_TO_REMOVE):
        tag.decompose()

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
    if tag.has_attr("hidden"):
        return True
    if tag.get("aria-hidden") == "true":
        return True
    if tag.get("type") == "hidden":
        return True
    style = tag.get("style", "")
    if re.search(r"display\s*:\s*none", style, re.I):
        return True
    if re.search(r"visibility\s*:\s*hidden", style, re.I):
        return True
    return False


def _strip_dangerous_attrs(tag) -> None:
    attrs = dict(tag.attrs) if tag.attrs else {}
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
