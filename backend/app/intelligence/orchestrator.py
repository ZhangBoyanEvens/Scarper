"""AI Web Intelligence orchestrator — render-aware execution (render drives route)."""

import logging
import time

from app.config import settings
from app.crawler.failure_detection import analyze_html, raise_if_failure, visible_text_length
from app.crawler.playwright.content_extractable import is_content_extractable
from app.crawler.types import FetchError, FetchResult
from app.intelligence.domain_cache import get_domain_cache
from app.intelligence.execution_policy import escalation_chain
from app.intelligence.fetchers.api_fetcher import ApiFetcher
from app.intelligence.fetchers.file_fetcher import FileFetcher
from app.intelligence.fetchers.http_fetcher import HttpFetcher
from app.intelligence.fetchers.playwright_executor import PlaywrightExecutor
from app.intelligence.observability import (
    get_usage_tracker,
    log_decision_trace,
    timed_stage,
)
from app.intelligence.render_detector import (
    RenderDecision,
    detect_render_requirement,
    has_spa_signals,
    log_render_detection,
)
from app.intelligence.strategy_router import StrategyRouter
from app.intelligence.types import (
    DecisionTrace,
    ExecutionTrace,
    FetchStrategy,
    PreflightResult,
    URLClass,
)
from app.intelligence.url_classifier import run_preflight

logger = logging.getLogger(__name__)

_BROWSER_STRATEGIES = (FetchStrategy.SPA_BROWSER, FetchStrategy.STEALTH_BROWSER)
_HTTP_STRATEGIES = (FetchStrategy.HTTP_ONLY, FetchStrategy.RETRY_HTTP, FetchStrategy.API_FETCH)


class IntelligenceOrchestrator:
    """Render detection drives route; HTTP success never bypasses post-fetch validation."""

    def __init__(self) -> None:
        self._router = StrategyRouter()
        self._http = HttpFetcher()
        self._api = ApiFetcher()
        self._file = FileFetcher()
        self._browser: PlaywrightExecutor | None = None

    def _browser_exec(self) -> PlaywrightExecutor:
        if self._browser is None:
            self._browser = PlaywrightExecutor()
        return self._browser

    async def fetch(self, url: str, *, render_fallback_only: bool = False) -> FetchResult:
        if render_fallback_only:
            exec_trace = ExecutionTrace(
                url=url,
                playwright_enabled=settings.playwright_enabled,
                route_selected=FetchStrategy.SPA_BROWSER.value,
                fallback_triggered=True,
                render_fallback_used=True,
            )
            return await self._fetch_playwright_once(
                url,
                reason="content_quality_fallback",
                exec_trace=exec_trace,
            )

        started = time.perf_counter()
        trace = DecisionTrace(url=url, url_class=URLClass.UNKNOWN)
        exec_trace = ExecutionTrace(
            url=url,
            playwright_enabled=settings.playwright_enabled,
        )
        domain_cache = get_domain_cache()
        render_fallback_used = False

        async with timed_stage(trace, "probe"):
            preflight = await run_preflight(url)
            trace.url_class = preflight.classification
            trace.preflight_signals = list(preflight.classification_signals)
            if preflight.confidence:
                trace.preflight_signals.extend(
                    [f"conf={preflight.confidence.confidence_score:.2f}"],
                )
                trace.preflight_signals.extend(preflight.confidence.risk_flags[:5])

        probe_render = detect_render_requirement(
            preflight.html_snippet or "",
            url,
            {"url_class": preflight.classification.value},
        )
        log_render_detection(url, probe_render)
        self._apply_probe_render_to_trace(exec_trace, probe_render)

        render_required = probe_render.needs_render
        conf = preflight.confidence

        decision = self._router.route(preflight)
        trace.primary_decision = decision
        trace.strategies_rejected = list(decision.rejected_strategies)

        chain = self._resolve_execution_chain(
            preflight=preflight,
            url=url,
            conf=conf,
            decision=decision,
            render_required=render_required,
            exec_trace=exec_trace,
        )

        last_error: FetchError | None = None
        html_hint = preflight.html_snippet
        prior_http_result: FetchResult | None = None
        http_failures = 0
        probe_failures = not (preflight.probe and any(a.ok for a in preflight.probe.attempts))
        last_render_decision = probe_render

        for strategy in chain:
            if strategy in _BROWSER_STRATEGIES:
                if not self._may_use_playwright(
                    render_required=render_required,
                    url_class=preflight.classification,
                    signals=preflight.classification_signals,
                ):
                    trace.strategies_rejected.append(f"{strategy.value}:playwright_gated")
                    continue

            trace.strategies_attempted.append(strategy.value)
            exec_trace.strategies_attempted.append(strategy.value)
            stage_start = time.perf_counter()

            try:
                async with timed_stage(trace, strategy.value):
                    result = await self._execute_strategy(
                        strategy,
                        url,
                        html_hint=html_hint,
                    )

                render_decision = detect_render_requirement(
                    result.html,
                    url,
                    {
                        "url_class": preflight.classification.value,
                        "strategy": strategy.value,
                    },
                )
                last_render_decision = render_decision
                log_render_detection(url, render_decision)
                exec_trace.post_fetch_validation_ran = True
                result.meta = {
                    **(result.meta or {}),
                    "render_detection": render_decision.to_debug_log(url),
                }

                if strategy in _HTTP_STRATEGIES:
                    prior_http_result = result

                if strategy in _HTTP_STRATEGIES and render_decision.needs_render:
                    if not settings.playwright_enabled:
                        raise FetchError(
                            "页面需要 JavaScript 渲染，当前未启用 Playwright",
                            "js_required",
                        )
                    if render_fallback_used:
                        raise FetchError(
                            f"浏览器渲染后仍为 SPA 空壳（{render_decision.reason}）",
                            "js_required",
                        )
                    trace.fallback_reasons.append(
                        f"{strategy.value}:render_required:{render_decision.reason}",
                    )
                    render_fallback_used = True
                    exec_trace.fallback_triggered = True
                    exec_trace.render_fallback_used = True
                    return await self._fetch_playwright_once(
                        url,
                        reason=render_decision.reason,
                        exec_trace=exec_trace,
                        trace=trace,
                        started=started,
                        stage_start=stage_start,
                        prior_http=prior_http_result,
                        preflight=preflight,
                    )

                self._validate_fetch_html(
                    result,
                    url,
                    strategy=strategy,
                    is_browser=strategy in _BROWSER_STRATEGIES,
                )

                trace.winning_strategy = strategy.value
                trace.total_ms = (time.perf_counter() - started) * 1000
                used_pw = strategy in _BROWSER_STRATEGIES
                get_usage_tracker().record(url, used_pw)
                domain_cache.record_success(
                    url,
                    strategy=strategy.value,
                    latency_ms=(time.perf_counter() - stage_start) * 1000,
                )
                log_decision_trace(trace)
                exec_trace.early_return = True
                exec_trace.route_selected = strategy.value

                result.meta = self._attach_meta(result.meta, trace, exec_trace, render_fallback_used)
                return result

            except FetchError as e:
                last_error = e
                trace.fallback_reasons.append(f"{strategy.value}:{e.code}")
                domain_cache.record_failure(
                    url,
                    block_like=e.code
                    in ("cloudflare", "captcha", "blocked", "http_error", "render_required"),
                )
                if strategy in _HTTP_STRATEGIES:
                    http_failures += 1

                if e.code == "js_required":
                    fallback = await self._try_http_fallback_after_js_required(
                        url,
                        preflight=preflight,
                        prior_http=prior_http_result,
                        trace=trace,
                        exec_trace=exec_trace,
                        started=started,
                    )
                    if fallback is not None:
                        return fallback
                    logger.info(
                        "js_required_continue url=%s strategy=%s — trying next in chain",
                        url,
                        strategy.value,
                    )
                    continue

                if e.code == "playwright_disabled":
                    trace.total_ms = (time.perf_counter() - started) * 1000
                    log_decision_trace(trace)
                    logger.info("execution_trace %s", exec_trace.to_dict())
                    raise

                if (
                    e.code == "render_required"
                    and settings.playwright_enabled
                    and not render_fallback_used
                ):
                    render_fallback_used = True
                    exec_trace.fallback_triggered = True
                    exec_trace.render_fallback_used = True
                    try:
                        return await self._fetch_playwright_once(
                            url,
                            reason=last_render_decision.reason,
                            exec_trace=exec_trace,
                            trace=trace,
                            started=started,
                            stage_start=stage_start,
                            prior_http=prior_http_result,
                            preflight=preflight,
                        )
                    except FetchError as pw_err:
                        if pw_err.code == "js_required":
                            fallback = await self._try_http_fallback_after_js_required(
                                url,
                                preflight=preflight,
                                prior_http=prior_http_result,
                                trace=trace,
                                exec_trace=exec_trace,
                                started=started,
                            )
                            if fallback is not None:
                                return fallback
                        last_error = pw_err
                        last_error = pw_err
                        trace.fallback_reasons.append(
                            f"playwright_render_fallback:{pw_err.code}",
                        )

                logger.info(
                    "strategy_failed url=%s strategy=%s code=%s",
                    url,
                    strategy.value,
                    e.code,
                )
                if strategy == FetchStrategy.HTTP_ONLY and html_hint:
                    html_hint = ""

        trace.total_ms = (time.perf_counter() - started) * 1000
        log_decision_trace(trace)
        logger.info("execution_trace %s", exec_trace.to_dict())
        if last_error:
            raise last_error
        raise FetchError("所有抓取策略均失败", "fetch_failed")

    async def fetch_render_fallback(self, url: str, *, reason: str = "content_quality_low") -> FetchResult:
        exec_trace = ExecutionTrace(
            url=url,
            playwright_enabled=settings.playwright_enabled,
            route_selected=FetchStrategy.SPA_BROWSER.value,
            fallback_triggered=True,
            quality_retry_triggered=True,
        )
        return await self._fetch_playwright_once(url, reason=reason, exec_trace=exec_trace)

    def _resolve_execution_chain(
        self,
        *,
        preflight,
        url: str,
        conf,
        decision,
        render_required: bool,
        exec_trace: ExecutionTrace,
    ) -> list[FetchStrategy]:
        """Render requirement overrides probabilistic router ordering."""
        if render_required:
            if settings.playwright_enabled:
                exec_trace.route_selected = FetchStrategy.SPA_BROWSER.value
                chain = [
                    FetchStrategy.SPA_BROWSER,
                    FetchStrategy.STEALTH_BROWSER,
                    FetchStrategy.HTTP_ONLY,
                    FetchStrategy.RETRY_HTTP,
                    FetchStrategy.API_FETCH,
                ]
            else:
                exec_trace.route_selected = FetchStrategy.HTTP_ONLY.value
                chain = [
                    FetchStrategy.HTTP_ONLY,
                    FetchStrategy.RETRY_HTTP,
                    FetchStrategy.API_FETCH,
                ]
            return self._dedupe_chain(chain)

        allow_pw = bool(conf and conf.allow_playwright) or has_spa_signals(
            preflight.classification_signals,
        )
        chain = decision.execution_chain or escalation_chain(
            preflight.classification,
            url,
            preflight_confidence=conf,
            playwright_allowed=allow_pw,
        )
        if not allow_pw:
            chain = [s for s in chain if s not in _BROWSER_STRATEGIES]
        exec_trace.route_selected = (
            decision.strategy.value if decision else FetchStrategy.HTTP_ONLY.value
        )
        return chain

    def _validate_fetch_html(
        self,
        result: FetchResult,
        requested_url: str,
        *,
        strategy: FetchStrategy,
        is_browser: bool,
    ) -> None:
        analysis = analyze_html(
            result.html,
            final_url=result.url,
            requested_url=requested_url,
            status_code=result.status_code,
        )
        if analysis and analysis.code in (
            "cloudflare",
            "captcha",
            "blocked",
            "render_required",
        ):
            raise FetchError(analysis.message, analysis.code)

        if is_browser:
            post_render = detect_render_requirement(
                result.html,
                requested_url,
                {"strategy": strategy.value},
            )
            vis = visible_text_length(result.html)
            if post_render.needs_render and vis < 150:
                raise FetchError(
                    f"浏览器渲染后内容仍不足（{post_render.reason}）",
                    "js_required",
                )

        raise_if_failure(analysis)

    async def _fetch_playwright_once(
        self,
        url: str,
        *,
        reason: str,
        exec_trace: ExecutionTrace,
        trace: DecisionTrace | None = None,
        started: float | None = None,
        stage_start: float | None = None,
        prior_http: FetchResult | None = None,
        preflight: PreflightResult | None = None,
    ) -> FetchResult:
        if not settings.playwright_enabled:
            raise FetchError(
                "当前部署未启用浏览器渲染（Playwright）",
                "playwright_disabled",
            )
        logger.info("playwright_render_fallback url=%s reason=%s", url, reason)
        exec_trace.fallback_triggered = True
        exec_trace.render_fallback_used = True
        exec_trace.route_selected = FetchStrategy.SPA_BROWSER.value
        exec_trace.strategies_attempted.append(FetchStrategy.SPA_BROWSER.value)

        try:
            result = await self._browser_exec().execute(url, FetchStrategy.SPA_BROWSER)
            exec_trace.post_fetch_validation_ran = True

            self._validate_fetch_html(
                result,
                url,
                strategy=FetchStrategy.SPA_BROWSER,
                is_browser=True,
            )
        except FetchError as e:
            if e.code == "js_required" and trace is not None and started is not None:
                fallback = await self._try_http_fallback_after_js_required(
                    url,
                    preflight=preflight or PreflightResult(url=url),
                    prior_http=prior_http,
                    trace=trace,
                    exec_trace=exec_trace,
                    started=started,
                )
                if fallback is not None:
                    return fallback
            raise

        render_decision = detect_render_requirement(
            result.html,
            url,
            {"strategy": "SPA_BROWSER"},
        )
        log_render_detection(url, render_decision)

        if trace and started is not None and stage_start is not None:
            trace.winning_strategy = FetchStrategy.SPA_BROWSER.value
            trace.total_ms = (time.perf_counter() - started) * 1000
            get_usage_tracker().record(url, True)
            log_decision_trace(trace)

        exec_trace.early_return = True
        result.meta = {
            **(result.meta or {}),
            "render_detection": render_decision.to_debug_log(url),
            "render_fallback_used": True,
            "render_fallback_reason": reason,
            "execution_trace": exec_trace.to_dict(),
        }
        if trace:
            result.meta["intelligence_trace"] = trace.to_dict()
        logger.info("execution_trace %s", exec_trace.to_dict())
        return result

    @staticmethod
    def _static_html_sufficient(html: str) -> bool:
        """Probe snippet or prior HTTP body has enough static text for extraction."""
        return is_content_extractable(html or "")

    async def _try_http_fallback_after_js_required(
        self,
        url: str,
        *,
        preflight: PreflightResult,
        prior_http: FetchResult | None,
        trace: DecisionTrace,
        exec_trace: ExecutionTrace,
        started: float,
    ) -> FetchResult | None:
        """Reuse probe/prior HTTP when Playwright reports js_required but static HTML is enough."""
        source: str | None = None
        candidate: FetchResult | None = None

        if prior_http and self._static_html_sufficient(prior_http.html):
            candidate = prior_http
            source = "prior_http"
        elif self._static_html_sufficient(preflight.html_snippet or ""):
            try:
                candidate = await self._http.fetch(url)
            except FetchError:
                return None
            if not self._static_html_sufficient(candidate.html):
                return None
            source = "http_refetch"

        if candidate is None or source is None:
            return None

        try:
            self._validate_fetch_html(
                candidate,
                url,
                strategy=FetchStrategy.HTTP_ONLY,
                is_browser=False,
            )
        except FetchError:
            logger.info(
                "http_fallback_after_js_required rejected url=%s source=%s",
                url,
                source,
            )
            return None

        stage_ms = (time.perf_counter() - started) * 1000
        trace.fallback_reasons.append(f"js_required:http_fallback:{source}")
        trace.winning_strategy = FetchStrategy.HTTP_ONLY.value
        trace.total_ms = stage_ms
        trace.strategies_attempted.append(FetchStrategy.HTTP_ONLY.value)
        exec_trace.route_selected = FetchStrategy.HTTP_ONLY.value
        exec_trace.early_return = True
        exec_trace.strategies_attempted.append(FetchStrategy.HTTP_ONLY.value)
        get_usage_tracker().record(url, False)
        get_domain_cache().record_success(
            url,
            strategy=FetchStrategy.HTTP_ONLY.value,
            latency_ms=stage_ms,
        )
        log_decision_trace(trace)

        candidate.meta = self._attach_meta(
            {
                **(candidate.meta or {}),
                "http_fallback_after_js_required": True,
                "http_fallback_source": source,
            },
            trace,
            exec_trace,
            render_fallback_used=bool(exec_trace.render_fallback_used),
        )
        logger.info(
            "http_fallback_after_js_required url=%s source=%s vis=%s",
            url,
            source,
            visible_text_length(candidate.html),
        )
        return candidate

    @staticmethod
    def _apply_probe_render_to_trace(
        exec_trace: ExecutionTrace,
        probe_render: RenderDecision,
    ) -> None:
        exec_trace.render_detected = probe_render.needs_render
        exec_trace.render_confidence = probe_render.confidence
        exec_trace.render_reason = probe_render.reason

    @staticmethod
    def _attach_meta(
        meta: dict | None,
        trace: DecisionTrace,
        exec_trace: ExecutionTrace,
        render_fallback_used: bool,
    ) -> dict:
        return {
            **(meta or {}),
            "intelligence_trace": trace.to_dict(),
            "execution_trace": exec_trace.to_dict(),
            "render_fallback_used": render_fallback_used,
        }

    @staticmethod
    def _dedupe_chain(chain: list[FetchStrategy]) -> list[FetchStrategy]:
        seen: set[FetchStrategy] = set()
        out: list[FetchStrategy] = []
        for s in chain:
            if s not in seen:
                seen.add(s)
                out.append(s)
        return out

    def _may_use_playwright(
        self,
        *,
        render_required: bool,
        url_class: URLClass,
        signals: list[str],
    ) -> bool:
        if not settings.playwright_enabled:
            return False
        if render_required:
            return True
        if has_spa_signals(signals) and url_class in (URLClass.SPA_APP, URLClass.SHORT_PAGE):
            return True
        if url_class == URLClass.SPA_APP:
            return True
        return False

    async def _execute_strategy(
        self,
        strategy: FetchStrategy,
        url: str,
        *,
        html_hint: str,
    ) -> FetchResult:
        if strategy in (FetchStrategy.HTTP_ONLY, FetchStrategy.RETRY_HTTP):
            return await self._http.fetch(url)

        if strategy == FetchStrategy.API_FETCH:
            return await self._api.fetch(url, html_hint=html_hint)

        if strategy == FetchStrategy.FILE_FETCH:
            await self._file.fetch(url)
            raise FetchError("file fetch unreachable", "blocked_file_type")

        if strategy in _BROWSER_STRATEGIES:
            if not settings.playwright_enabled:
                raise FetchError(
                    "当前部署未启用浏览器渲染（Playwright）",
                    "playwright_disabled",
                )
            return await self._browser_exec().execute(url, strategy)

        raise FetchError(f"未知策略: {strategy}", "fetch_failed")

    async def execute_strategy(
        self,
        strategy: FetchStrategy,
        url: str,
        *,
        html_hint: str = "",
    ) -> FetchResult:
        return await self._execute_strategy(strategy, url, html_hint=html_hint)

    async def close(self) -> None:
        if self._browser:
            await self._browser.close()
            self._browser = None


_orchestrator: IntelligenceOrchestrator | None = None


def get_orchestrator() -> IntelligenceOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = IntelligenceOrchestrator()
    return _orchestrator
