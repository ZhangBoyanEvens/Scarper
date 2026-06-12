from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.schemas import ExtractResponse


class NeonStatusResponse(BaseModel):
    enabled: bool
    configured: bool
    connected: bool
    mode: Literal["neon", "local"]


class NeonStorageResponse(BaseModel):
    used_bytes: int = Field(ge=0)
    quota_bytes: int = Field(gt=0)
    quota_mb: int = Field(gt=0)
    used_percent: float = Field(ge=0, le=100)
    storage: Literal["neon"] = "neon"


class ProjectUploadRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=64)
    results: list[ExtractResponse] = Field(min_length=1, max_length=32)
    body_only: bool = False


class ProjectManualRecordRequest(BaseModel):
    """Dashboard 手动插入的空记录（可带初始正文）。"""

    title: str = Field(default="", max_length=120)
    initial_text: str = Field(default="", max_length=500_000)


class ProjectUploadResponse(BaseModel):
    id: str
    project_id: str
    uploaded_at: str
    body_only: bool
    result_count: int
    storage: Literal["neon", "local"] = "neon"


class ProjectUploadListItem(BaseModel):
    id: str
    project_id: str
    uploaded_at: str
    body_only: bool
    result_count: int
    success_count: int = 0
    source: str = "scrape"


class ProjectUploadDeleteResponse(BaseModel):
    id: str
    project_id: str
    deleted: bool = True
    storage: Literal["neon", "local"] = "neon"


class ProjectUploadListResponse(BaseModel):
    project_id: str
    items: list[ProjectUploadListItem]
    storage: Literal["neon", "local"] = "neon"


class ProjectUploadDetailResponse(BaseModel):
    id: str
    project_id: str
    uploaded_at: str
    body_only: bool
    result_count: int
    success_count: int = 0
    source: str = "scrape"
    results: list[ExtractResponse]
    editor_text: str | None = None
    storage: Literal["neon", "local"] = "neon"


class ProjectUploadEditorResponse(BaseModel):
    """轻量正文读取：有 editor_text 时不返回大型 results。"""

    editor_text: str | None = None
    results: list[ExtractResponse] = Field(default_factory=list)
    storage: Literal["neon", "local"] = "neon"


class ProjectUploadDocumentUpdateRequest(BaseModel):
    editor_text: str = Field(max_length=500_000)


class ProjectUploadDocumentUpdateResponse(BaseModel):
    id: str
    project_id: str
    uploaded_at: str
    editor_text: str
    storage: Literal["neon", "local"] = "neon"


class ProjectCreateRequest(BaseModel):
    id: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)


class ProjectItemResponse(BaseModel):
    id: str
    name: str
    description: str
    created_at: str
    updated_at: str


class ProjectListResponse(BaseModel):
    items: list[ProjectItemResponse]
    storage: Literal["neon", "local"] = "neon"
    user_id: str = Field(
        description="Clerk 用户 id；Neon 目录 schema 为 u_<user_id>"
    )


class ProjectDeleteResponse(BaseModel):
    id: str
    deleted: bool = True
    storage: Literal["neon", "local"] = "neon"


class FindocTemplateSaveRequest(BaseModel):
    id: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    content: str = Field(default="", max_length=500_000)


class FindocTemplateItemResponse(BaseModel):
    id: str
    name: str
    content: str
    created_at: str
    updated_at: str


class FindocTemplateListResponse(BaseModel):
    items: list[FindocTemplateItemResponse]
    storage: Literal["neon", "local"] = "neon"


class FindocTemplateDeleteResponse(BaseModel):
    id: str
    deleted: bool = True
    storage: Literal["neon", "local"] = "neon"


class FindocProjectSaveRequest(BaseModel):
    editor_text: str = Field(min_length=1, max_length=500_000)
    title: str = Field(default="", max_length=200)


class VetraCompanySaveRequest(BaseModel):
    id: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    introduction: str = Field(default="", max_length=500_000)


class VetraCompanyItemResponse(BaseModel):
    id: str
    name: str
    introduction: str
    created_at: str
    updated_at: str


class VetraCompanyListResponse(BaseModel):
    items: list[VetraCompanyItemResponse]
    storage: Literal["neon", "local"] = "neon"


class VetraCompanyDeleteResponse(BaseModel):
    id: str
    deleted: bool = True
    storage: Literal["neon", "local"] = "neon"


class VetraTemplateSaveRequest(BaseModel):
    id: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    subject: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=500_000)


class VetraTemplateItemResponse(BaseModel):
    id: str
    name: str
    subject: str
    body: str
    created_at: str
    updated_at: str


class VetraTemplateListResponse(BaseModel):
    items: list[VetraTemplateItemResponse]
    storage: Literal["neon", "local"] = "neon"


class VetraTemplateDeleteResponse(BaseModel):
    id: str
    deleted: bool = True
    storage: Literal["neon", "local"] = "neon"
