from typing import Literal

from pydantic import BaseModel

from app.models.project_schemas import NeonStatusResponse


class ClerkBackendDiagnostic(BaseModel):
    enabled: bool
    issuer_configured: bool
    require_auth: bool
    jwks_reachable: bool | None = None
    jwks_error: str | None = None


class AuthDiagnostic(BaseModel):
    token_present: bool
    token_valid: bool | None = None
    user_id: str | None = None
    email: str | None = None
    error: str | None = None


class DeepseekDiagnostic(BaseModel):
    configured: bool
    model: str
    api_base: str


class PlaywrightDiagnostic(BaseModel):
    enabled: bool
    import_ok: bool
    browser_connected: bool


class CrawlerDiagnostic(BaseModel):
    fetch_timeout_sec: float
    extract_timeout_sec: float
    playwright_enabled: bool
    cache_ttl_sec: int


class DiagnosticsResponse(BaseModel):
    status: Literal["ok", "degraded"]
    checked_at: str
    python_version: str
    app_version: str
    clerk: ClerkBackendDiagnostic
    auth: AuthDiagnostic
    deepseek: DeepseekDiagnostic
    neon: NeonStatusResponse
    playwright: PlaywrightDiagnostic
    crawler: CrawlerDiagnostic
