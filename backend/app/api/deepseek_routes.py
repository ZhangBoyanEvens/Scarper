"""Proxy DeepSeek Chat Completions for browser clients (streaming + non-streaming)."""

import logging

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/deepseek")

_TIMEOUT = httpx.Timeout(connect=15.0, read=None, write=120.0, pool=15.0)


@router.post("/chat/completions")
async def proxy_chat_completions(request: Request):
    if not (settings.deepseek_api_key or "").strip():
        raise HTTPException(status_code=503, detail="未配置 DEEPSEEK_API_KEY")

    body = await request.body()
    url = f"{settings.deepseek_api_base.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.deepseek_api_key}",
        "Content-Type": request.headers.get("content-type", "application/json"),
        "Accept": request.headers.get("accept", "application/json"),
    }

    client = httpx.AsyncClient(timeout=_TIMEOUT)
    try:
        req = client.build_request("POST", url, content=body, headers=headers)
        resp = await client.send(req, stream=True)
    except httpx.HTTPError as e:
        await client.aclose()
        logger.exception("DeepSeek proxy connection failed")
        raise HTTPException(status_code=502, detail=f"AI 服务连接失败: {e}") from e

    if resp.status_code != 200:
        error_body = await resp.aread()
        await resp.aclose()
        await client.aclose()
        detail = error_body.decode("utf-8", errors="replace")[:500]
        logger.error("DeepSeek proxy error %s: %s", resp.status_code, detail)
        raise HTTPException(status_code=resp.status_code, detail=detail)

    media_type = resp.headers.get("content-type", "application/json")

    async def stream_body():
        try:
            async for chunk in resp.aiter_bytes():
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()

    return StreamingResponse(stream_body(), status_code=200, media_type=media_type)
