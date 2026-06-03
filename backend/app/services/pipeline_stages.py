from typing import Literal

PipelineStage = Literal["validate", "fetch", "parse", "summarize", "config", "unknown"]

STAGE_LABELS: dict[str, str] = {
    "validate": "链接校验",
    "fetch": "页面抓取",
    "parse": "正文解析",
    "summarize": "AI 摘要",
    "config": "服务配置",
    "unknown": "未知环节",
}

ERROR_CODE_TO_STAGE: dict[str, PipelineStage] = {
    "empty_url": "validate",
    "invalid_url": "validate",
    "invalid_scheme": "validate",
    "blocked_scheme": "validate",
    "blocked_file_type": "validate",
    "ssrf_blocked": "validate",
    "timeout": "fetch",
    "network_error": "fetch",
    "http_error": "fetch",
    "cloudflare": "fetch",
    "captcha": "fetch",
    "login_required": "fetch",
    "blocked": "fetch",
    "js_required": "fetch",
    "empty_page": "fetch",
    "non_html": "fetch",
    "blocked_content_type": "fetch",
    "page_too_large": "fetch",
    "too_many_redirects": "fetch",
    "playwright_disabled": "config",
    "playwright_error": "fetch",
    "fetch_failed": "fetch",
    "extraction_failed": "parse",
    "ai_recovery_empty": "parse",
    "ai_failed": "summarize",
    "ai_parse_error": "summarize",
    "ai_timeout": "summarize",
    "ai_network": "summarize",
    "ai_http_error": "summarize",
    "ai_not_configured": "config",
    "internal_error": "unknown",
}


def stage_for_error_code(code: str) -> PipelineStage:
    return ERROR_CODE_TO_STAGE.get(code, "unknown")


def stage_label(stage: str) -> str:
    return STAGE_LABELS.get(stage, STAGE_LABELS["unknown"])
