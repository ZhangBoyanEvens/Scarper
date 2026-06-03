"""Core types for the AI Web Intelligence routing layer."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal

from app.crawler.types import CrawlTimings, FetchMethod


class URLClass(str, Enum):
    STATIC_ARTICLE = "STATIC_ARTICLE"
    SPA_APP = "SPA_APP"
    API_LIKE = "API_LIKE"
    BLOCKED = "BLOCKED"
    SHORT_PAGE = "SHORT_PAGE"
    FILE = "FILE"
    UNKNOWN = "UNKNOWN"


class FetchStrategy(str, Enum):
    HTTP_ONLY = "HTTP_ONLY"
    API_FETCH = "API_FETCH"
    FILE_FETCH = "FILE_FETCH"
    SPA_BROWSER = "SPA_BROWSER"
    STEALTH_BROWSER = "STEALTH_BROWSER"
    RETRY_HTTP = "RETRY_HTTP"


CostTier = Literal["low", "medium", "high"]

FetchStage = Literal["HTTP_FETCH", "API_FETCH", "PLAYWRIGHT", "FILE_FETCH", "PARSE", "AI"]


class ErrorType(str, Enum):
    TIMEOUT = "TIMEOUT"
    BLOCKED = "BLOCKED"
    CAPTCHA = "CAPTCHA"
    EMPTY_PAGE = "EMPTY_PAGE"
    HTTP_ERROR = "HTTP_ERROR"
    JS_REQUIRED = "JS_REQUIRED"
    NON_HTML = "NON_HTML"
    FILE_UNSUPPORTED = "FILE_UNSUPPORTED"
    INTERNAL = "INTERNAL"


SignalQuality = Literal["high", "medium", "low"]


@dataclass
class ProbeAttempt:
    url: str
    status_code: int | None = None
    final_url: str | None = None
    content_type: str = ""
    snippet: str = ""
    bytes_received: int = 0
    latency_ms: float = 0.0
    redirect_count: int = 0
    error: str | None = None
    ok: bool = False


@dataclass
class NoiseAssessmentSnapshot:
    network_unstable: bool = False
    consistent_hard_failure: bool = False
    detail: str = ""


@dataclass
class ProbeBundle:
    url: str
    attempts: list[ProbeAttempt] = field(default_factory=list)
    final_url: str | None = None
    status_code: int | None = None
    content_type: str = ""
    snippet: str = ""
    bytes_received: int = 0
    latency_ms: float = 0.0
    noise: NoiseAssessmentSnapshot | None = None
    head_telemetry: dict | None = None


@dataclass
class PreflightConfidence:
    confidence_score: float
    signal_quality: SignalQuality
    recommended_strategy: str
    risk_flags: list[str] = field(default_factory=list)
    http_score: float = 0.0
    api_score: float = 0.0
    playwright_score: float = 0.0
    allow_playwright: bool = False
    fail_fast_certain: bool = False


@dataclass
class StrategyScores:
    http_score: float
    api_score: float
    playwright_score: float

    def argmax_strategy(self) -> str:
        scores = {
            "HTTP_ONLY": self.http_score,
            "API_FETCH": self.api_score,
            "SPA_BROWSER": self.playwright_score,
        }
        return max(scores, key=scores.get)  # type: ignore[arg-type]

    def ordered_chain(self, *, allow_playwright: bool) -> list[str]:
        ranked = sorted(
            [
                ("HTTP_ONLY", self.http_score),
                ("RETRY_HTTP", self.http_score * 0.95),
                ("API_FETCH", self.api_score),
                ("SPA_BROWSER", self.playwright_score if allow_playwright else -1.0),
                ("STEALTH_BROWSER", (self.playwright_score * 0.9) if allow_playwright else -1.0),
            ],
            key=lambda x: x[1],
            reverse=True,
        )
        seen: set[str] = set()
        chain: list[str] = []
        for name, _ in ranked:
            if name in seen:
                continue
            if name in ("SPA_BROWSER", "STEALTH_BROWSER") and not allow_playwright:
                continue
            seen.add(name)
            chain.append(name)
        if "HTTP_ONLY" not in chain:
            chain.insert(0, "HTTP_ONLY")
        return chain


@dataclass
class PreflightResult:
    url: str
    final_url: str | None = None
    status_code: int | None = None
    content_type: str = ""
    content_length: int | None = None
    html_snippet: str = ""
    classification: URLClass = URLClass.UNKNOWN
    classification_signals: list[str] = field(default_factory=list)
    confidence: PreflightConfidence | None = None
    probe: ProbeBundle | None = None

    @property
    def head_html_snippet(self) -> str:
        """Backward compat alias for execution hint."""
        return self.html_snippet


@dataclass
class ExecutionTrace:
    """Unified render-aware execution record (orchestrator + pipeline)."""

    url: str
    render_detected: bool = False
    render_confidence: float = 0.0
    render_reason: str = ""
    route_selected: str = ""
    playwright_enabled: bool = False
    fallback_triggered: bool = False
    render_fallback_used: bool = False
    early_return: bool = False
    post_fetch_validation_ran: bool = False
    quality_retry_triggered: bool = False
    strategies_attempted: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "render_detected": self.render_detected,
            "render_confidence": round(self.render_confidence, 3),
            "render_reason": self.render_reason,
            "route_selected": self.route_selected,
            "playwright_enabled": self.playwright_enabled,
            "fallback_triggered": self.fallback_triggered,
            "render_fallback_used": self.render_fallback_used,
            "early_return": self.early_return,
            "post_fetch_validation_ran": self.post_fetch_validation_ran,
            "quality_retry_triggered": self.quality_retry_triggered,
            "strategies_attempted": self.strategies_attempted,
        }


@dataclass
class StrategyDecision:
    strategy: FetchStrategy
    confidence: float
    reason: str
    estimated_cost: CostTier
    url_class: URLClass
    rejected_strategies: list[str] = field(default_factory=list)
    execution_chain: list["FetchStrategy"] = field(default_factory=list)
    strategy_scores: StrategyScores | None = None
    preflight_confidence: PreflightConfidence | None = None


@dataclass
class StructuredFailure:
    error_type: ErrorType
    stage: FetchStage
    message: str
    recoverable: bool
    recommended_action: str
    error_code: str = "fetch_failed"

    def to_fetch_error(self):
        from app.crawler.types import FetchError

        return FetchError(self.message, self.error_code)


@dataclass
class StageTiming:
    stage: str
    duration_ms: float
    success: bool
    detail: str = ""


@dataclass
class DecisionTrace:
    url: str
    url_class: URLClass
    preflight_signals: list[str] = field(default_factory=list)
    primary_decision: StrategyDecision | None = None
    strategies_attempted: list[str] = field(default_factory=list)
    strategies_rejected: list[str] = field(default_factory=list)
    stage_timings: list[StageTiming] = field(default_factory=list)
    fallback_reasons: list[str] = field(default_factory=list)
    winning_strategy: str | None = None
    total_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        pc = (
            self.primary_decision.preflight_confidence
            if self.primary_decision
            else None
        )
        return {
            "url": self.url,
            "url_class": self.url_class.value,
            "preflight_signals": self.preflight_signals,
            "preflight_confidence_score": pc.confidence_score if pc else None,
            "signal_quality": pc.signal_quality if pc else None,
            "risk_flags": list(pc.risk_flags) if pc else [],
            "strategy_scores": (
                {
                    "http": self.primary_decision.strategy_scores.http_score,
                    "api": self.primary_decision.strategy_scores.api_score,
                    "playwright": self.primary_decision.strategy_scores.playwright_score,
                }
                if self.primary_decision and self.primary_decision.strategy_scores
                else None
            ),
            "primary_strategy": (
                self.primary_decision.strategy.value if self.primary_decision else None
            ),
            "confidence": self.primary_decision.confidence if self.primary_decision else 0,
            "reason": self.primary_decision.reason if self.primary_decision else "",
            "estimated_cost": (
                self.primary_decision.estimated_cost if self.primary_decision else None
            ),
            "strategies_attempted": self.strategies_attempted,
            "strategies_rejected": self.strategies_rejected,
            "fallback_reasons": self.fallback_reasons,
            "winning_strategy": self.winning_strategy,
            "stage_timings": [
                {
                    "stage": t.stage,
                    "duration_ms": t.duration_ms,
                    "success": t.success,
                    "detail": t.detail,
                }
                for t in self.stage_timings
            ],
            "total_ms": round(self.total_ms, 2),
        }


@dataclass
class IntelligenceFetchResult:
    url: str
    html: str
    method: FetchMethod
    status_code: int
    strategy_used: FetchStrategy
    trace: DecisionTrace
    timings: CrawlTimings = field(default_factory=CrawlTimings)
    title: str = ""
    meta: dict[str, Any] = field(default_factory=dict)
