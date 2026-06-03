"""Map legacy errors to structured failure model."""

from app.crawler.types import FetchError
from app.intelligence.types import ErrorType, FetchStage, StructuredFailure

_CODE_MAP: dict[str, tuple[ErrorType, FetchStage, bool, str]] = {
    "timeout": (ErrorType.TIMEOUT, "HTTP_FETCH", True, "稍后重试或换链接"),
    "cloudflare": (ErrorType.BLOCKED, "HTTP_FETCH", True, "站点有防护，可换链或启用 Stealth 浏览器"),
    "captcha": (ErrorType.CAPTCHA, "HTTP_FETCH", False, "需人工验证，无法自动抓取"),
    "blocked": (ErrorType.BLOCKED, "HTTP_FETCH", True, "访问被拒绝，减少频率或换链"),
    "http_error": (ErrorType.HTTP_ERROR, "HTTP_FETCH", True, "检查 URL 是否有效"),
    "empty_page": (ErrorType.EMPTY_PAGE, "PARSE", True, "页面无正文，可能需登录或为 SPA"),
    "js_required": (ErrorType.JS_REQUIRED, "PLAYWRIGHT", True, "需浏览器渲染"),
    "non_html": (ErrorType.NON_HTML, "HTTP_FETCH", False, "链接不是 HTML 页面"),
    "blocked_file_type": (ErrorType.FILE_UNSUPPORTED, "FILE_FETCH", False, "不支持该文件类型"),
    "playwright_disabled": (ErrorType.JS_REQUIRED, "PLAYWRIGHT", False, "服务器未启用 Playwright"),
    "extraction_failed": (ErrorType.EMPTY_PAGE, "PARSE", True, "解析失败，换链或详细模式"),
    "ai_timeout": (ErrorType.TIMEOUT, "AI", True, "AI 超时，稍后重试"),
}


def from_fetch_error(
    exc: FetchError,
    *,
    stage: FetchStage = "HTTP_FETCH",
) -> StructuredFailure:
    entry = _CODE_MAP.get(exc.code)
    if entry:
        etype, default_stage, recoverable, action = entry
        return StructuredFailure(
            error_type=etype,
            stage=default_stage if stage == "HTTP_FETCH" else stage,
            message=str(exc),
            recoverable=recoverable,
            recommended_action=action,
            error_code=exc.code,
        )
    return StructuredFailure(
        error_type=ErrorType.INTERNAL,
        stage=stage,
        message=str(exc),
        recoverable=True,
        recommended_action="请稍后重试",
        error_code=exc.code,
    )


def from_exception(exc: Exception, *, stage: FetchStage) -> StructuredFailure:
    if isinstance(exc, FetchError):
        return from_fetch_error(exc, stage=stage)
    msg = str(exc)
    if "timeout" in msg.lower():
        return StructuredFailure(
            error_type=ErrorType.TIMEOUT,
            stage=stage,
            message=msg,
            recoverable=True,
            recommended_action="增加超时或换链接",
            error_code="timeout",
        )
    return StructuredFailure(
        error_type=ErrorType.INTERNAL,
        stage=stage,
        message=msg,
        recoverable=False,
        recommended_action="联系管理员查看日志",
        error_code="internal_error",
    )
