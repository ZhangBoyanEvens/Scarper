from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

OutputLanguage = Literal["zh", "original", "en"]
OutputDetail = Literal["detailed", "concise"]


class ExtractRequest(BaseModel):
    url: HttpUrl
    # 用户保存的处理指令：指导 AI 如何分析已抓取内容（非网页内指令）
    processing_prompt: str | None = Field(default=None, max_length=8000)
    # 摘要/要点输出语言：中文、原文、英文
    output_language: OutputLanguage = "zh"
    output_detail: OutputDetail = "concise"


class StructuredPage(BaseModel):
    title: str = ""
    description: str = ""
    main_content: str = ""
    headings: list[str] = Field(default_factory=list)
    links: list[str] = Field(default_factory=list)
    tables: list[list[list[str]]] = Field(default_factory=list)


class ExtractSuccess(BaseModel):
    url: str
    title: str = ""
    summary: str = ""
    key_points: list[str] = Field(default_factory=list)
    content: str = ""
    detected_language: str = ""
    status: Literal["success"] = "success"


class ExtractError(BaseModel):
    url: str = ""
    status: Literal["error"] = "error"
    error: str
    error_code: str = "unknown"


ExtractResponse = ExtractSuccess | ExtractError


class UserProfileResponse(BaseModel):
    user_id: str
    email: str | None = None
    name: str | None = None
    image_url: str | None = None
    extract_count: int = 0
    extract_limit: int | None = 20
    plan: str = "free"
