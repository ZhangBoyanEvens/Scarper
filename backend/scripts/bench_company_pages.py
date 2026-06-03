"""
Company / product landing page benchmark (E2E or fetch-only).

Differs from bench_extract.py:
  - Curated B2B SaaS / product marketing URLs with categories
  - Accessibility pre-check (HEAD + short GET) before expensive work
  - Reports: JSON file + grouped console summary (by category & domain)
  - Records intelligence routing metadata when available

Usage (from backend/):
  python scripts/bench_company_pages.py              # fetch-only (fast)
  python scripts/bench_company_pages.py --full       # full pipeline + AI summary
  python scripts/bench_company_pages.py --precheck   # only verify URLs are reachable
  python scripts/bench_company_pages.py --limit 5    # smoke test
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings

# ---------------------------------------------------------------------------
# Sample set: public marketing / product pages (no login). id is stable for diffs.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CompanyPageCase:
    id: str
    company: str
    category: str  # COMPANY | PRODUCT | PRICING | PLATFORM
    url: str
    note: str = ""


CASES: list[CompanyPageCase] = [
    CompanyPageCase("stripe-home", "Stripe", "PRODUCT", "https://stripe.com/"),
    CompanyPageCase("stripe-pricing", "Stripe", "PRICING", "https://stripe.com/pricing"),
    CompanyPageCase("figma-home", "Figma", "PRODUCT", "https://www.figma.com/"),
    CompanyPageCase("figma-pricing", "Figma", "PRICING", "https://www.figma.com/pricing/"),
    CompanyPageCase("notion-product", "Notion", "PRODUCT", "https://www.notion.com/product"),
    CompanyPageCase("linear-home", "Linear", "PRODUCT", "https://linear.app/"),
    CompanyPageCase("vercel-home", "Vercel", "PRODUCT", "https://vercel.com/"),
    CompanyPageCase("shopify-home", "Shopify", "PRODUCT", "https://www.shopify.com/"),
    CompanyPageCase("atlassian-jira", "Atlassian", "PRODUCT", "https://www.atlassian.com/software/jira"),
    CompanyPageCase("atlassian-about", "Atlassian", "COMPANY", "https://www.atlassian.com/company"),
    CompanyPageCase("slack-features", "Slack", "PRODUCT", "https://slack.com/features"),
    CompanyPageCase("cloudflare-dev", "Cloudflare", "PLATFORM", "https://www.cloudflare.com/developer-platform/"),
    CompanyPageCase("cloudflare-plans", "Cloudflare", "PRICING", "https://www.cloudflare.com/plans/"),
    CompanyPageCase("anthropic-about", "Anthropic", "COMPANY", "https://www.anthropic.com/company"),
    CompanyPageCase("openai-about", "OpenAI", "COMPANY", "https://openai.com/about/"),
    CompanyPageCase("microsoft-365", "Microsoft", "PRODUCT", "https://www.microsoft.com/en-us/microsoft-365"),
    CompanyPageCase("apple-mac", "Apple", "PRODUCT", "https://www.apple.com/mac/"),
    CompanyPageCase("docker-desktop", "Docker", "PRODUCT", "https://www.docker.com/products/docker-desktop/"),
    CompanyPageCase("github-features", "GitHub", "PRODUCT", "https://github.com/features"),
    CompanyPageCase("gitlab-about", "GitLab", "COMPANY", "https://about.gitlab.com/"),
    CompanyPageCase("mongodb-platform", "MongoDB", "PRODUCT", "https://www.mongodb.com/products/platform"),
    CompanyPageCase("datadog-infra", "Datadog", "PRODUCT", "https://www.datadoghq.com/product/infrastructure-monitoring/"),
    CompanyPageCase("hubspot-crm", "HubSpot", "PRODUCT", "https://www.hubspot.com/products/crm"),
    CompanyPageCase("canva-about", "Canva", "COMPANY", "https://www.canva.com/about/"),
    CompanyPageCase("postman-product", "Postman", "PRODUCT", "https://www.postman.com/product/what-is-postman/"),
    CompanyPageCase("twilio-home", "Twilio", "PRODUCT", "https://www.twilio.com/en-us"),
    CompanyPageCase("zoom-meetings", "Zoom", "PRODUCT", "https://www.zoom.com/en/products/virtual-meetings/"),
    CompanyPageCase("elastic-search", "Elastic", "PRODUCT", "https://www.elastic.co/elasticsearch/"),
    CompanyPageCase("squarespace-design", "Squarespace", "PRODUCT", "https://www.squarespace.com/website-design"),
    CompanyPageCase("asana-product", "Asana", "PRODUCT", "https://asana.com/product"),
    CompanyPageCase("monday-work", "monday.com", "PRODUCT", "https://monday.com/work-management"),
    CompanyPageCase("airtable-product", "Airtable", "PRODUCT", "https://www.airtable.com/product"),
    CompanyPageCase("zendesk-service", "Zendesk", "PRODUCT", "https://www.zendesk.com/service/"),
    CompanyPageCase("intercom-suite", "Intercom", "PRODUCT", "https://www.intercom.com/suite"),
    CompanyPageCase("snowflake-platform", "Snowflake", "PLATFORM", "https://www.snowflake.com/en/product/features/"),
    CompanyPageCase("databricks-lakehouse", "Databricks", "PLATFORM", "https://www.databricks.com/product/data-lakehouse"),
]


ACCESS_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
}


async def _check_accessible_inner(url: str, *, timeout_sec: float) -> dict:
    """Lightweight reachability — GET first 2KB (many marketing sites block HEAD)."""
    out = {
        "accessible": False,
        "status_code": None,
        "final_url": url,
        "content_type": "",
        "error": "",
    }
    timeout = httpx.Timeout(timeout_sec, connect=timeout_sec)
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=timeout,
            headers=ACCESS_HEADERS,
        ) as client:
            async with client.stream("GET", url) as resp:
                out["status_code"] = resp.status_code
                out["final_url"] = str(resp.url)
                out["content_type"] = resp.headers.get("content-type", "")
                chunk = b""
                async for part in resp.aiter_bytes(512):
                    chunk += part
                    if len(chunk) >= 2048:
                        chunk = chunk[:2048]
                        break
                out["accessible"] = (
                    resp.status_code < 400 and len(chunk) > 100
                )
    except Exception as e:
        out["error"] = str(e)[:200]
    return out


async def check_accessible(url: str, *, timeout_sec: float = 15.0) -> dict:
    try:
        return await asyncio.wait_for(
            _check_accessible_inner(url, timeout_sec=timeout_sec),
            timeout=timeout_sec + 10,
        )
    except asyncio.TimeoutError:
        return {
            "accessible": False,
            "status_code": None,
            "final_url": url,
            "content_type": "",
            "error": "precheck_timeout",
        }


async def run_fetch_only(url: str) -> dict:
    from app.intelligence.orchestrator import get_orchestrator

    t0 = time.perf_counter()
    orch = get_orchestrator()
    try:
        result = await asyncio.wait_for(
            orch.fetch(url),
            timeout=settings.playwright_total_timeout_sec + 15,
        )
        trace = (result.meta or {}).get("intelligence_trace") or {}
        return {
            "mode": "fetch_only",
            "ok": True,
            "sec": round(time.perf_counter() - t0, 1),
            "method": result.method,
            "html_len": len(result.html),
            "status_code": result.status_code,
            "winning_strategy": trace.get("winning_strategy"),
            "url_class": trace.get("url_class"),
            "strategies_attempted": trace.get("strategies_attempted"),
        }
    except Exception as e:
        code = getattr(e, "code", "error")
        return {
            "mode": "fetch_only",
            "ok": False,
            "sec": round(time.perf_counter() - t0, 1),
            "error_code": code,
            "error": str(e)[:300],
        }


async def run_full_pipeline(url: str) -> dict:
    from app.services.pipeline import run_extraction

    t0 = time.perf_counter()
    try:
        result = await asyncio.wait_for(
            run_extraction(url, output_language="zh", output_detail="concise"),
            timeout=settings.extract_timeout_sec + 10,
        )
        elapsed = round(time.perf_counter() - t0, 1)
        if result.status == "success":
            return {
                "mode": "full",
                "ok": True,
                "sec": elapsed,
                "title": (result.title or "")[:80],
                "summary_len": len(result.summary or ""),
                "content_len": len(result.content or ""),
                "key_points": len(result.key_points),
            }
        return {
            "mode": "full",
            "ok": False,
            "sec": elapsed,
            "error_code": result.error_code,
            "error": (result.error or "")[:300],
            "stage": result.stage,
        }
    except asyncio.TimeoutError:
        return {
            "mode": "full",
            "ok": False,
            "sec": round(time.perf_counter() - t0, 1),
            "error_code": "bench_timeout",
            "error": "benchmark timeout",
        }
    except Exception as e:
        return {
            "mode": "full",
            "ok": False,
            "sec": round(time.perf_counter() - t0, 1),
            "error_code": "exception",
            "error": str(e)[:300],
        }


async def main() -> None:
    parser = argparse.ArgumentParser(description="Company/product page benchmark")
    parser.add_argument("--full", action="store_true", help="Full extract + AI (slow, needs API key)")
    parser.add_argument("--precheck", action="store_true", help="Only run accessibility checks")
    parser.add_argument("--limit", type=int, default=0, help="Max cases in list (0 = all 36)")
    parser.add_argument(
        "--skip-precheck",
        action="store_true",
        help="Run cases without accessibility gate (not recommended)",
    )
    args = parser.parse_args()

    cases = list(CASES)
    if args.limit > 0:
        cases = cases[: args.limit]

    print(f"Scarper company-page benchmark — {len(cases)} cases")
    print(f"  playwright_enabled={settings.playwright_enabled}")
    print(f"  deepseek_configured={bool(settings.deepseek_api_key)}")
    print(f"  mode={'full' if args.full else 'precheck' if args.precheck else 'fetch_only'}\n")

    report: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "precheck" if args.precheck else ("full" if args.full else "fetch_only"),
        "settings": {
            "playwright_enabled": settings.playwright_enabled,
            "extract_timeout_sec": settings.extract_timeout_sec,
        },
        "cases": [],
        "summary": {},
    }

    def _log(msg: str) -> None:
        print(msg, flush=True)

    async def precheck_one(case: CompanyPageCase) -> tuple[CompanyPageCase, dict]:
        if args.skip_precheck:
            return case, {"accessible": True, "skipped": True}
        access = await check_accessible(case.url, timeout_sec=15.0)
        return case, access

    _log(f"Running accessibility pre-check on {len(cases)} URLs (concurrency=4)...")
    sem = asyncio.Semaphore(4)

    async def bounded_precheck(c: CompanyPageCase):
        async with sem:
            return await precheck_one(c)

    prechecked = await asyncio.gather(*[bounded_precheck(c) for c in cases])

    runnable: list[tuple[CompanyPageCase, dict]] = []

    for i, (case, access) in enumerate(prechecked, 1):
        _log(f"[{i}/{len(cases)}] {case.id} — {case.company} ({case.category})")
        _log(f"  {case.url}")

        if not args.skip_precheck:
            if access["accessible"]:
                _log(f"  precheck: OK ({access.get('status_code')})")
            else:
                _log(f"  precheck: SKIP — {access.get('error') or access.get('status_code')}")

        row = {
            "id": case.id,
            "company": case.company,
            "category": case.category,
            "url": case.url,
            "domain": urlparse(case.url).netloc,
            "access": access,
            "run": None,
        }

        if args.precheck:
            report["cases"].append(row)
            _log("")
            continue

        if not args.skip_precheck and not access["accessible"]:
            row["run"] = {"skipped": True, "reason": "not_accessible"}
            report["cases"].append(row)
            _log("")
            continue

        runnable.append((case, row))

    if not args.precheck:
        for i, (case, row) in enumerate(runnable, 1):
            _log(f"--- run {i}/{len(runnable)}: {case.id}")
            if args.full:
                row["run"] = await run_full_pipeline(case.url)
            else:
                row["run"] = await run_fetch_only(case.url)

            run = row["run"]
            status = "OK" if run.get("ok") else "FAIL"
            extra = ""
            if run.get("winning_strategy"):
                extra = f" strategy={run['winning_strategy']} class={run.get('url_class')}"
            elif run.get("error_code"):
                extra = f" code={run['error_code']}"
            _log(f"  => {status} {run.get('sec')}s{extra}\n")
            report["cases"].append(row)

    # Summaries
    ran = [c for c in report["cases"] if c.get("run") and not c["run"].get("skipped")]
    ok = [c for c in ran if c["run"].get("ok")]
    by_cat: dict[str, list] = {}
    by_strategy: dict[str, int] = {}
    for c in ran:
        cat = c["category"]
        by_cat.setdefault(cat, []).append(c["run"].get("ok"))
        strat = (c["run"] or {}).get("winning_strategy") or "n/a"
        if c["run"].get("ok"):
            by_strategy[strat] = by_strategy.get(strat, 0) + 1

    pw_hits = sum(
        1
        for c in ok
        if (c["run"].get("winning_strategy") or "").find("BROWSER") >= 0
        or c["run"].get("method") == "playwright"
    )

    report["summary"] = {
        "total_cases": len(cases),
        "accessible": sum(1 for c in report["cases"] if c["access"].get("accessible")),
        "executed": len(ran),
        "success": len(ok),
        "success_rate_pct": round(100 * len(ok) / len(ran), 1) if ran else 0,
        "playwright_wins": pw_hits,
        "playwright_ratio_pct": round(100 * pw_hits / len(ok), 1) if ok else 0,
        "by_category": {
            k: {
                "total": len(v),
                "ok": sum(1 for x in v if x),
                "rate_pct": round(100 * sum(1 for x in v if x) / len(v), 1) if v else 0,
            }
            for k, v in by_cat.items()
        },
        "winning_strategies": by_strategy,
        "avg_sec": round(sum(c["run"]["sec"] for c in ok) / len(ok), 1) if ok else 0,
    }

    reports_dir = Path(__file__).resolve().parents[1] / "reports"
    reports_dir.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = reports_dir / f"company_pages_{report['mode']}_{stamp}.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    s = report["summary"]
    print("=" * 60)
    print(f"Accessible: {s.get('accessible', 0)}/{s.get('total_cases', 0)}")
    if ran:
        print(f"Success:    {s['success']}/{s['executed']} ({s['success_rate_pct']}%)")
        print(f"Avg OK time: {s['avg_sec']}s")
        print(f"Playwright:  {s['playwright_wins']} OK runs ({s['playwright_ratio_pct']}% of successes)")
        print("By category:")
        for cat, stats in sorted((s.get("by_category") or {}).items()):
            print(f"  {cat:12} {stats['ok']}/{stats['total']} ({stats['rate_pct']}%)")
        if by_strategy:
            print("Winning strategies:", by_strategy)
    print(f"Report: {out_path}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
