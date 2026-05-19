"""
Clerk JWT 校验（预留）。
未配置 CLERK_SECRET_KEY 时跳过校验，便于本地开发。
"""

import logging
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWKClient

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


@dataclass
class AuthUser:
    user_id: str
    email: str | None = None
    name: str | None = None
    image_url: str | None = None
    plan: str = "free"


def _auth_enabled() -> bool:
    return bool(settings.clerk_secret_key and settings.clerk_jwt_issuer)


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        issuer = settings.clerk_jwt_issuer.rstrip("/")
        _jwks_client = PyJWKClient(f"{issuer}/.well-known/jwks.json")
    return _jwks_client


def _decode_token(token: str) -> dict:
    client = _get_jwks_client()
    signing_key = client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=settings.clerk_jwt_issuer.rstrip("/"),
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
    except Exception as e:
        logger.warning("auth failed: %s", e)
        raise HTTPException(status_code=401, detail="登录已过期或无效") from e
