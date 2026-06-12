"""Neon 项目数据库 API（每用户独立 schema）。"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth.clerk_auth import AuthUser, _auth_enabled, get_optional_user, require_user
from app.config import settings
from app.db.errors import (
    NeonConnectionError,
    NeonNotConfiguredError,
    NeonStorageQuotaError,
)
from app.db.neon_io import neon_io
from app.db.storage_quota import neon_user_quota_bytes
from app.db.neon import get_neon_repository
from app.models.project_schemas import (
    FindocProjectMatchRequest,
    FindocProjectMatchResponse,
    FindocProjectSaveRequest,
    FindocTemplateDeleteResponse,
    FindocTemplateItemResponse,
    FindocTemplateListResponse,
    FindocTemplateSaveRequest,
    NeonStatusResponse,
    NeonStorageResponse,
    ProjectCreateRequest,
    ProjectDeleteResponse,
    ProjectItemResponse,
    ProjectListResponse,
    ProjectUploadEditorResponse,
    ProjectUploadListItem,
    ProjectUploadDeleteResponse,
    ProjectUploadDetailResponse,
    ProjectUploadDocumentUpdateRequest,
    ProjectUploadDocumentUpdateResponse,
    ProjectUploadListResponse,
    ProjectManualRecordRequest,
    ProjectUploadRequest,
    ProjectUploadResponse,
    VetraCompanyDeleteResponse,
    VetraCompanyItemResponse,
    VetraCompanyListResponse,
    VetraCompanySaveRequest,
    VetraTemplateDeleteResponse,
    VetraTemplateItemResponse,
    VetraTemplateListResponse,
    VetraTemplateSaveRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/neon", tags=["neon"])


def resolve_neon_user_id(user: AuthUser | None) -> str:
    """每个 Clerk 账户独立 Neon 目录 schema（u_<user_id>）。"""
    if user and user.user_id:
        return user.user_id
    if _auth_enabled():
        raise HTTPException(
            status_code=401,
            detail="需要登录后才能使用 Neon 项目数据库",
        )
    if not settings.neon_require_auth:
        dev_id = (settings.neon_dev_user_id or "").strip()
        if dev_id:
            return dev_id
    raise HTTPException(
        status_code=401,
        detail="需要登录后才能使用 Neon 项目数据库",
    )


@router.get("/status", response_model=NeonStatusResponse)
async def neon_status() -> NeonStatusResponse:
    repo = get_neon_repository()
    configured = repo is not None
    connected = await neon_io(repo.ping_cached) if repo else False
    mode = "neon" if connected else "local"
    return NeonStatusResponse(
        enabled=settings.neon_enabled,
        configured=configured,
        connected=connected,
        mode=mode,
    )


def _storage_quota_http_detail(exc: NeonStorageQuotaError) -> dict:
    quota = exc.quota_bytes
    used = exc.used_bytes
    return {
        "code": "storage_quota_exceeded",
        "message": (
            f"Neon 存储已满（已用 {used // (1024 * 1024)}MB / "
            f"{quota // (1024 * 1024)}MB）"
        ),
        "used_bytes": used,
        "quota_bytes": quota,
    }


@router.get("/storage", response_model=NeonStorageResponse)
async def get_user_storage(
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> NeonStorageResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    quota = neon_user_quota_bytes()
    try:
        used = await neon_io(repo.get_user_storage_bytes, user_id)
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    percent = min(100.0, round(used / quota * 100, 2)) if quota else 100.0
    return NeonStorageResponse(
        used_bytes=used,
        quota_bytes=quota,
        quota_mb=quota // (1024 * 1024),
        used_percent=percent,
    )


def _project_item(record) -> ProjectItemResponse:
    return ProjectItemResponse(
        id=record.id,
        name=record.name,
        description=record.description,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.get("/projects", response_model=ProjectListResponse)
async def list_projects(
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> ProjectListResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        rows = await neon_io(repo.list_projects, user_id)
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return ProjectListResponse(
        items=[_project_item(r) for r in rows],
        storage="neon",
        user_id=user_id,
    )


@router.post("/projects", response_model=ProjectItemResponse, status_code=201)
async def create_project(
    body: ProjectCreateRequest,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> ProjectItemResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        record = await neon_io(
            repo.create_project,
            user_id,
            name=body.name,
            description=body.description,
            project_id=body.id,
        )
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return _project_item(record)


@router.delete(
    "/projects/{project_id}",
    response_model=ProjectDeleteResponse,
)
async def delete_project(
    project_id: str,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> ProjectDeleteResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        deleted = await neon_io(repo.delete_project, user_id, project_id)
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    if not deleted:
        raise HTTPException(status_code=404, detail="项目不存在")

    return ProjectDeleteResponse(id=project_id, storage="neon")


def _findoc_template_item(record) -> FindocTemplateItemResponse:
    return FindocTemplateItemResponse(
        id=record.id,
        name=record.name,
        content=record.content,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.get("/findoc/templates", response_model=FindocTemplateListResponse)
async def list_findoc_templates(
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> FindocTemplateListResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        rows = await neon_io(repo.list_findoc_templates, user_id)
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return FindocTemplateListResponse(
        items=[_findoc_template_item(r) for r in rows],
        storage="neon",
    )


@router.post("/findoc/templates", response_model=FindocTemplateItemResponse)
async def save_findoc_template(
    body: FindocTemplateSaveRequest,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> FindocTemplateItemResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        record = await neon_io(
            repo.save_findoc_template,
            user_id,
            template_id=body.id,
            name=body.name,
            content=body.content,
        )
    except NeonStorageQuotaError as e:
        raise HTTPException(
            status_code=413, detail=_storage_quota_http_detail(e)
        ) from e
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return _findoc_template_item(record)


@router.delete(
    "/findoc/templates/{template_id}",
    response_model=FindocTemplateDeleteResponse,
)
async def delete_findoc_template(
    template_id: str,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> FindocTemplateDeleteResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        deleted = await neon_io(repo.delete_findoc_template, user_id, template_id)
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    if not deleted:
        raise HTTPException(status_code=404, detail="模板不存在")

    return FindocTemplateDeleteResponse(id=template_id, storage="neon")


def _vetra_company_item(record) -> VetraCompanyItemResponse:
    return VetraCompanyItemResponse(
        id=record.id,
        name=record.name,
        introduction=record.introduction,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _vetra_template_item(record) -> VetraTemplateItemResponse:
    return VetraTemplateItemResponse(
        id=record.id,
        name=record.name,
        subject=record.subject,
        body=record.body,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


@router.get("/vetra/companies", response_model=VetraCompanyListResponse)
async def list_vetra_companies(
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> VetraCompanyListResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        rows = await neon_io(repo.list_vetra_companies, user_id)
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return VetraCompanyListResponse(
        items=[_vetra_company_item(r) for r in rows],
        storage="neon",
    )


@router.post("/vetra/companies", response_model=VetraCompanyItemResponse)
async def save_vetra_company(
    body: VetraCompanySaveRequest,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> VetraCompanyItemResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        record = await neon_io(
            repo.save_vetra_company,
            user_id,
            company_id=body.id,
            name=body.name,
            introduction=body.introduction,
        )
    except NeonStorageQuotaError as e:
        raise HTTPException(
            status_code=413, detail=_storage_quota_http_detail(e)
        ) from e
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return _vetra_company_item(record)


@router.delete(
    "/vetra/companies/{company_id}",
    response_model=VetraCompanyDeleteResponse,
)
async def delete_vetra_company(
    company_id: str,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> VetraCompanyDeleteResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        deleted = await neon_io(repo.delete_vetra_company, user_id, company_id)
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    if not deleted:
        raise HTTPException(status_code=404, detail="公司不存在")

    return VetraCompanyDeleteResponse(id=company_id, storage="neon")


@router.get("/vetra/templates", response_model=VetraTemplateListResponse)
async def list_vetra_templates(
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> VetraTemplateListResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        rows = await neon_io(repo.list_vetra_templates, user_id)
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return VetraTemplateListResponse(
        items=[_vetra_template_item(r) for r in rows],
        storage="neon",
    )


@router.post("/vetra/templates", response_model=VetraTemplateItemResponse)
async def save_vetra_template(
    body: VetraTemplateSaveRequest,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> VetraTemplateItemResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        record = await neon_io(
            repo.save_vetra_template,
            user_id,
            template_id=body.id,
            name=body.name,
            subject=body.subject,
            body=body.body,
        )
    except NeonStorageQuotaError as e:
        raise HTTPException(
            status_code=413, detail=_storage_quota_http_detail(e)
        ) from e
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return _vetra_template_item(record)


@router.delete(
    "/vetra/templates/{template_id}",
    response_model=VetraTemplateDeleteResponse,
)
async def delete_vetra_template(
    template_id: str,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> VetraTemplateDeleteResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        deleted = await neon_io(repo.delete_vetra_template, user_id, template_id)
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    if not deleted:
        raise HTTPException(status_code=404, detail="模板不存在")

    return VetraTemplateDeleteResponse(id=template_id, storage="neon")


@router.post(
    "/projects/{project_id}/findoc/match",
    response_model=FindocProjectMatchResponse,
)
async def match_saved_findoc(
    project_id: str,
    body: FindocProjectMatchRequest,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> FindocProjectMatchResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    if not await neon_io(repo.project_exists, user_id, project_id):
        raise HTTPException(status_code=404, detail="项目不存在")

    try:
        record = await neon_io(
            repo.find_findoc_by_context,
            user_id,
            project_id=project_id,
            template_id=body.template_id,
            task_ids=body.task_ids,
            adjustment_prompt=body.adjustment_prompt,
        )
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    if not record or not record.editor_text:
        return FindocProjectMatchResponse(matched=False, storage="neon")

    return FindocProjectMatchResponse(
        matched=True,
        id=record.id,
        editor_text=record.editor_text,
        title=record.title or None,
        uploaded_at=record.uploaded_at,
        storage="neon",
    )


@router.post(
    "/projects/{project_id}/findoc",
    response_model=ProjectUploadResponse,
    status_code=201,
)
async def save_findoc_to_project(
    project_id: str,
    body: FindocProjectSaveRequest,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> ProjectUploadResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    if not await neon_io(repo.project_exists, user_id, project_id):
        raise HTTPException(status_code=404, detail="项目不存在")

    try:
        record = await neon_io(
            repo.save_findoc_document,
            user_id,
            project_id=project_id,
            editor_text=body.editor_text,
            title=body.title,
            upload_id=body.upload_id,
            template_id=body.template_id,
            task_ids=body.task_ids,
            adjustment_prompt=body.adjustment_prompt,
        )
        try:
            await neon_io(repo.touch_project, user_id, project_id)
        except NeonConnectionError:
            pass
    except NeonStorageQuotaError as e:
        raise HTTPException(
            status_code=413, detail=_storage_quota_http_detail(e)
        ) from e
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return ProjectUploadResponse(
        id=record.id,
        project_id=record.project_id,
        uploaded_at=record.uploaded_at,
        body_only=record.body_only,
        result_count=record.result_count,
        storage="neon",
    )


@router.post(
    "/projects/{project_id}/records",
    response_model=ProjectUploadResponse,
    status_code=201,
)
async def create_manual_project_record(
    project_id: str,
    body: ProjectManualRecordRequest,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> ProjectUploadResponse:
    """Dashboard：插入一条新的手动记录（无 Scrape 来源）。"""
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "neon_not_configured",
                "message": "Neon 未配置，请使用前端本地项目数据库",
                "mode": "local",
            },
        )

    try:
        record = await neon_io(
            repo.create_manual_upload,
            user_id=user_id,
            project_id=project_id,
            editor_text=body.initial_text,
            title=body.title,
        )
        try:
            await neon_io(repo.touch_project, user_id, project_id)
        except NeonConnectionError:
            pass
    except NeonNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except NeonStorageQuotaError as e:
        raise HTTPException(
            status_code=413, detail=_storage_quota_http_detail(e)
        ) from e
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return ProjectUploadResponse(
        id=record.id,
        project_id=record.project_id,
        uploaded_at=record.uploaded_at,
        body_only=record.body_only,
        result_count=record.result_count,
        storage="neon",
    )


@router.post("/projects/{project_id}/upload", response_model=ProjectUploadResponse)
async def upload_to_project_database(
    project_id: str,
    body: ProjectUploadRequest,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> ProjectUploadResponse:
    if body.project_id != project_id:
        raise HTTPException(status_code=400, detail="project_id 与路径不一致")

    user_id = resolve_neon_user_id(user)

    repo = get_neon_repository()
    if not repo:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "neon_not_configured",
                "message": "Neon 未配置，请使用前端本地项目数据库",
                "mode": "local",
            },
        )

    results_payload = [r.model_dump(mode="json") for r in body.results]

    try:
        record = await neon_io(
            repo.upload_project_results,
            user_id=user_id,
            project_id=project_id,
            results=results_payload,
            body_only=body.body_only,
        )
        try:
            await neon_io(repo.touch_project, user_id, project_id)
        except NeonConnectionError:
            pass
    except NeonNotConfiguredError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except NeonStorageQuotaError as e:
        raise HTTPException(
            status_code=413, detail=_storage_quota_http_detail(e)
        ) from e
    except NeonConnectionError as e:
        logger.exception(
            "neon upload failed user=%s project_id=%s",
            user_id,
            project_id,
        )
        raise HTTPException(status_code=502, detail=str(e)) from e

    return ProjectUploadResponse(
        id=record.id,
        project_id=record.project_id,
        uploaded_at=record.uploaded_at,
        body_only=record.body_only,
        result_count=record.result_count,
        storage="neon",
    )


@router.get(
    "/projects/{project_id}/uploads",
    response_model=ProjectUploadListResponse,
)
async def list_project_uploads(
    project_id: str,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> ProjectUploadListResponse:
    user_id = resolve_neon_user_id(user)

    repo = get_neon_repository()
    if not repo:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "neon_not_configured",
                "message": "Neon 未配置",
                "mode": "local",
            },
        )

    try:
        rows = await neon_io(repo.list_uploads_for_project, user_id, project_id)
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return ProjectUploadListResponse(
        project_id=project_id,
        items=[
            ProjectUploadListItem(
                id=r.id,
                project_id=r.project_id,
                uploaded_at=r.uploaded_at,
                body_only=r.body_only,
                result_count=r.result_count,
                success_count=r.success_count,
                source=r.source,
                title=r.title,
            )
            for r in rows
        ],
        storage="neon",
    )


@router.get(
    "/projects/{project_id}/uploads/{upload_id}",
    response_model=ProjectUploadDetailResponse,
)
async def get_project_upload(
    project_id: str,
    upload_id: str,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> ProjectUploadDetailResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        meta, results = await neon_io(
            repo.get_upload_record, user_id, project_id, upload_id
        )
    except NeonConnectionError as e:
        msg = str(e)
        if "不存在" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=502, detail=msg) from e

    return ProjectUploadDetailResponse(
        id=meta.id,
        project_id=meta.project_id,
        uploaded_at=meta.uploaded_at,
        body_only=meta.body_only,
        result_count=meta.result_count,
        success_count=meta.success_count,
        source=meta.source,
        results=results,
        editor_text=meta.editor_text,
        storage="neon",
    )


@router.get(
    "/projects/{project_id}/uploads/{upload_id}/editor",
    response_model=ProjectUploadEditorResponse,
)
async def get_project_upload_editor(
    project_id: str,
    upload_id: str,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> ProjectUploadEditorResponse:
    """轻量读取正文：优先 editor_text，避免传输大型 results JSONB。"""
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        editor_text, results = await neon_io(
            repo.get_upload_editor_payload, user_id, project_id, upload_id
        )
    except NeonConnectionError as e:
        msg = str(e)
        if "不存在" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=502, detail=msg) from e

    return ProjectUploadEditorResponse(
        editor_text=editor_text,
        results=results,
        storage="neon",
    )


@router.patch(
    "/projects/{project_id}/uploads/{upload_id}",
    response_model=ProjectUploadDocumentUpdateResponse,
)
async def update_project_upload_document(
    project_id: str,
    upload_id: str,
    body: ProjectUploadDocumentUpdateRequest,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> ProjectUploadDocumentUpdateResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        meta = await neon_io(
            repo.update_upload_editor_text,
            user_id,
            project_id,
            upload_id,
            body.editor_text,
        )
        try:
            await neon_io(repo.touch_project, user_id, project_id)
        except NeonConnectionError:
            pass
    except NeonStorageQuotaError as e:
        raise HTTPException(
            status_code=413, detail=_storage_quota_http_detail(e)
        ) from e
    except NeonConnectionError as e:
        msg = str(e)
        if "不存在" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=502, detail=msg) from e

    return ProjectUploadDocumentUpdateResponse(
        id=meta.id,
        project_id=meta.project_id,
        uploaded_at=meta.uploaded_at,
        editor_text=meta.editor_text or body.editor_text,
        storage="neon",
    )


@router.delete(
    "/projects/{project_id}/uploads/{upload_id}",
    response_model=ProjectUploadDeleteResponse,
)
async def delete_project_upload(
    project_id: str,
    upload_id: str,
    user: AuthUser | None = Depends(
        require_user if settings.neon_require_auth else get_optional_user
    ),
) -> ProjectUploadDeleteResponse:
    user_id = resolve_neon_user_id(user)
    repo = get_neon_repository()
    if not repo:
        raise HTTPException(status_code=503, detail="Neon 未配置")

    try:
        deleted = await neon_io(
            repo.delete_upload_record, user_id, project_id, upload_id
        )
    except NeonConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    if not deleted:
        raise HTTPException(status_code=404, detail="记录不存在")

    try:
        await neon_io(repo.touch_project, user_id, project_id)
    except NeonConnectionError:
        pass

    return ProjectUploadDeleteResponse(
        id=upload_id,
        project_id=project_id,
        storage="neon",
    )
