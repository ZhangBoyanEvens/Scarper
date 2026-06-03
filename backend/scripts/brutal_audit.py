"""
Scarper 全方位暴力审计脚本
- 安全/漏洞探测（SSRF、鉴权、限流、注入）
- 抓取成功率基准（E2E pipeline，含 AI）
- Token 成本统计
- 稳定性（并发、畸形输入）
- 测试结束自动清理 Neon 数据（前缀 __audit__）

用法（backend/ 目录）:
  python scripts/brutal_audit.py
  python scripts/brutal_audit.py --scrape-limit 15
  python scripts/brutal_audit.py --skip-scrape   # 仅安全项，不消耗 token
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai.token_usage import TokenUsageAccumulator
from app.config import settings
from app.crawler.url_validator import UrlValidationError, normalize_url
from app.services.pipeline import run_extraction

AUDIT_PREFIX = "__audit__"
AUDIT_USER = f"{AUDIT_PREFIX}brutal-test-user"
REPORT_DIR = Path(__file__).resolve().parents[1] / "reports"

# ---------------------------------------------------------------------------
# Scrape benchmark URLs — static / news / SPA / edge cases
# ---------------------------------------------------------------------------
SCRAPE_CASES: list[dict[str, str]] = [
    {"id": "static-example", "tier": "easy", "url": "https://example.com"},
    {"id": "static-httpbin", "tier": "easy", "url": "https://httpbin.org/html"},
    {"id": "wiki-python", "tier": "easy", "url": "https://en.wikipedia.org/wiki/Python_(programming_language)"},
    {"id": "bbc-news", "tier": "medium", "url": "https://www.bbc.com/news/world"},
    {"id": "hn-front", "tier": "medium", "url": "https://news.ycombinator.com"},
    {"id": "github-readme", "tier": "medium", "url": "https://github.com/anthropics/anthropic-cookbook"},
    {"id": "stripe-home", "tier": "spa", "url": "https://stripe.com/"},
    {"id": "figma-home", "tier": "spa", "url": "https://www.figma.com/"},
    {"id": "linear-home", "tier": "spa", "url": "https://linear.app/"},
    {"id": "vercel-home", "tier": "spa", "url": "https://vercel.com/"},
    {"id": "notion-product", "tier": "spa", "url": "https://www.notion.com/product"},
    {"id": "cloudflare-dev", "tier": "spa", "url": "https://www.cloudflare.com/developer-platform/"},
    {"id": "anthropic-about", "tier": "spa", "url": "https://www.anthropic.com/company"},
    {"id": "openai-about", "tier": "spa", "url": "https://openai.com/about/"},
    {"id": "docker-desktop", "tier": "spa", "url": "https://www.docker.com/products/docker-desktop/"},
    {"id": "codrops", "tier": "medium", "url": "https://tympanus.net/codrops/"},
    {"id": "verge-article", "tier": "medium", "url": "https://www.theverge.com/2024/1/1/24080150/tech-2024-predictions-ai"},
    {"id": "atlassian-jira", "tier": "spa", "url": "https://www.atlassian.com/software/jira"},
    {"id": "hubspot-crm", "tier": "spa", "url": "https://www.hubspot.com/products/crm"},
    {"id": "postman-product", "tier": "spa", "url": "https://www.postman.com/product/what-is-postman/"},
    # edge / likely fail
    {"id": "404-github", "tier": "edge", "url": "https://github.com/this-repo-definitely-does-not-exist-99999"},
    {"id": "pdf-direct", "tier": "edge", "url": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"},
    {"id": "empty-path", "tier": "edge", "url": "https://httpbin.org/status/204"},
    {"id": "redirect-chain", "tier": "edge", "url": "https://httpbin.org/redirect/3"},
]

SSRF_CASES = [
    ("localhost", "http://127.0.0.1:8000/api/health"),
    ("loopback-host", "http://localhost/admin"),
    ("private-ip", "http://192.168.1.1/"),
    ("link-local", "http://169.254.169.254/latest/meta-data/"),
    ("file-scheme", "file:///etc/passwd"),
    ("javascript", "javascript:alert(1)"),
    ("metadata-hostname", "http://metadata.google.internal/"),
    ("internal-tld", "http://corp.internal/"),
    ("decimal-ip", "http://2130706433/"),  # 127.0.0.1
    ("octal-ip", "http://0177.0.0.1/"),
]

MALFORMED_URLS = [
    "",
    "   ",
    "not-a-url",
    "https://",
    "https://[" + "a" * 5000 + "].com",
    "https://user:pass@evil.com@example.com",
    "https://example.com/" + "x" * 8000,
]


@dataclass
class Finding:
    severity: str  # critical | high | medium
    title: str
    detail: str
    evidence: str = ""


@dataclass
class AuditReport:
    started_at: str = ""
    finished_at: str = ""
    settings_snapshot: dict = field(default_factory=dict)
    security: list[Finding] = field(default_factory=list)
    ssrf: list[dict] = field(default_factory=list)
    malformed: list[dict] = field(default_factory=list)
    api_probes: list[dict] = field(default_factory=list)
    scrape_results: list[dict] = field(default_factory=list)
    scrape_summary: dict = field(default_factory=dict)
    token_summary: dict = field(default_factory=dict)
    stability: dict = field(default_factory=dict)
    neon_cleanup: dict = field(default_factory=dict)


def _cost_from_usage_dict(u: dict | None) -> float:
    if not u:
        return 0.0
    acc = TokenUsageAccumulator(model=u.get("model") or settings.deepseek_model)
    from app.ai.token_usage import CompletionUsage

    acc.add(
        CompletionUsage(
            prompt_tokens=int(u.get("prompt_tokens") or 0),
            completion_tokens=int(u.get("completion_tokens") or 0),
            total_tokens=int(u.get("total_tokens") or 0),
            prompt_cache_hit_tokens=int(u.get("prompt_cache_hit_tokens") or 0),
            prompt_cache_miss_tokens=int(u.get("prompt_cache_miss_tokens") or 0),
        )
    )
    if u.get("page_cache_hit"):
        return 0.0
    return acc.estimated_cost_usd()


async def probe_backend(base: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{base}/api/health")
            return r.status_code == 200
    except Exception:
        return False


async def run_security_api_probes(base: str, report: AuditReport) -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. merge without auth
        merge_body = {
            "sources": [
                {
                    "url": "https://example.com",
                    "title": "A",
                    "summary": "test summary " * 20,
                    "key_points": ["p1", "p2"],
                    "content": "content " * 50,
                    "detected_language": "en",
                },
                {
                    "url": "https://example.org",
                    "title": "B",
                    "summary": "test summary b " * 20,
                    "key_points": ["q1"],
                    "content": "content b " * 50,
                    "detected_language": "en",
                },
            ],
            "output_language": "zh",
            "output_detail": "concise",
        }
        t0 = time.perf_counter()
        try:
            r = await client.post(f"{base}/api/merge", json=merge_body)
            row = {
                "probe": "merge_no_auth",
                "status": r.status_code,
                "sec": round(time.perf_counter() - t0, 2),
            }
            if r.status_code == 200:
                data = r.json()
                usage = data.get("token_usage") or {}
                row["token_usage"] = usage
                row["cost_usd"] = _cost_from_usage_dict(usage)
                report.security.append(
                    Finding(
                        severity="critical",
                        title="/api/merge 无鉴权即可调用 DeepSeek",
                        detail="任意调用者可消耗服务端 DEEPSEEK_API_KEY 额度，无 Clerk JWT、无限流绑定。",
                        evidence=f"HTTP {r.status_code}, cost≈${row['cost_usd']:.6f}",
                    )
                )
            report.api_probes.append(row)
        except Exception as e:
            report.api_probes.append({"probe": "merge_no_auth", "error": str(e)[:200]})

        # 2. extract without auth
        try:
            r = await client.post(
                f"{base}/api/extract",
                json={"url": "https://example.com", "output_language": "zh", "output_detail": "concise"},
                timeout=120.0,
            )
            row = {
                "probe": "extract_no_auth",
                "status": r.status_code,
                "auth_required": settings.clerk_require_auth,
            }
            if r.status_code == 200 and not settings.clerk_require_auth:
                report.security.append(
                    Finding(
                        severity="critical",
                        title="/api/extract 默认允许匿名抓取",
                        detail="clerk_require_auth=false 时未登录用户可无限（除 IP 限流外）触发抓取+AI，消耗算力与 API 额度。",
                        evidence=f"HTTP 200, clerk_require_auth={settings.clerk_require_auth}",
                    )
                )
            elif r.status_code == 401:
                row["protected"] = True
            report.api_probes.append(row)
        except Exception as e:
            report.api_probes.append({"probe": "extract_no_auth", "error": str(e)[:200]})

        # 3. neon status without auth (info leak)
        try:
            r = await client.get(f"{base}/api/neon/status")
            if r.status_code == 200:
                data = r.json()
                report.api_probes.append({"probe": "neon_status_public", "body": data})
                if data.get("connected"):
                    report.security.append(
                        Finding(
                            severity="high",
                            title="/api/neon/status 公开暴露数据库连接状态",
                            detail="未鉴权即可探测 Neon 是否在线、运行模式，便于攻击者枚举基础设施。",
                            evidence=json.dumps(data, ensure_ascii=False)[:200],
                        )
                    )
        except Exception as e:
            report.api_probes.append({"probe": "neon_status_public", "error": str(e)[:200]})

        # 4. rate limit burst
        hits = []
        for i in range(35):
            try:
                r = await client.post(
                    f"{base}/api/extract",
                    json={"url": "https://example.com", "output_language": "zh", "output_detail": "concise"},
                    timeout=5.0,
                )
                hits.append(r.status_code)
            except Exception:
                hits.append(0)
        rate_limited = sum(1 for h in hits if h == 429)
        report.api_probes.append(
            {
                "probe": "rate_limit_burst",
                "requests": len(hits),
                "status_429": rate_limited,
                "status_200": sum(1 for h in hits if h == 200),
            }
        )
        if rate_limited == 0:
            report.security.append(
                Finding(
                    severity="high",
                    title="IP 限流未生效或阈值过高",
                    detail="35 次连续 /api/extract 未触发 429（可能因超时未完成计数），限流为进程内存实现，多实例/重启可绕过。",
                    evidence=f"429 count={rate_limited}, sample={hits[:10]}",
                )
            )

        # 5. fake JWT to neon projects
        try:
            r = await client.get(
                f"{base}/api/neon/projects",
                headers={"Authorization": "Bearer fake.jwt.token"},
            )
            report.api_probes.append({"probe": "neon_fake_jwt", "status": r.status_code})
            if settings.neon_require_auth and r.status_code == 200:
                report.security.append(
                    Finding(
                        severity="critical",
                        title="Neon API 接受无效 JWT",
                        detail="伪造 Bearer token 仍可访问项目列表。",
                        evidence=f"HTTP {r.status_code}",
                    )
                )
        except Exception as e:
            report.api_probes.append({"probe": "neon_fake_jwt", "error": str(e)[:200]})

        # 6. diagnostics public
        try:
            r = await client.get(f"{base}/api/diagnostics/health")
            if r.status_code == 200:
                report.api_probes.append(
                    {"probe": "diagnostics_public", "status": 200, "keys": list(r.json().keys())[:8]}
                )
                report.security.append(
                    Finding(
                        severity="medium",
                        title="诊断接口未鉴权",
                        detail="/api/diagnostics 暴露 DeepSeek/Playwright/Neon 配置状态，生产环境应加保护。",
                        evidence="GET /api/diagnostics/health → 200",
                    )
                )
        except Exception as e:
            report.api_probes.append({"probe": "diagnostics_public", "error": str(e)[:200]})


def run_ssrf_validation(report: AuditReport) -> None:
    for name, url in SSRF_CASES:
        row = {"case": name, "url": url}
        try:
            normalized = normalize_url(url)
            row["blocked"] = False
            row["normalized"] = normalized
            report.security.append(
                Finding(
                    severity="critical" if "127.0.0.1" in url or "169.254" in url or "192.168" in url else "high",
                    title=f"SSRF 校验未拦截: {name}",
                    detail=f"URL 通过 normalize_url: {normalized}",
                    evidence=url,
                )
            )
        except UrlValidationError as e:
            row["blocked"] = True
            row["code"] = e.code
            row["message"] = str(e)
        except Exception as e:
            row["blocked"] = True
            row["error"] = str(e)[:120]
        report.ssrf.append(row)

    # DNS rebinding gap — hostname not resolved at validation
    report.security.append(
        Finding(
            severity="critical",
            title="SSRF：hostname 未在抓取前解析为 IP 校验",
            detail="url_validator 对域名直接放行（仅 IP 字面量拦截），攻击者可用恶意 DNS 指向内网/metadata，存在 DNS rebinding 风险。",
            evidence="url_validator._assert_safe_host: hostname → return",
        )
    )


def run_malformed_validation(report: AuditReport) -> None:
    for raw in MALFORMED_URLS:
        row = {"input_len": len(raw)}
        try:
            out = normalize_url(raw)
            row["accepted"] = True
            row["normalized"] = out[:120]
        except UrlValidationError as e:
            row["accepted"] = False
            row["code"] = e.code
        except Exception as e:
            row["accepted"] = False
            row["error"] = str(e)[:120]
        report.malformed.append(row)


async def run_one_scrape(case: dict) -> dict:
    url = case["url"]
    t0 = time.perf_counter()
    row = {**case, "started": time.time()}
    try:
        result = await asyncio.wait_for(
            run_extraction(url, output_language="zh", output_detail="concise"),
            timeout=settings.extract_timeout_sec + 15,
        )
        elapsed = round(time.perf_counter() - t0, 2)
        row["sec"] = elapsed
        row["status"] = result.status
        if result.status == "success":
            row["ok"] = True
            row["title"] = (getattr(result, "title", None) or "")[:80]
            row["summary_len"] = len(getattr(result, "summary", None) or "")
            row["content_len"] = len(getattr(result, "content", None) or "")
            tu = getattr(result, "token_usage", None)
            if tu:
                ud = tu.model_dump() if hasattr(tu, "model_dump") else dict(tu)
                row["token_usage"] = ud
                row["cost_usd"] = _cost_from_usage_dict(ud)
                row["page_cache_hit"] = bool(ud.get("page_cache_hit"))
        else:
            row["ok"] = False
            row["error_code"] = getattr(result, "error_code", None)
            row["error"] = (getattr(result, "error", None) or "")[:200]
            row["stage"] = getattr(result, "stage", None)
            tu = getattr(result, "token_usage", None)
            if tu:
                ud = tu.model_dump() if hasattr(tu, "model_dump") else dict(tu)
                row["token_usage"] = ud
                row["cost_usd"] = _cost_from_usage_dict(ud)
    except asyncio.TimeoutError:
        row["ok"] = False
        row["sec"] = round(time.perf_counter() - t0, 2)
        row["error_code"] = "audit_timeout"
        row["error"] = "audit timeout"
    except Exception as e:
        row["ok"] = False
        row["sec"] = round(time.perf_counter() - t0, 2)
        row["error_code"] = "exception"
        row["error"] = str(e)[:200]
    return row


async def run_scrape_benchmark(cases: list[dict], report: AuditReport) -> None:
    print(f"\n=== Scrape benchmark: {len(cases)} URLs ===")
    for i, case in enumerate(cases, 1):
        print(f"  [{i}/{len(cases)}] {case['id']} ({case['tier']}) …", flush=True)
        row = await run_one_scrape(case)
        report.scrape_results.append(row)
        tag = "OK" if row.get("ok") else f"FAIL({row.get('error_code')})"
        cost = row.get("cost_usd")
        extra = f" ${cost:.6f}" if cost else ""
        print(f"       {tag} {row.get('sec')}s{extra}", flush=True)

    ok_rows = [r for r in report.scrape_results if r.get("ok")]
    fail_rows = [r for r in report.scrape_results if not r.get("ok")]
    total = len(report.scrape_results)
    by_tier: dict[str, list] = {}
    for r in report.scrape_results:
        by_tier.setdefault(r["tier"], []).append(r.get("ok"))

    costs = [r.get("cost_usd") or 0 for r in report.scrape_results]
    tokens_in = sum((r.get("token_usage") or {}).get("prompt_tokens", 0) for r in report.scrape_results)
    tokens_out = sum((r.get("token_usage") or {}).get("completion_tokens", 0) for r in report.scrape_results)
    cache_hits = sum(1 for r in report.scrape_results if (r.get("token_usage") or {}).get("page_cache_hit"))

    report.scrape_summary = {
        "total": total,
        "success": len(ok_rows),
        "failed": len(fail_rows),
        "success_rate_pct": round(100 * len(ok_rows) / total, 2) if total else 0,
        "by_tier": {
            tier: {
                "total": len(v),
                "success": sum(1 for x in v if x),
                "rate_pct": round(100 * sum(1 for x in v if x) / len(v), 2) if v else 0,
            }
            for tier, v in by_tier.items()
        },
        "avg_sec_ok": round(sum(r["sec"] for r in ok_rows) / len(ok_rows), 2) if ok_rows else 0,
        "p95_sec_ok": round(sorted(r["sec"] for r in ok_rows)[int(len(ok_rows) * 0.95)] if ok_rows else 0, 2),
        "failure_codes": {},
    }
    for r in fail_rows:
        code = r.get("error_code") or "unknown"
        report.scrape_summary["failure_codes"][code] = report.scrape_summary["failure_codes"].get(code, 0) + 1

    report.token_summary = {
        "total_cost_usd": round(sum(costs), 6),
        "avg_cost_per_success_usd": round(sum(r.get("cost_usd") or 0 for r in ok_rows) / len(ok_rows), 6) if ok_rows else 0,
        "avg_cost_per_attempt_usd": round(sum(costs) / total, 6) if total else 0,
        "total_prompt_tokens": tokens_in,
        "total_completion_tokens": tokens_out,
        "page_cache_hits": cache_hits,
        "model": settings.deepseek_model,
    }


async def run_stability_tests(report: AuditReport) -> None:
    print("\n=== Stability: concurrent extracts ===")
    urls = ["https://example.com", "https://httpbin.org/html", "https://en.wikipedia.org/wiki/Web_scraping"]
    t0 = time.perf_counter()
    results = await asyncio.gather(*[run_one_scrape({"id": f"conc-{i}", "tier": "easy", "url": u}) for i, u in enumerate(urls)])
    elapsed = round(time.perf_counter() - t0, 2)
    ok = sum(1 for r in results if r.get("ok"))
    report.stability["concurrent_3"] = {
        "wall_sec": elapsed,
        "success": ok,
        "total": len(results),
        "results": [{"id": r["id"], "ok": r.get("ok"), "sec": r.get("sec"), "error_code": r.get("error_code")} for r in results],
    }

    # duplicate URL cache test
    print("=== Stability: cache repeat ===")
    u = "https://example.com"
    r1 = await run_one_scrape({"id": "cache-1", "tier": "easy", "url": u})
    r2 = await run_one_scrape({"id": "cache-2", "tier": "easy", "url": u})
    report.stability["cache_repeat"] = {
        "first_ok": r1.get("ok"),
        "second_ok": r2.get("ok"),
        "second_cache_hit": (r2.get("token_usage") or {}).get("page_cache_hit"),
        "second_cost_usd": r2.get("cost_usd"),
    }


def neon_audit_cleanup() -> dict:
    from app.db.neon import get_neon_repository

    out = {"user_id": AUDIT_USER, "deleted_projects": [], "deleted_templates": [], "errors": []}
    repo = get_neon_repository()
    if not repo:
        out["skipped"] = "neon not configured"
        return out

    try:
        repo.ensure_user_catalog(AUDIT_USER)
        projects = repo.list_projects(AUDIT_USER)
        for p in projects:
            if AUDIT_PREFIX in (p.name or "") or p.id.startswith(AUDIT_PREFIX):
                if repo.delete_project(AUDIT_USER, p.id):
                    out["deleted_projects"].append(p.id)

        templates = repo.list_findoc_templates(AUDIT_USER)
        for t in templates:
            if AUDIT_PREFIX in (t.name or "") or t.id.startswith(AUDIT_PREFIX):
                if repo.delete_findoc_template(AUDIT_USER, t.id):
                    out["deleted_templates"].append(t.id)

        # create + delete smoke to verify quota path
        pid = f"{AUDIT_PREFIX}{uuid.uuid4().hex[:12]}"
        proj = repo.create_project(AUDIT_USER, name=f"{AUDIT_PREFIX}smoke", description="auto cleanup")
        out["smoke_project"] = proj.id
        uploads = repo.list_uploads(AUDIT_USER, proj.id)
        out["smoke_uploads_before_delete"] = len(uploads)
        repo.delete_project(AUDIT_USER, proj.id)
        out["smoke_deleted"] = True
    except Exception as e:
        out["errors"].append(str(e)[:300])

    # sweep any leftover audit projects by prefix in name
    try:
        for p in repo.list_projects(AUDIT_USER):
            if AUDIT_PREFIX in (p.name or ""):
                repo.delete_project(AUDIT_USER, p.id)
                out["deleted_projects"].append(p.id)
    except Exception as e:
        out["errors"].append(f"sweep: {e}")

    return out


def dedupe_findings(report: AuditReport) -> None:
    seen: set[str] = set()
    unique: list[Finding] = []
    for f in report.security:
        key = f.title
        if key in seen:
            continue
        seen.add(key)
        unique.append(f)
    report.security = unique


def print_summary(report: AuditReport, out_path: Path) -> None:
    s = report.scrape_summary
    t = report.token_summary

    def safe_print(text: str) -> None:
        try:
            print(text)
        except UnicodeEncodeError:
            print(text.encode("ascii", errors="backslashreplace").decode("ascii"))

    safe_print("\n" + "=" * 70)
    safe_print("BRUTAL AUDIT SUMMARY")
    safe_print("=" * 70)
    safe_print(f"Security findings: {len(report.security)}")
    for f in report.security[:12]:
        safe_print(f"  [{f.severity.upper()}] {f.title}")
    if s:
        print(f"\nScrape success: {s.get('success')}/{s.get('total')} ({s.get('success_rate_pct')}%)")
        print("By tier:")
        for tier, st in sorted((s.get("by_tier") or {}).items()):
            print(f"  {tier:8} {st['success']}/{st['total']} ({st['rate_pct']}%)")
        print(f"Avg OK latency: {s.get('avg_sec_ok')}s | P95: {s.get('p95_sec_ok')}s")
        print(f"Failure codes: {s.get('failure_codes')}")
    if t:
        print(f"\nToken cost total: ${t.get('total_cost_usd')} USD")
        print(f"  per successful extract: ${t.get('avg_cost_per_success_usd')}")
        print(f"  per attempt: ${t.get('avg_cost_per_attempt_usd')}")
        print(f"  prompt/completion tokens: {t.get('total_prompt_tokens')}/{t.get('total_completion_tokens')}")
        print(f"  page cache hits: {t.get('page_cache_hits')}")
    print(f"\nNeon cleanup: {json.dumps(report.neon_cleanup, ensure_ascii=False)[:300]}")
    print(f"Full report: {out_path}")
    print("=" * 70)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://127.0.0.1:8000")
    parser.add_argument("--scrape-limit", type=int, default=0, help="0 = all cases")
    parser.add_argument("--skip-scrape", action="store_true")
    parser.add_argument("--skip-api", action="store_true")
    args = parser.parse_args()

    report = AuditReport(started_at=datetime.now(timezone.utc).isoformat())
    report.settings_snapshot = {
        "deepseek_configured": bool(settings.deepseek_api_key),
        "playwright_enabled": settings.playwright_enabled,
        "extract_timeout_sec": settings.extract_timeout_sec,
        "clerk_require_auth": settings.clerk_require_auth,
        "neon_require_auth": settings.neon_require_auth,
        "allow_localhost": settings.allow_localhost,
        "neon_enabled": settings.neon_enabled,
    }

    print("Scarper Brutal Audit")
    print(json.dumps(report.settings_snapshot, indent=2))

    run_ssrf_validation(report)
    run_malformed_validation(report)

    backend_up = await probe_backend(args.backend)
    print(f"\nBackend {args.backend}: {'UP' if backend_up else 'DOWN'}")

    if backend_up and not args.skip_api:
        await run_security_api_probes(args.backend, report)
    elif not args.skip_api:
        report.security.append(
            Finding(
                severity="medium",
                title="后端未启动，HTTP 安全探针跳过",
                detail="请运行 python run_dev.py 后重测 /api/merge 等接口。",
            )
        )

    # JWT verify_aud disabled — static finding
    report.security.append(
        Finding(
            severity="high",
            title="Clerk JWT 未校验 aud（verify_aud=False）",
            detail="若 token 泄露或跨应用复用，攻击面大于最小权限原则。",
            evidence="clerk_auth._decode_token options verify_aud=False",
        )
    )

    # In-memory rate limit
    report.security.append(
        Finding(
            severity="high",
            title="限流为单进程内存字典，无法水平扩展",
            detail="_RATE 存在 routes.py 模块级 defaultdict，多 worker/多 Pod 各自计数，重启清零。",
            evidence="_RATE_LIMIT=30/min per key",
        )
    )

    if not args.skip_scrape and settings.deepseek_api_key:
        cases = list(SCRAPE_CASES)
        if args.scrape_limit > 0:
            cases = cases[: args.scrape_limit]
        await run_scrape_benchmark(cases, report)
        await run_stability_tests(report)
    elif args.skip_scrape:
        print("\n(skip scrape — no token burn)")
    else:
        print("\n(skip scrape — no DEEPSEEK_API_KEY)")

    report.neon_cleanup = neon_audit_cleanup()
    dedupe_findings(report)
    report.finished_at = datetime.now(timezone.utc).isoformat()

    REPORT_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = REPORT_DIR / f"brutal_audit_{stamp}.json"

    def finding_to_dict(f: Finding) -> dict:
        return {"severity": f.severity, "title": f.title, "detail": f.detail, "evidence": f.evidence}

    payload = {
        "started_at": report.started_at,
        "finished_at": report.finished_at,
        "settings": report.settings_snapshot,
        "security_findings": [finding_to_dict(f) for f in report.security],
        "ssrf": report.ssrf,
        "malformed": report.malformed,
        "api_probes": report.api_probes,
        "scrape_summary": report.scrape_summary,
        "scrape_results": report.scrape_results,
        "token_summary": report.token_summary,
        "stability": report.stability,
        "neon_cleanup": report.neon_cleanup,
    }
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print_summary(report, out_path)


if __name__ == "__main__":
    asyncio.run(main())
