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
    # 单次 /api/extract 全流程上限（抓取 + 解析 + AI），超时必返回错误结果
    extract_timeout_sec: float = 90.0
    # Playwright 单次抓取（含重试）上限 — content-first 分阶段预算
    playwright_total_timeout_sec: float = 35.0
    playwright_timeout_sec: float = 30.0
    # Content-first render stage budgets (seconds)
    playwright_dom_timeout_sec: float = 8.0
    playwright_selector_timeout_sec: float = 5.0
    playwright_extract_timeout_sec: float = 3.0
    playwright_optional_retry_sec: float = 5.0
    ai_summarize_timeout_sec: float = 55.0
    ai_diagnosis_timeout_sec: float = 12.0
    max_redirects: int = 5
    max_response_bytes: int = 5 * 1024 * 1024
    max_content_chars: int = 12_000
    max_llm_chars: int = 8_000
    crawl_retries: int = 2
    allow_localhost: bool = False
    # Render 等环境无法安装 Playwright 系统依赖时设为 false，仅用 httpx 抓取
    playwright_enabled: bool = True
    playwright_headless: bool = True
    playwright_data_dir: str = ".scarper"
    playwright_storage_state_path: str = ""
    playwright_persistent_context: bool = True
    playwright_context_pool_size: int = 2
    playwright_navigation_timeout_sec: float = 8.0
    playwright_content_wait_sec: float = 5.0
    playwright_stabilization_ms: int = 0
    playwright_network_idle_enabled: bool = False
    playwright_network_idle_timeout_ms: int = 0
    playwright_max_retries: int = 1
    playwright_pool_acquire_timeout_sec: float = 15.0
    playwright_retry_backoff_base_sec: float = 1.0
    playwright_scroll_steps: int = 0
    playwright_scroll_pause_ms: int = 0
    playwright_block_images: bool = True
    playwright_block_fonts: bool = True
    playwright_stealth_enabled: bool = True
    playwright_viewport_width: int = 1920
    playwright_viewport_height: int = 1080
    playwright_locale: str = "en-US"
    playwright_timezone: str = "America/New_York"

    # Cache (in-memory TTL seconds; 0 = disabled)
    cache_ttl_sec: int = 300

    cors_origins: str = "http://localhost:5174,http://127.0.0.1:5174,http://localhost:5173,http://127.0.0.1:5173"

    # Clerk（留空则关闭后端 JWT 校验）
    clerk_secret_key: str = ""
    clerk_jwt_issuer: str = ""
    # 设为 true 时 /api/extract 必须登录
    clerk_require_auth: bool = False
    # 每日抓取上限；0 或留空表示不限
    daily_extract_limit: int = 0

    # 规则解析失败时用 AI 从 HTML 恢复结构化正文
    ai_crawl_recovery_enabled: bool = True
    ai_recovery_html_chars: int = 16_000

    # 抓取失败时用 AI 诊断环节与原因（需 DEEPSEEK_API_KEY）
    ai_failure_diagnosis_enabled: bool = True

    # AI Web Intelligence router
    intelligence_max_playwright_domain_ratio: float = 0.25
    probe_max_bytes: int = 20_480
    probe_timeout_sec: float = 14.0
    probe_max_retries: int = 2
    probe_domain_concurrency: int = 2
    probe_head_telemetry_enabled: bool = False
    confidence_playwright_threshold: float = 0.30

    # Neon Postgres（每用户独立 schema；未配置时前端走 localStorage）
    neon_enabled: bool = False
    neon_database_url: str = ""
    # 每 Clerk 用户 Neon 数据总配额（MB），含各项目 scrape_upload_batches
    neon_user_quota_mb: int = 200
    # Neon 上传/列表须登录；Clerk 未配置时用此开发用户 id
    neon_require_auth: bool = True
    neon_dev_user_id: str = "local-dev"


settings = Settings()
