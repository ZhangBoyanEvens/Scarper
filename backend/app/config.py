from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    deepseek_api_key: str = ""
    deepseek_api_base: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    # Crawler
    fetch_timeout_sec: float = 30.0
    playwright_timeout_sec: float = 45.0
    max_redirects: int = 5
    max_response_bytes: int = 5 * 1024 * 1024
    max_content_chars: int = 12_000
    max_llm_chars: int = 8_000
    crawl_retries: int = 2
    allow_localhost: bool = False

    # Cache (in-memory TTL seconds; 0 = disabled)
    cache_ttl_sec: int = 300

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Clerk（留空则关闭后端 JWT 校验）
    clerk_secret_key: str = ""
    clerk_jwt_issuer: str = ""
    # 设为 true 时 /api/extract 必须登录
    clerk_require_auth: bool = False


settings = Settings()
