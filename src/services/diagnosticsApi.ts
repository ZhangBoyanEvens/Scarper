import { resolveApiBase } from '../config/api'
import type { DiagnosticsResponse } from '../types/diagnostics'
import { buildAuthHeaders } from './authToken'

function diagnosticsUrl(): string {
  const base = resolveApiBase()
  return base ? `${base}/api/diagnostics` : '/api/diagnostics'
}

export async function fetchDiagnostics(): Promise<DiagnosticsResponse> {
  const url = diagnosticsUrl()
  let res: Response
  try {
    res = await fetch(url, {
      headers: await buildAuthHeaders(),
    })
  } catch (e) {
    const hint =
      url.startsWith('/') && !resolveApiBase()
        ? '（本地开发请确认 Vite 已代理 /api 且 Python 后端在 8000 端口运行）'
        : ''
    throw new Error(
      `${e instanceof Error ? e.message : '网络错误'}${hint}`,
    )
  }
  if (!res.ok) {
    const hint =
      res.status === 404 && url.includes('/api/diagnostics')
        ? ' — 若为本地开发，请重启 npm run dev（Vite 代理需包含该路径）'
        : ''
    throw new Error(`HTTP ${res.status}${hint}`)
  }
  return (await res.json()) as DiagnosticsResponse
}

export async function pingBackendHealth(): Promise<{
  ok: boolean
  via: string
  error?: string
}> {
  const base = resolveApiBase()
  const url = base ? `${base}/api/health` : '/api/health'
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { status?: string }
    if (data.status !== 'ok') throw new Error('响应异常')
    return { ok: true, via: base || 'Vite 代理（本地默认）' }
  } catch (e) {
    return {
      ok: false,
      via: base || 'Vite 代理',
      error: e instanceof Error ? e.message : '连接失败',
    }
  }
}
