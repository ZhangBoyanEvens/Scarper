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
        ? ' (for local dev, ensure Vite proxies /api and Python backend runs on port 8000)'
        : ''
    throw new Error(
      `${e instanceof Error ? e.message : 'Network error'}${hint}`,
    )
  }
  if (!res.ok) {
    const hint =
      res.status === 404 && url.includes('/api/diagnostics')
        ? ' — for local dev, restart npm run dev (Vite proxy must include this path)'
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
    if (data.status !== 'ok') throw new Error('Unexpected response')
    return { ok: true, via: base || 'Vite proxy (local default)' }
  } catch (e) {
    return {
      ok: false,
      via: base || 'Vite proxy',
      error: e instanceof Error ? e.message : 'Connection failed',
    }
  }
}
