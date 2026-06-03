import { loadAppSettings } from '../storage/settingsStorage'

/**
 * 生产环境可设 VITE_BACKEND_URL 直连 Render（需配 CORS_ORIGINS）。
 * 留空时：本地走 Vite proxy，Vercel 走 vercel.json 将 /api 转发到 Render。
 */
export const envApiBase = (
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_BASE ||
  ''
).replace(/\/$/, '')

/** 设置页可覆盖；留空则用 envApiBase */
export function resolveApiBase(): string {
  const custom = loadAppSettings().api.customBackendUrl.trim()
  if (custom) return custom.replace(/\/$/, '')
  return envApiBase
}

/** @deprecated 请用 resolveApiBase() */
export const apiBase = envApiBase
