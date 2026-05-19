import ipaddress
import re
from urllib.parse import urlparse

from app.config import settings

# Block executable / archive downloads at URL path level
BLOCKED_EXTENSIONS = re.compile(
    r"\.(exe|msi|dmg|pkg|deb|rpm|zip|rar|7z|tar|gz|bz2|xz|"
    r"apk|ipa|bin|iso|img|dll|so|dylib|jar|war|ps1|sh|bat|cmd)(\?|$)",
    re.I,
)

BLOCKED_SCHEMES = frozenset({"file", "javascript", "data", "blob", "ftp", "mailto"})


class UrlValidationError(ValueError):
    def __init__(self, message: str, code: str = "invalid_url"):
        super().__init__(message)
        self.code = code


def normalize_url(raw: str) -> str:
    text = raw.strip()
    if not text:
        raise UrlValidationError("URL 不能为空", "empty_url")

    if not re.match(r"^https?://", text, re.I):
        text = f"https://{text}"

    parsed = urlparse(text)
    if parsed.scheme.lower() in BLOCKED_SCHEMES:
        raise UrlValidationError("不允许的 URL 协议", "blocked_scheme")

    if parsed.scheme.lower() not in ("http", "https"):
        raise UrlValidationError("仅支持 http/https 链接", "invalid_scheme")

    if not parsed.netloc:
        raise UrlValidationError("URL 格式无效", "invalid_url")

    if BLOCKED_EXTENSIONS.search(parsed.path or ""):
        raise UrlValidationError("不允许下载该类型文件", "blocked_file_type")

    host = parsed.hostname or ""
    _assert_safe_host(host)

    # Rebuild canonical URL (strip credentials / fragments for fetch)
    port = f":{parsed.port}" if parsed.port else ""
    path = parsed.path or "/"
    query = f"?{parsed.query}" if parsed.query else ""
    return f"{parsed.scheme}://{host}{port}{path}{query}"


def _assert_safe_host(host: str) -> None:
    lower = host.lower()
    if lower in ("localhost", "127.0.0.1", "::1"):
        if not settings.allow_localhost:
            raise UrlValidationError("不允许访问本地地址", "ssrf_blocked")
        return

    # Block metadata / link-local
    if lower.endswith((".local", ".internal", ".lan")):
        raise UrlValidationError("不允许访问内网域名", "ssrf_blocked")

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return  # hostname — resolved at fetch time with extra care in fetcher

    if not settings.allow_localhost and (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
    ):
        raise UrlValidationError("不允许访问私有或保留 IP", "ssrf_blocked")
