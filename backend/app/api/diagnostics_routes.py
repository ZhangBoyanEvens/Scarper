"""连接诊断 API — 供设置页调试后端/爬虫/Clerk/Neon 等。"""

import logging
import sys
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Header

from app.auth.clerk_auth import (
    AuthUser,
    _auth_enabled,
    _decode_token,
    _user_from_payload,
)
from app.config import settings
from app.db.neon import get_neon_repository
from app.models.diagnostics_schemas import (
    AuthDiagnostic,
    ClerkBackendDiagnostic,
    CrawlerDiagnostic,
    DeepseekDiagnostic,
    DiagnosticsResponse,
    PlaywrightDiagnostic,
)
from app.models.project_schemas import NeonStatusResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["diagnostics"])


async def _check_jwks() -> tuple[bool | None, str | None]:
    if not _auth_enabled():
        return None, None
    issuer = settings.clerk_jwt_issuer.rstrip("/")
    url = f"{issuer}/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(url)
            if res.status_code != 200:
                return False, f"HTTP {res.status_code}"
            data = res.json()
            if not isinstance(data, dict) or not data.get("keys"):
                return False, "JWKS 响应无 keys"
            return True, None
    except Exception as e:
        logger.debug("jwks check failed: %s", e)
        return False, str(e)


def _auth_diagnostic(authorization: str | None) -> AuthDiagnostic:
    token_present = bool(
        authorization and authorization.startswith("Bearer ")
    )
    if not _auth_enabled():
        return AuthDiagnostic(
            token_present=token_present,
            token_valid=None,
            error=None,
        )
    if not token_present:
        return AuthDiagnostic(token_present=False, token_valid=None)
    token = authorization.removeprefix("Bearer ").strip()  # type: ignore[union-attr]
    try:
        user: AuthUser = _user_from_payload(_decode_token(token))
        return AuthDiagnostic(
            token_present=True,
            token_valid=True,
            user_id=user.user_id,
            email=user.email,
        )
    except Exception as e:
        return AuthDiagnostic(
            token_present=True,
            token_valid=False,
            error=str(e),
        )


def _playwright_diagnostic() -> PlaywrightDiagnostic:
    import_ok = False
    browser_connected = False
    try:
        import playwright  # noqa: F401

        import_ok = True
    except ImportError:
        pass

    if settings.playwright_enabled and import_ok:
        try:
            from app.crawler.playwright.browser_manager import BrowserManager

            browser = BrowserManager.shared()._browser
            browser_connected = bool(browser and browser.is_connected())
        except Exception:
            browser_connected = False

    return PlaywrightDiagnostic(
        enabled=settings.playwright_enabled,
        import_ok=import_ok,
        browser_connected=browser_connected,
    )


def _neon_diagnostic() -> NeonStatusResponse:
    repo = get_neon_repository()
    configured = repo is not None
    connected = False
    if repo:
        connected = repo.ping()
    mode = "neon" if connected else "local"
    return NeonStatusResponse(
        enabled=settings.neon_enabled,
        configured=configured,
        connected=connected,
        mode=mode,
    )


@router.get("/diagnostics", response_model=DiagnosticsResponse)
async def get_diagnostics(
    authorization: str | None = Header(default=None),
) -> DiagnosticsResponse:
    jwks_ok, jwks_err = await _check_jwks()
    neon = _neon_diagnostic()
    playwright = _playwright_diagnostic()
    deepseek_ok = bool((settings.deepseek_api_key or "").strip())

    clerk = ClerkBackendDiagnostic(
        enabled=_auth_enabled(),
        issuer_configured=bool((settings.clerk_jwt_issuer or "").strip()),
        require_auth=settings.clerk_require_auth,
        jwks_reachable=jwks_ok,
        jwks_error=jwks_err,
    )

    degraded = False
    if not deepseek_ok:
        degraded = True
    if settings.neon_enabled and neon.configured and not neon.connected:
        degraded = True
    if settings.playwright_enabled and not playwright.import_ok:
        degraded = True
    if clerk.enabled and jwks_ok is False:
        degraded = True

    return DiagnosticsResponse(
        status="degraded" if degraded else "ok",
        checked_at=datetime.now(timezone.utc).isoformat(),
        python_version=sys.version.split()[0],
        app_version="1.0.0",
        clerk=clerk,
        auth=_auth_diagnostic(authorization),
        deepseek=DeepseekDiagnostic(
            configured=deepseek_ok,
            model=settings.deepseek_model,
            api_base=settings.deepseek_api_base,
        ),
        neon=neon,
        playwright=playwright,
        crawler=CrawlerDiagnostic(
            fetch_timeout_sec=settings.fetch_timeout_sec,
            extract_timeout_sec=settings.extract_timeout_sec,
            playwright_enabled=settings.playwright_enabled,
            cache_ttl_sec=settings.cache_ttl_sec,
        ),
    )
