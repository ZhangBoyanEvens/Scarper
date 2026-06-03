import json
import logging
import re
from urllib.parse import urljoin, urlparse

import trafilatura
from bs4 import BeautifulSoup

from app.config import settings
from app.models.schemas import StructuredPage
from app.sanitizer.html_cleaner import clean_html, scrub_text_for_llm

logger = logging.getLogger(__name__)


def extract_structured(cleaned_html: str, base_url: str) -> StructuredPage:
    soup = BeautifulSoup(cleaned_html, "lxml")

    title = _extract_title(soup)
    description = _extract_description(soup)

    # Readability-style main text via trafilatura (precision first, recall fallback for SPA)
    main_text = trafilatura.extract(
        cleaned_html,
        url=base_url,
        include_comments=False,
        include_tables=True,
        favor_precision=True,
    )
    if not (main_text or "").strip():
        main_text = trafilatura.extract(
            cleaned_html,
            url=base_url,
            include_comments=False,
            include_tables=True,
            favor_precision=False,
        )
    if not (main_text or "").strip():
        main_text = _fallback_body_text(soup)
    else:
        main_text = _prefer_richer_extraction(main_text, soup)

    main_text = scrub_text_for_llm(main_text or "")

    if len(main_text) > settings.max_content_chars:
        main_text = main_text[: settings.max_content_chars] + "\n[truncated]"

    headings = _extract_headings(soup)
    links = _extract_links(soup, base_url)
    tables = _extract_tables(soup)

    return StructuredPage(
        title=title,
        description=description,
        main_content=main_text,
        headings=headings[:30],
        links=links[:50],
        tables=tables[:5],
    )


def structured_to_llm_payload(page: StructuredPage) -> str:
    """Never send raw HTML — only structured JSON to the LLM."""
    payload = page.model_dump()
    text = json.dumps(payload, ensure_ascii=False)
    if len(text) > settings.max_llm_chars:
        payload["main_content"] = payload["main_content"][
            : settings.max_llm_chars - 500
        ] + "…"
        payload["links"] = payload["links"][:20]
        payload["tables"] = []
        text = json.dumps(payload, ensure_ascii=False)
    return text


def _fallback_body_text(soup: BeautifulSoup) -> str:
    """When trafilatura fails on SPA/Vue DOM, use visible body text."""
    for sel in ("main", "article", "[role='main']", "#app", "#root"):
        node = soup.select_one(sel)
        if node:
            t = node.get_text("\n", strip=True)
            if len(t) >= 80:
                return t
    body = soup.body or soup
    return body.get_text("\n", strip=True)


def _prefer_richer_extraction(trafilatura_text: str, soup: BeautifulSoup) -> str:
    """Trafilatura can miss card grids; prefer body text when it is much richer."""
    trimmed = (trafilatura_text or "").strip()
    if len(trimmed) >= 400:
        return trimmed
    fallback = _fallback_body_text(soup)
    if len(fallback) >= 200 and len(fallback) > len(trimmed) * 1.4:
        return fallback
    return trimmed


def _extract_title(soup: BeautifulSoup) -> str:
    if soup.title and soup.title.string:
        return scrub_text_for_llm(soup.title.string.strip())
    h1 = soup.find("h1")
    if h1:
        return scrub_text_for_llm(h1.get_text(" ", strip=True))
    return ""


def _extract_description(soup: BeautifulSoup) -> str:
    og = soup.find("meta", property="og:description")
    if og and og.get("content"):
        return scrub_text_for_llm(og["content"])
    p = soup.find("p")
    if p:
        t = p.get_text(" ", strip=True)
        return scrub_text_for_llm(t[:300])
    return ""


def _extract_headings(soup: BeautifulSoup) -> list[str]:
    out: list[str] = []
    for level in range(1, 4):
        for h in soup.find_all(f"h{level}"):
            t = h.get_text(" ", strip=True)
            if t and t not in out:
                out.append(scrub_text_for_llm(t))
    return out


def _extract_links(soup: BeautifulSoup, base_url: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith("#"):
            continue
        if href.lower().startswith(("javascript:", "mailto:", "tel:", "data:")):
            continue
        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)
        if parsed.scheme not in ("http", "https"):
            continue
        if absolute not in seen:
            seen.add(absolute)
            out.append(absolute)
    return out


def _extract_tables(soup: BeautifulSoup) -> list[list[list[str]]]:
    tables: list[list[list[str]]] = []
    for table in soup.find_all("table")[:5]:
        rows: list[list[str]] = []
        for tr in table.find_all("tr")[:30]:
            cells = [
                scrub_text_for_llm(c.get_text(" ", strip=True))
                for c in tr.find_all(["th", "td"])
            ]
            if cells:
                rows.append(cells)
        if rows:
            tables.append(rows)
    return tables
