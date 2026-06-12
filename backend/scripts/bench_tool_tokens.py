"""
各 Tool 典型 AI 流程 token 基准（按 1000 字源文章归一化）。

用法（backend/）:
  python scripts/bench_tool_tokens.py
  python scripts/bench_tool_tokens.py --chars 1000

只读调用 DeepSeek API，不写 Neon。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app.ai.deepseek_client import chat_json, chat_text
from app.ai.integrator import integrate_extractions
from app.ai.summarizer import AISummarizer
from app.ai.token_usage import TokenUsageAccumulator
from app.config import settings
from app.models.schemas import StructuredPage
from app.parser.content_extractor import structured_to_llm_payload
from app.services.pipeline_recovery import _localize_outputs

# --- sample content ---------------------------------------------------------

SENTENCE = (
    "根据最新行业报告显示，该企业在技术创新与市场拓展方面持续投入，"
    "第三季度营收同比增长百分之十五，净利润率保持稳定。"
    "研发团队专注于人工智能与云计算领域的深度融合，"
    "已推出多款面向企业客户的数字化解决方案，覆盖金融、制造与零售场景。"
)


def make_article(chars: int) -> str:
    text = ""
    while len(text) < chars:
        text += SENTENCE
    return text[:chars]


FINANCIAL_TEMPLATE = """### 标题
财务摘要报告

### 摘要
报告期间、主体与核心结论概述。

### 要点
• 收入与成本变动
• 现金流与流动性
• 主要风险与后续行动

### 正文
在此填写详细财务分析、同比环比说明及数据来源。"""

VETRA_EMAIL_SUBJECT = "Partnership with {{contact_name}}"
VETRA_EMAIL_BODY = (
    "Dear {{contact_name}},\n\n"
    "{{personalized_intro}}\n\n"
    "I believe there is a strong opportunity for collaboration between "
    "{{from_company}} and {{to_company}} around {{collab_angle}}.\n\n"
    "Best regards,\n{{sender_name}}"
)

VETRA_INTRO_SYSTEM = """You are a B2B company profile writer for sales outreach.
Write structured company introduction with ## headings.
Output ONLY the introduction body."""

FINDOC_TEMPLATE_ANALYSIS_SYSTEM = """你是 FinDoc 文档模板结构分析器。用户会提供一篇完整的样例文章。
提取并输出「结构模板」，删除具体内容，只保留可复用的写作结构。
只输出模板正文，使用 ### 分区，可变内容用 [占位符]。"""

FINDOC_REWRITE_SYSTEM = """你是 FinDoc 文档格式化与改写专家。
按 Template 分区标题与顺序，用 Task 的信息重写每一节。
只输出成品文档，不要解释。输出语言：简体中文。"""

RAG_QA_SYSTEM_PREFIX = """你是 Scarper 的 RAG 文档问答助手。
根据项目数据库（下方 RAG 摘录）回答用户关于文档与数据的问题。
不得修改编辑器。"""

VETRA_COLLAB_SYSTEM = """You are a B2B partnership strategist.
Output ONLY valid JSON with match_score, match_summary, opportunities (10 items)."""

VETRA_OUTREACH_SYSTEM = """You are a B2B outreach email writer.
Output ONLY valid JSON with fills and plain_adaptations for template slots."""


@dataclass
class BenchRow:
    tool: str
    flow: str
    article_chars: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float
    api_calls: int
    notes: str = ""

    def per_1000_chars(self) -> dict[str, float]:
        if self.article_chars <= 0:
            return {"prompt": 0, "completion": 0, "total": 0, "cost_usd": 0}
        scale = 1000 / self.article_chars
        return {
            "prompt": round(self.prompt_tokens * scale, 1),
            "completion": round(self.completion_tokens * scale, 1),
            "total": round(self.total_tokens * scale, 1),
            "cost_usd": round(self.cost_usd * scale, 6),
        }


async def bench_scrape(article: str) -> BenchRow:
    """Scrape 单页成功路径：AI 摘要 + 正文/标题翻译（zh 输出）。"""
    structured = StructuredPage(
        title="示例企业第三季度经营分析",
        description="",
        main_content=article,
        headings=[],
        links=[],
        tables=[],
    )
    llm_payload = structured_to_llm_payload(structured)
    summarizer = AISummarizer()
    ai_result, usage_acc = await summarizer.summarize(
        llm_payload,
        "https://example.com/article",
        output_language="zh",
        output_detail="concise",
    )
    summary = ai_result.get("summary", "")
    key_points = ai_result.get("key_points", [])
    title = structured.title or ""
    await _localize_outputs(
        summary=summary,
        key_points=key_points,
        title=title,
        main_content=article,
        output_language="zh",
        source_url="https://example.com/article",
        usage=usage_acc,
    )
    return BenchRow(
        tool="Scrape",
        flow="抓取 → AI 摘要 → 正文/标题翻译（单页，zh）",
        article_chars=len(article),
        prompt_tokens=usage_acc.prompt_tokens,
        completion_tokens=usage_acc.completion_tokens,
        total_tokens=usage_acc.total_tokens,
        cost_usd=usage_acc.estimated_cost_usd(),
        api_calls=usage_acc._calls,
        notes="不含 Playwright/抓取；默认 concise",
    )


async def bench_scrape_integrate(article: str) -> BenchRow:
    """Scrape 多页 AI 整合（模拟 2 页各半篇幅）。"""
    half = len(article) // 2
    part_a, part_b = article[:half], article[half:]
    summarizer = AISummarizer()
    total_acc = TokenUsageAccumulator()
    sources = []
    for i, part in enumerate([part_a, part_b], start=1):
        structured = StructuredPage(
            title=f"页面片段 {i}",
            description="",
            main_content=part,
            headings=[],
            links=[],
            tables=[],
        )
        payload = structured_to_llm_payload(structured)
        ai_result, u = await summarizer.summarize(
            payload,
            f"https://example.com/p{i}",
            output_language="zh",
            output_detail="concise",
        )
        total_acc.prompt_tokens += u.prompt_tokens
        total_acc.completion_tokens += u.completion_tokens
        total_acc.total_tokens += u.total_tokens
        total_acc._calls += u._calls
        sources.append(
            {
                "url": f"https://example.com/p{i}",
                "title": f"页面片段 {i}",
                "summary": ai_result.get("summary", ""),
                "key_points": ai_result.get("key_points", []),
                "content": part,
                "detected_language": "zh",
            }
        )
    merged, merge_u = await integrate_extractions(
        sources,
        output_language="zh",
        output_detail="concise",
    )
    total_acc.prompt_tokens += merge_u.prompt_tokens
    total_acc.completion_tokens += merge_u.completion_tokens
    total_acc.total_tokens += merge_u.total_tokens
    total_acc._calls += merge_u._calls
    return BenchRow(
        tool="Scrape",
        flow="2 页抓取摘要 + AI 整合（batch ???）",
        article_chars=len(article),
        prompt_tokens=total_acc.prompt_tokens,
        completion_tokens=total_acc.completion_tokens,
        total_tokens=total_acc.total_tokens,
        cost_usd=TokenUsageAccumulator(
            prompt_tokens=total_acc.prompt_tokens,
            completion_tokens=total_acc.completion_tokens,
            prompt_cache_hit_tokens=total_acc.prompt_cache_hit_tokens,
            prompt_cache_miss_tokens=total_acc.prompt_cache_miss_tokens,
        ).estimated_cost_usd(),
        api_calls=total_acc._calls,
        notes="每页先摘要再整合；源文字按合计 1000 字",
    )


async def bench_findoc_proceed(article: str) -> BenchRow:
    """FinDoc Proceed：模板 + Task 改写（单次流式等价为 chat_text）。"""
    user = f"""【Task 素材】
{article}

【Template — 只学格式】
{FINANCIAL_TEMPLATE}"""
    text, u = await chat_text(
        system=FINDOC_REWRITE_SYSTEM,
        user=user,
        max_tokens=4096,
        temperature=0.35,
    )
    acc = TokenUsageAccumulator()
    acc.add(u)
    return BenchRow(
        tool="FinDoc",
        flow="Proceed 模板改写（1 次 AI，无校验重试）",
        article_chars=len(article),
        prompt_tokens=acc.prompt_tokens,
        completion_tokens=acc.completion_tokens,
        total_tokens=acc.total_tokens,
        cost_usd=acc.estimated_cost_usd(),
        api_calls=1,
        notes=f"输出约 {len(text)} 字",
    )


async def bench_templates(article: str) -> BenchRow:
    """Templates：从样例文章 AI 分析结构模板。"""
    text, u = await chat_text(
        system=FINDOC_TEMPLATE_ANALYSIS_SYSTEM,
        user=article,
        max_tokens=2048,
        temperature=0.2,
    )
    acc = TokenUsageAccumulator()
    acc.add(u)
    return BenchRow(
        tool="Templates",
        flow="样例文章 → AI 结构模板分析",
        article_chars=len(article),
        prompt_tokens=acc.prompt_tokens,
        completion_tokens=acc.completion_tokens,
        total_tokens=acc.total_tokens,
        cost_usd=acc.estimated_cost_usd(),
        api_calls=1,
        notes=f"模板约 {len(text)} 字",
    )


async def bench_rag_chat(article: str) -> BenchRow:
    """RAG Chat：单轮问答（1000 字语料 + 典型问题）。"""
    query = "这篇文章里第三季度营收增长了多少？主要业务方向是什么？"
    rag_section = "\n\n--- 项目数据库（RAG）---\n" + article[:18000]
    system = RAG_QA_SYSTEM_PREFIX + rag_section
    text, u = await chat_text(
        system=system,
        user=query + "\n\n[问答] 请严格仅根据系统消息中的数据库 RAG 摘录回答。",
        max_tokens=1024,
        temperature=0.15,
    )
    acc = TokenUsageAccumulator()
    acc.add(u)
    return BenchRow(
        tool="RAG Chat",
        flow="单轮 RAG 问答（qaMode）",
        article_chars=len(article),
        prompt_tokens=acc.prompt_tokens,
        completion_tokens=acc.completion_tokens,
        total_tokens=acc.total_tokens,
        cost_usd=acc.estimated_cost_usd(),
        api_calls=1,
        notes=f"回答约 {len(text)} 字",
    )


async def bench_vetra_intro(article: str) -> BenchRow:
    """Vetra Companies：从 Task 生成公司介绍。"""
    text, u = await chat_text(
        system=VETRA_INTRO_SYSTEM,
        user=f"=== Task research content ===\n{article}",
        max_tokens=4096,
        temperature=0.25,
    )
    acc = TokenUsageAccumulator()
    acc.add(u)
    return BenchRow(
        tool="Vetra",
        flow="Companies：Task → 公司介绍",
        article_chars=len(article),
        prompt_tokens=acc.prompt_tokens,
        completion_tokens=acc.completion_tokens,
        total_tokens=acc.total_tokens,
        cost_usd=acc.estimated_cost_usd(),
        api_calls=1,
        notes=f"介绍约 {len(text)} 字",
    )


async def bench_vetra_collab(intro: str) -> BenchRow:
    """Vetra Outreach：合作机会分析（双公司简介）。"""
    user = (
        f"From company: Sender Co\n=== From introduction ===\n{intro}\n\n"
        f"To company: Target Co\n=== To introduction ===\n{intro}"
    )
    text, u = await chat_text(
        system=VETRA_COLLAB_SYSTEM,
        user=user,
        max_tokens=4096,
        temperature=0.35,
    )
    acc = TokenUsageAccumulator()
    acc.add(u)
    try:
        parsed = json.loads(text.strip().removeprefix("```json").strip("`"))
        opps = parsed.get("opportunities") or []
    except json.JSONDecodeError:
        opps = []
    return BenchRow(
        tool="Vetra",
        flow="Outreach：合作机会分析（10 条）",
        article_chars=len(intro),
        prompt_tokens=acc.prompt_tokens,
        completion_tokens=acc.completion_tokens,
        total_tokens=acc.total_tokens,
        cost_usd=acc.estimated_cost_usd(),
        api_calls=1,
        notes=f"opportunities={len(opps)}",
    )


async def bench_vetra_outreach_email(intro: str) -> BenchRow:
    """Vetra Outreach：生成邮件正文/主题槽位。"""
    user = json.dumps(
        {
            "from_intro": intro[:8000],
            "to_intro": intro[:8000],
            "match_summary": "双方在数字化与企业服务领域存在互补空间。",
            "opportunities": [
                {"title": "联合解决方案", "description": "可整合双方产品线。"},
                {"title": "渠道合作", "description": "共享企业客户资源。"},
            ],
            "subject_template": VETRA_EMAIL_SUBJECT,
            "body_template": VETRA_EMAIL_BODY,
        },
        ensure_ascii=False,
    )
    text, u = await chat_text(
        system=VETRA_OUTREACH_SYSTEM,
        user=user,
        max_tokens=4096,
        temperature=0.4,
    )
    acc = TokenUsageAccumulator()
    acc.add(u)
    return BenchRow(
        tool="Vetra",
        flow="Outreach：邮件槽位生成",
        article_chars=len(intro),
        prompt_tokens=acc.prompt_tokens,
        completion_tokens=acc.completion_tokens,
        total_tokens=acc.total_tokens,
        cost_usd=acc.estimated_cost_usd(),
        api_calls=1,
        notes="基于公司简介 + 模板",
    )


async def bench_vetra_full(article: str) -> BenchRow:
    """Vetra 完整外联流程：介绍 → 合作分析 → 邮件。"""
    intro_row = await bench_vetra_intro(article)
    intro_text = article  # 简化：用源文作简介体量基准
    collab = await bench_vetra_collab(intro_text)
    email = await bench_vetra_outreach_email(intro_text)
    total_acc = TokenUsageAccumulator(
        prompt_tokens=intro_row.prompt_tokens + collab.prompt_tokens + email.prompt_tokens,
        completion_tokens=intro_row.completion_tokens
        + collab.completion_tokens
        + email.completion_tokens,
        total_tokens=intro_row.total_tokens + collab.total_tokens + email.total_tokens,
    )
    return BenchRow(
        tool="Vetra",
        flow="完整外联：介绍 + 合作分析 + 邮件（合计）",
        article_chars=len(article),
        prompt_tokens=total_acc.prompt_tokens,
        completion_tokens=total_acc.completion_tokens,
        total_tokens=total_acc.total_tokens,
        cost_usd=total_acc.estimated_cost_usd(),
        api_calls=intro_row.api_calls + collab.api_calls + email.api_calls,
        notes="3 次 API 调用",
    )


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--chars", type=int, default=1000, help="源文章字数")
    args = parser.parse_args()

    if not (settings.deepseek_api_key or "").strip():
        print("FAIL: 未配置 DEEPSEEK_API_KEY")
        return 1

    article = make_article(args.chars)
    model = settings.deepseek_model
    print(f"模型: {model}")
    print(f"基准源文章: {len(article)} 字（中文）")
    print("正在调用 DeepSeek…（约 1–3 分钟）\n")

    rows: list[BenchRow] = []
    rows.append(await bench_scrape(article))
    rows.append(await bench_scrape_integrate(article))
    rows.append(await bench_findoc_proceed(article))
    rows.append(await bench_templates(article))
    rows.append(await bench_rag_chat(article))
    rows.append(await bench_vetra_intro(article))
    rows.append(await bench_vetra_collab(article))
    rows.append(await bench_vetra_outreach_email(article))
    rows.append(await bench_vetra_full(article))

    print("=" * 88)
    print(f"{'Tool':<12} {'流程':<36} {'输入':>5} {'Prompt':>7} {'Compl':>7} {'Total':>7} {'USD':>9} {'/1000字Total':>11}")
    print("-" * 88)
    for r in rows:
        p = r.per_1000_chars()
        print(
            f"{r.tool:<12} {r.flow:<36} {r.article_chars:>5} "
            f"{r.prompt_tokens:>7} {r.completion_tokens:>7} {r.total_tokens:>7} "
            f"{r.cost_usd:>9.6f} {p['total']:>11.1f}"
        )
    print("=" * 88)
    print("\n每 1000 字源文章 — 详细归一化（prompt / completion / total tokens, USD）:")
    for r in rows:
        p = r.per_1000_chars()
        print(
            f"  [{r.tool}] {r.flow}\n"
            f"    prompt {p['prompt']:.1f}  completion {p['completion']:.1f}  "
            f"total {p['total']:.1f}  ≈ ${p['cost_usd']:.6f}  "
            f"({r.api_calls} calls) {r.notes}"
        )

    report_path = Path(__file__).resolve().parents[1] / "reports" / "bench_tool_tokens.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(
            {
                "model": model,
                "article_chars": len(article),
                "rows": [
                    {
                        **r.__dict__,
                        "per_1000_chars": r.per_1000_chars(),
                    }
                    for r in rows
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\n报告已写入: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
