# AI Web Intelligence System (Probabilistic Routing)

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │         IntelligenceOrchestrator   │
                    └─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
   ┌──────────────┐           ┌──────────────┐            ┌──────────────┐
   │  Stage 1     │           │  Confidence  │            │  Stage 2     │
   │  Probe       │──────────▶│  + Routing   │───────────▶│  Execution   │
   │  (GET only)  │           │  Probability │            │  Chain       │
   └──────────────┘           └──────────────┘            └──────────────┘
          │                           │                           │
   probe_stage.py              preflight_confidence.py      http / api / pw
   network_noise.py            routing_probability.py       fetchers
   domain_cache (bias)          strategy_router.py
```

**Design principle:** preflight produces **confidence and scores**, not pass/fail gates. HTTP execution always runs unless **confirmed** hard block (401/403/410 on repeated probes).

## Render Necessity Layer

```
render_detector.py
  detect_render_requirement(html, url, meta) → RenderDecision
  validate_content_quality(text, html=...) → OK | QUALITY_LOW
```

- SPA shell / Vue / React / Next → `needs_render=true` → blocks HTTP-only success
- `render_required` → single Playwright fallback in orchestrator
- Post-extract `QUALITY_LOW` → `fetch_render_fallback()` once
- `SHORT_PAGE` + SPA signals → **force** Playwright (no longer auto-skips browser)

Debug log field: `render_detection` on fetch meta + `logger.info("render_detection ...")`.

## Module Map

```
app/intelligence/
  render_detector.py       # SPA shell + content quality gates
  probe_stage.py           # Stage 1 GET probe (0–20KB), per-domain semaphore
  network_noise.py         # Unstable network detection + adaptive timeout
  preflight_confidence.py  # PreflightConfidenceModel (0–1 score)
  routing_probability.py   # Weighted http/api/playwright scores → chain
  url_classifier.py        # Soft URLClass from snippet (no HEAD routing)
  strategy_router.py       # Thin wrapper → routing_probability
  execution_policy.py      # Cost order + Playwright budget (25%)
  domain_cache.py          # Per-domain success/latency/block bias
  orchestrator.py          # Two-stage fetch + evidence-gated Playwright
  observability.py         # DecisionTrace + Playwright ratio tracker
  fetchers/                # http, api, playwright, file
```

## Execution Flow

```
URL
  → Stage 1: run_probe_stage (GET stream ≤20KB, retries, domain rate limit)
  → assess_probe_noise (unstable? consistent 403?)
  → soft classify snippet → URLClass (never hard-fail on single 403)
  → compute_preflight_confidence → scores + risk_flags
  → select_strategy_decision → ordered execution_chain
  → Stage 2: for strategy in chain (HTTP first):
        HTTP_ONLY / RETRY_HTTP → HttpFetcher
        API_FETCH → ApiFetcher
        SPA_BROWSER / STEALTH_BROWSER → only if allow_playwright + evidence
  → parse → summarize
```

## PreflightConfidenceModel Schema

```json
{
  "confidence_score": 0.0,
  "signal_quality": "high | medium | low",
  "recommended_strategy": "HTTP_ONLY | API_FETCH | SPA_BROWSER",
  "risk_flags": ["network_unstable", "http_403_unconfirmed", "..."],
  "http_score": 0.0,
  "api_score": 0.0,
  "playwright_score": 0.0,
  "allow_playwright": false,
  "fail_fast_certain": false
}
```

| Signal | Effect |
|--------|--------|
| GET probe body size / entropy | ↑ confidence |
| Retry recovered | ↑ confidence |
| `network_unstable` | ↓ confidence, ↑ HTTP bias |
| Single 403 (unconfirmed) | soft penalty only |
| Confirmed 401/403/410 (2+ probes) | `fail_fast_certain`, BLOCKED class |
| Domain cache HTTP success rate | biases scores |

**HEAD:** optional telemetry only (`PROBE_HEAD_TELEMETRY_ENABLED=true`). Never used in routing.

## Strategy Selection (Pseudocode)

```text
probe = GET_PROBE(url, retries=2, domain_sem=2)
noise = ASSESS_NOISE(probe.attempts)
url_class = SOFT_CLASSIFY(probe.snippet)   # no binary gate
conf = COMPUTE_CONFIDENCE(probe, url_class, noise)
bias = DOMAIN_CACHE.routing_bias(url)

scores.http  = f(conf, url_class, bias.http)
scores.api   = f(conf, api_markers, bias.api)
scores.pw    = f(conf, spa_markers, bias.pw)

allow_pw = (
  playwright_enabled
  AND NOT domain_pw_budget_exceeded
  AND (
    (url_class == SPA_APP AND conf < 0.55 AND spa_markers)
    OR (conf < 0.30 AND repeated_probe_hard_fail)
  )
)

chain = scores.ordered_chain(allow_pw)
primary = argmax(scores)

FOR strategy IN chain:
  IF strategy IN (SPA, STEALTH):
    REQUIRE allow_pw AND (
      url_class == SPA_APP
      OR (conf < 0.30 AND http_failures >= 2 AND probe_failed)
    )
  EXECUTE(strategy)
  ON success: DOMAIN_CACHE.record_success; RETURN
```

## Playwright Trigger (Strict)

Playwright runs **only if all** hold:

1. `settings.playwright_enabled == true`
2. Domain Playwright ratio `< intelligence_max_playwright_domain_ratio` (default **0.25**)
3. `PreflightConfidence.allow_playwright == true` from:
   - **SPA confirmed** (`URLClass.SPA_APP` + `spa_markers`) and confidence &lt; 0.55, **or**
   - confidence &lt; **0.30** and **≥2 probe attempts** with consistent hard failure
4. At execution time:
   - `URLClass.SPA_APP`, **or**
   - confidence &lt; 0.30 **and** probe failed **and** HTTP failed ≥2 times

**Never** trigger Playwright from: single timeout, single HEAD failure, single unconfirmed 403, or `SHORT_PAGE` class.

## Config (env)

| Variable | Default |
|----------|---------|
| `INTELLIGENCE_MAX_PLAYWRIGHT_DOMAIN_RATIO` | 0.25 |
| `PROBE_MAX_BYTES` | 20480 |
| `PROBE_TIMEOUT_SEC` | 14 |
| `PROBE_MAX_RETRIES` | 2 |
| `PROBE_DOMAIN_CONCURRENCY` | 2 |
| `CONFIDENCE_PLAYWRIGHT_THRESHOLD` | 0.30 |
| `PROBE_HEAD_TELEMETRY_ENABLED` | false |

## Expected Improvements

| Area | Mechanism | Expected effect |
|------|-----------|-----------------|
| False negatives | No binary preflight gate; HTTP always attempted | Fewer URLs skipped due to noisy probe |
| Playwright usage | Evidence + 25% domain cap + SHORT_PAGE ban | Lower cost, fewer flaky browser runs |
| Concurrency stability | Per-domain probe semaphore (2) | Less “Server disconnected” amplification |
| Network noise | Retries + adaptive timeout + `network_unstable` flag | Timeouts retried before escalation |
| Routing stability | Probability scores + domain cache bias | Consistent strategy for repeat domains |

## Strategy Priority (execution order by score)

1. HTTP_ONLY / RETRY_HTTP
2. API_FETCH
3. FILE_FETCH
4. SPA_BROWSER / STEALTH_BROWSER (last resort)
