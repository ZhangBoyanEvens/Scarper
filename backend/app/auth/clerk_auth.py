"""
Clerk JWT 校验（预留）。
未配置 CLERK_SECRET_KEY 时跳过校验，便于本地开发。
"""

import logging
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWKClient
from jwt.exceptions import ExpiredSignatureError, InvalidIssuerError, PyJWTError

from app.auth.usage import (
    can_extract_today,
    get_daily_extract_count,
    get_daily_extract_limit,
    plan_from_pla_claim,
    record_extract,
)
from app.config import settings

logger = logging.getLogger(__name__)

_jwks_client: PyJWKClient | None = None
_jwks_issuer: str = ""
JWT_LEEWAY_SEC = 60


@dataclass
class AuthUser:
    user_id: str
    email: str | None = None
    name: str | None = None
    image_url: str | None = None
    plan: str = "free"


def _auth_enabled() -> bool:
    return bool(settings.clerk_secret_key and settings.clerk_jwt_issuer)


def _expected_issuer() -> str:
    raw = (settings.clerk_jwt_issuer or "").strip().rstrip("/")
    if raw.endswith("/.well-known/jwks.json"):
        raw = raw[: -len("/.well-known/jwks.json")].rstrip("/")
    return raw


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client, _jwks_issuer
    issuer = _expected_issuer()
    if not issuer:
        raise RuntimeError("CLERK_JWT_ISSUER 未配置")
    if _jwks_client is None or _jwks_issuer != issuer:
        _jwks_issuer = issuer
        _jwks_client = PyJWKClient(f"{issuer}/.well-known/jwks.json", cache_keys=True)
    return _jwks_client


def _auth_error_detail(exc: Exception) -> str:
    if isinstance(exc, ExpiredSignatureError):
        return "登录已过期，请刷新页面或重新登录后再试"
    if isinstance(exc, InvalidIssuerError):
        return (
            "JWT Issuer 与后端 CLERK_JWT_ISSUER 不一致。"
            "请在 Clerk 控制台 → API Keys 复制 Issuer（形如 https://xxx.clerk.accounts.dev）"
            "写入后端 .env 后重启服务"
        )
    return "登录已过期或无效，请退出后重新登录；若仍失败请检查 CLERK_JWT_ISSUER"


def _decode_token(token: str) -> dict:
    issuer = _expected_issuer()
    client = _get_jwks_client()
    signing_key = client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=issuer,
        leeway=JWT_LEEWAY_SEC,
        options={"verify_aud": False},
    )


def _user_from_payload(payload: dict) -> AuthUser:
    return AuthUser(
        user_id=payload.get("sub", ""),
        email=payload.get("email"),
        name=payload.get("name"),
        image_url=payload.get("picture"),
        plan=plan_from_pla_claim(payload.get("pla")),
    )


async def get_optional_user(
    authorization: str | None = Header(default=None),
) -> AuthUser | None:
    if not _auth_enabled():
        return None
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = _decode_token(token)
        user = _user_from_payload(payload)
        if not user.user_id:
            return None
        return user
    except Exception as e:
        logger.warning("optional auth failed: %s", e)
        return None


async def require_user(
    authorization: str | None = Header(default=None),
) -> AuthUser:
    if not _auth_enabled():
        raise HTTPException(
            status_code=503,
            detail="服务端未配置 Clerk，无法验证用户",
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="需要登录")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = _decode_token(token)
        user = _user_from_payload(payload)
        if not user.user_id:
            raise HTTPException(status_code=401, detail="无效的令牌")
        return user
    except HTTPException:
        raise
    except HTTPException:
        raise
    except PyJWTError as e:
        logger.warning("auth failed: %s (%s)", type(e).__name__, e)
        raise HTTPException(status_code=401, detail=_auth_error_detail(e)) from e
    except Exception as e:
        logger.warning("auth failed: %s", e)
        raise HTTPException(status_code=401, detail=_auth_error_detail(e)) from e
