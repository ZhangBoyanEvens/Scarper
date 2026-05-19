/**
 * 生产环境可设 VITE_BACKEND_URL 直连 Render（需配 CORS_ORIGINS）。
 * 留空时：本地走 Vite proxy，Vercel 走 vercel.json 将 /api 转发到 Render。
 */
export const apiBase = (
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_BASE ||
  ''
).replace(/\/$/, '')
