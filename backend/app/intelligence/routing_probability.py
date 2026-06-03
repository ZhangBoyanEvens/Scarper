"""Weighted strategy selection — replaces brittle class→strategy mapping."""

from __future__ import annotations

from app.config import settings
from app.intelligence.domain_cache import get_domain_cache
from app.intelligence.render_detector import has_spa_signals
from app.intelligence.execution_policy import cost_tier
from app.intelligence.observability import get_usage_tracker
from app.intelligence.types import (
    FetchStrategy,
    PreflightConfidence,
    PreflightResult,
    StrategyDecision,
    StrategyScores,
    URLClass,
)


def build_strategy_scores(preflight: PreflightResult) -> StrategyScores:
    conf = preflight.confidence
    if conf:
        return StrategyScores(
            http_score=conf.http_score,
            api_score=conf.api_score,
            playwright_score=conf.playwright_score if conf.allow_playwright else 0.0,
        )
    return StrategyScores(http_score=0.7, api_score=0.2, playwright_score=0.1)


def select_strategy_decision(preflight: PreflightResult) -> StrategyDecision:
    conf = preflight.confidence
    scores = build_strategy_scores(preflight)
    url = preflight.url
    url_class = preflight.classification
    rejected: list[str] = []

    allow_pw = bool(conf and conf.allow_playwright)
    if not settings.playwright_enabled:
        allow_pw = False
        rejected.append("playwright_disabled")

    tracker = get_usage_tracker()
    if allow_pw and tracker.should_block_playwright(url):
        allow_pw = False
        rejected.append("domain_playwright_budget")

    hint = get_domain_cache().get(url).preferred_strategy_hint()
    if hint == "HTTP_ONLY":
        scores = StrategyScores(
            http_score=scores.http_score + 0.08,
            api_score=scores.api_score,
            playwright_score=scores.playwright_score,
        )
    elif hint == "API_FETCH":
        scores = StrategyScores(
            http_score=scores.http_score,
            api_score=scores.api_score + 0.08,
            playwright_score=scores.playwright_score,
        )

    chain_names = scores.ordered_chain(allow_playwright=allow_pw)

    if url_class == URLClass.FILE:
        chain_names = ["FILE_FETCH", "HTTP_ONLY"]
    elif url_class == URLClass.SHORT_PAGE:
        if not has_spa_signals(preflight.classification_signals):
            chain_names = [n for n in chain_names if n not in ("SPA_BROWSER", "STEALTH_BROWSER")]
        if "HTTP_ONLY" not in chain_names:
            chain_names.insert(0, "HTTP_ONLY")

    if conf and conf.fail_fast_certain and url_class == URLClass.BLOCKED:
        chain_names = ["RETRY_HTTP", "HTTP_ONLY"]

    chain = [_name_to_strategy(n) for n in chain_names]
    chain = _dedupe_chain(chain)

    primary_name = scores.argmax_strategy()
    if not allow_pw and primary_name in ("SPA_BROWSER", "STEALTH_BROWSER"):
        primary_name = "HTTP_ONLY"
    primary = _name_to_strategy(primary_name)
    if primary not in chain:
        chain = [primary, *chain]

    confidence = conf.confidence_score if conf else 0.5
    reason = _build_reason(preflight, scores, primary, allow_pw)

    return StrategyDecision(
        strategy=primary,
        confidence=confidence,
        reason=reason,
        estimated_cost=cost_tier(primary),
        url_class=url_class,
        rejected_strategies=rejected,
        execution_chain=chain,
        strategy_scores=scores,
        preflight_confidence=conf,
    )


def _dedupe_chain(chain: list[FetchStrategy]) -> list[FetchStrategy]:
    seen: set[FetchStrategy] = set()
    out: list[FetchStrategy] = []
    for s in chain:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _name_to_strategy(name: str) -> FetchStrategy:
    return FetchStrategy(name)


def _build_reason(
    preflight: PreflightResult,
    scores: StrategyScores,
    primary: FetchStrategy,
    allow_pw: bool,
) -> str:
    conf = preflight.confidence
    signals = ", ".join(preflight.classification_signals[:4]) or "none"
    sq = conf.signal_quality if conf else "unknown"
    cs = conf.confidence_score if conf else 0
    return (
        f"prob_route → {primary.value} "
        f"(conf={cs:.2f}, quality={sq}, "
        f"scores=http:{scores.http_score:.2f}/api:{scores.api_score:.2f}/"
        f"pw:{scores.playwright_score:.2f}, pw_allowed={allow_pw}; "
        f"class={preflight.classification.value}; signals={signals})"
    )
