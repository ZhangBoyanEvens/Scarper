"""Quick extraction success-rate benchmark. Run: python scripts/bench_extract.py"""

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.services.pipeline import run_extraction

# Mix: static, news, wiki, dev blog, httpbin, HN, SPA-ish
TEST_URLS = [
    "https://example.com",
    "https://httpbin.org/html",
    "https://en.wikipedia.org/wiki/Python_(programming_language)",
    "https://tympanus.net/codrops/",
    "https://news.ycombinator.com",
    "https://www.bbc.com/news/world",
    "https://github.com/anthropics/anthropic-cookbook",
    "https://www.theverge.com/2024/1/1/24080150/tech-2024-predictions-ai",
]


async def run_one(url: str) -> dict:
    t0 = time.perf_counter()
    try:
        result = await asyncio.wait_for(
            run_extraction(url, output_language="zh", output_detail="concise"),
            timeout=settings.extract_timeout_sec + 5,
        )
        elapsed = time.perf_counter() - t0
        if result.status == "success":
            summary_len = len(result.summary or "")
            return {
                "url": url,
                "ok": True,
                "sec": round(elapsed, 1),
                "summary_len": summary_len,
                "title": (result.title or "")[:60],
            }
        return {
            "url": url,
            "ok": False,
            "sec": round(elapsed, 1),
            "code": result.error_code,
            "error": (result.error or "")[:120],
        }
    except asyncio.TimeoutError:
        return {"url": url, "ok": False, "sec": round(time.perf_counter() - t0, 1), "code": "bench_timeout", "error": "benchmark timeout"}
    except Exception as e:
        return {"url": url, "ok": False, "sec": round(time.perf_counter() - t0, 1), "code": "exception", "error": str(e)[:120]}


async def main() -> None:
    print(f"DEEPSEEK configured: {bool(settings.deepseek_api_key)}")
    print(f"Playwright enabled: {settings.playwright_enabled}")
    print(f"Extract timeout: {settings.extract_timeout_sec}s")
    print(f"Testing {len(TEST_URLS)} URLs...\n")

    results = []
    for url in TEST_URLS:
        print(f"  -> {url}")
        r = await run_one(url)
        results.append(r)
        status = "OK" if r["ok"] else f"FAIL ({r.get('code', '?')})"
        print(f"     {status}  {r['sec']}s\n")

    ok = sum(1 for r in results if r["ok"])
    total = len(results)
    rate = (ok / total * 100) if total else 0
    avg_sec = sum(r["sec"] for r in results) / total if total else 0

    print("=" * 60)
    print(f"Success: {ok}/{total} ({rate:.0f}%)")
    print(f"Avg time: {avg_sec:.1f}s")
    print("=" * 60)
    for r in results:
        if not r["ok"]:
            print(f"  x {r['url']}")
            print(f"    {r.get('code')}: {r.get('error')}")


if __name__ == "__main__":
    asyncio.run(main())
