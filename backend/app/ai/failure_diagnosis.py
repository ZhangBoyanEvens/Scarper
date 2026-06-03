import logging
from dataclasses import dataclass, field

from app.ai.deepseek_client import chat_json
from app.ai.errors import SummarizationError
from app.config import settings
from app.services.pipeline_stages import stage_for_error_code, stage_label

logger = logging.getLogger(__name__)

DIAGNOSIS_SYSTEM = """You are a web scraping pipeline diagnostician for the Scarper app.
Given failure context, identify which pipeline stage failed and explain clearly in Simplified Chinese.

Pipeline stages (in order):
1. validate — URL format / SSRF / blocked file types
2. fetch — HTTP/Playwright download (timeouts, 403, Cloudflare, JS-only sites)
3. parse — HTML cleaning and main-content extraction (trafilatura + optional AI recovery)
4. summarize — DeepSeek API summary of structured content
5. config — missing API keys, Playwright disabled on server

Rules:
- Be specific about the failing stage and why.
- If recovery attempts are listed, mention whether they were reasonable and why they likely failed.
- Do not invent HTTP status codes or error messages not in the context.
- Suggest concrete user actions (login, fix URL, enable Playwright on server, try another link, use ??? between batch URLs).
- Return JSON only:
{
  "stage": "validate|fetch|parse|summarize|config|unknown",
  "stage_label": "short Chinese label for the stage",
  "summary": "2-4 sentences for the end user",
  "root_cause": "one sentence technical cause",
  "suggested_action": "one sentence what the user should try",
  "auto_fix_exhausted": true
}
"""


@dataclass
class FailureContext:
    requested_url: str
    normalized_url: str | None
    error_message: str
    error_code: str
    recovery_attempts: list[str] = field(default_factory=list)
    fetch_method: str | None = None
    html_snippet: str | None = None


@dataclass
class DiagnosisResult:
    stage: str
    stage_label: str
    summary: str
    root_cause: str
    suggested_action: str


def fallback_diagnosis(ctx: FailureContext) -> DiagnosisResult:
    stage = stage_for_error_code(ctx.error_code)
    return _fallback_diagnosis(ctx, stage, stage_label(stage))


async def diagnose_failure(ctx: FailureContext) -> DiagnosisResult:
    fallback_stage = stage_for_error_code(ctx.error_code)
    fallback_label = stage_label(fallback_stage)

    if not settings.ai_failure_diagnosis_enabled or not settings.deepseek_api_key:
        return fallback_diagnosis(ctx)

    user = _build_user_prompt(ctx, fallback_stage, fallback_label)
    try:
        parsed, _usage = await chat_json(
            system=DIAGNOSIS_SYSTEM,
            user=user,
            max_tokens=768,
            temperature=0.15,
        )
    except SummarizationError as e:
        logger.warning("failure diagnosis AI unavailable: %s", e)
        return fallback_diagnosis(ctx)
    except Exception:
        logger.exception("failure diagnosis failed")
        return fallback_diagnosis(ctx)

    stage = str(parsed.get("stage", fallback_stage))[:32]
    if stage not in ("validate", "fetch", "parse", "summarize", "config", "unknown"):
        stage = fallback_stage

    return DiagnosisResult(
        stage=stage,
        stage_label=str(parsed.get("stage_label", stage_label(stage)))[:64],
        summary=str(parsed.get("summary", ctx.error_message))[:1200],
        root_cause=str(parsed.get("root_cause", ctx.error_message))[:500],
        suggested_action=str(
            parsed.get("suggested_action", "请稍后重试或更换链接"),
        )[:500],
    )


def _build_user_prompt(
    ctx: FailureContext,
    fallback_stage: str,
    fallback_label: str,
) -> str:
    lines = [
        f"requested_url: {ctx.requested_url}",
        f"normalized_url: {ctx.normalized_url or '(not reached)'}",
        f"error_code: {ctx.error_code}",
        f"error_message: {ctx.error_message}",
        f"inferred_stage: {fallback_stage} ({fallback_label})",
        f"playwright_enabled_on_server: {settings.playwright_enabled}",
        f"ai_crawl_recovery_enabled: {settings.ai_crawl_recovery_enabled}",
    ]
    if ctx.fetch_method:
        lines.append(f"last_fetch_method: {ctx.fetch_method}")
    if ctx.recovery_attempts:
        lines.append("recovery_attempts:")
        for i, attempt in enumerate(ctx.recovery_attempts, 1):
            lines.append(f"  {i}. {attempt}")
    if ctx.html_snippet:
        lines.append(f"html_snippet (truncated):\n{ctx.html_snippet[:2000]}")
    return "\n".join(lines)


def _fallback_diagnosis(
    ctx: FailureContext,
    stage: str,
    label: str,
) -> DiagnosisResult:
    attempts = (
        f"已自动尝试：{'；'.join(ctx.recovery_attempts)}。"
        if ctx.recovery_attempts
        else ""
    )
    summary = f"{ctx.error_message}。失败环节：{label}。{attempts}".strip()
    action = _default_action(ctx.error_code)
    return DiagnosisResult(
        stage=stage,
        stage_label=label,
        summary=summary[:1200],
        root_cause=ctx.error_message,
        suggested_action=action,
    )


def _default_action(code: str) -> str:
    actions = {
        "cloudflare": "该站点有防护，可稍后重试或换用无强防护的页面链接",
        "playwright_disabled": "当前服务器未启用浏览器渲染，仅支持静态 HTML 页面",
        "ai_not_configured": "请在服务器配置 DEEPSEEK_API_KEY",
        "unauthorized": "请先登录后再抓取",
        "rate_limited": "今日额度或请求频率已达上限，请明日再试",
        "invalid_url": "请检查链接格式，批量网址请用 ??? 分隔",
        "timeout": "页面加载超时，可换网络或稍后重试",
        "extraction_failed": "页面结构异常，可尝试其他链接或详细模式",
    }
    return actions.get(code, "请检查链接与网络后重试")
