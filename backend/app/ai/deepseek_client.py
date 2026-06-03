import json
import logging
import re

import httpx

from app.ai.errors import SummarizationError
from app.ai.token_usage import CompletionUsage
from app.config import settings

logger = logging.getLogger(__name__)


def parse_json_content(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        raise SummarizationError("AI 返回格式无效", "ai_parse_error") from e
    if not isinstance(parsed, dict):
        raise SummarizationError("AI 返回格式无效", "ai_parse_error")
    return parsed


def extract_message_content(data: dict) -> str:
    try:
        choices = data.get("choices")
        if not choices:
            raise KeyError("choices")
        message = choices[0].get("message")
        if not message:
            raise KeyError("message")
        content = message.get("content")
        if content is None:
            raise KeyError("content")
        return str(content)
    except (KeyError, IndexError, TypeError) as e:
        logger.error("unexpected DeepSeek response shape: %s", str(data)[:500])
        raise SummarizationError("AI 返回格式无效", "ai_parse_error") from e


async def chat_json(
    *,
    system: str,
    user: str,
    max_tokens: int = 1024,
    temperature: float = 0.2,
) -> tuple[dict, CompletionUsage]:
    if not settings.deepseek_api_key:
        raise SummarizationError("未配置 DEEPSEEK_API_KEY", "ai_not_configured")

    payload = {
        "model": settings.deepseek_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    url = f"{settings.deepseek_api_base.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }

    timeout_sec = max(15.0, float(settings.ai_summarize_timeout_sec))
    try:
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException:
        raise SummarizationError("AI 请求超时", "ai_timeout")
    except httpx.HTTPError as e:
        raise SummarizationError(f"AI 网络错误: {e}", "ai_network")

    if resp.status_code != 200:
        logger.error("DeepSeek error %s: %s", resp.status_code, resp.text[:500])
        raise SummarizationError("AI 服务返回错误", "ai_http_error")

    data = resp.json()
    content = extract_message_content(data)
    return parse_json_content(content), CompletionUsage.from_api(data)


async def chat_text(
    *,
    system: str,
    user: str,
    max_tokens: int = 4096,
    temperature: float = 0.1,
) -> tuple[str, CompletionUsage]:
    """Plain-text completion (e.g. translation)."""
    if not settings.deepseek_api_key:
        raise SummarizationError("未配置 DEEPSEEK_API_KEY", "ai_not_configured")

    payload = {
        "model": settings.deepseek_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    url = f"{settings.deepseek_api_base.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": "application/json",
    }

    timeout_sec = max(15.0, float(settings.ai_summarize_timeout_sec))
    try:
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.TimeoutException:
        raise SummarizationError("AI 请求超时", "ai_timeout")
    except httpx.HTTPError as e:
        raise SummarizationError(f"AI 网络错误: {e}", "ai_network")

    if resp.status_code != 200:
        logger.error("DeepSeek error %s: %s", resp.status_code, resp.text[:500])
        raise SummarizationError("AI 服务返回错误", "ai_http_error")

    data = resp.json()
    return extract_message_content(data).strip(), CompletionUsage.from_api(data)
