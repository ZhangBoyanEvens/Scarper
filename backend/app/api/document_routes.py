import asyncio
import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.models.document_schemas import DocumentExtractResponse
from app.services.document_extract import (
    DocumentExtractError,
    extract_document,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/extract", response_model=DocumentExtractResponse)
async def extract_uploaded_document(
    file: UploadFile = File(...),
) -> DocumentExtractResponse:
    filename = (file.filename or "upload").strip()
    if not filename:
        raise HTTPException(status_code=400, detail="缺少文件名")

    try:
        data = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail="无法读取上传文件") from e

    if not data:
        raise HTTPException(status_code=400, detail="文件为空")

    try:
        result = await asyncio.to_thread(extract_document, data, filename)
    except DocumentExtractError as e:
        logger.warning("document_extract_failed file=%s code=%s", filename, e.code)
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        logger.exception("document_extract_error file=%s", filename)
        raise HTTPException(
            status_code=500,
            detail=f"文档解析失败：{e}",
        ) from e

    return DocumentExtractResponse(
        text=result.text,
        filename=result.filename,
        method=result.method,
        char_count=result.char_count,
    )
