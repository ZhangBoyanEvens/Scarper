"""Anti-detection: init scripts and realistic browser fingerprint."""

from playwright.async_api import BrowserContext

from app.config import settings

# Realistic desktop Chrome on Windows
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

STEALTH_INIT_SCRIPT = """
(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'zh-CN', 'zh'] });
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });
  window.chrome = window.chrome || { runtime: {} };
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);
})();
"""


def context_options(*, storage_state: str | None = None) -> dict:
    opts: dict = {
        "user_agent": DEFAULT_USER_AGENT,
        "viewport": {
            "width": settings.playwright_viewport_width,
            "height": settings.playwright_viewport_height,
        },
        "locale": settings.playwright_locale,
        "timezone_id": settings.playwright_timezone,
        "color_scheme": "light",
        "device_scale_factor": 1,
        "has_touch": False,
        "is_mobile": False,
        "java_script_enabled": True,
        "ignore_https_errors": False,
        "extra_http_headers": {
            "Accept-Language": "en-US,en;q=0.9,zh-CN,zh;q=0.8",
            "Accept": (
                "text/html,application/xhtml+xml,application/xml;q=0.9,"
                "image/avif,image/webp,*/*;q=0.8"
            ),
            "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Upgrade-Insecure-Requests": "1",
        },
    }
    if storage_state:
        opts["storage_state"] = storage_state
    return opts


async def apply_stealth(context: BrowserContext) -> None:
    if not settings.playwright_stealth_enabled:
        return
    await context.add_init_script(STEALTH_INIT_SCRIPT)
