import { resolveApiBase } from '../config/api'
import { buildAuthHeaders } from './authToken'

const FETCH_TIMEOUT_MS = 20_000

export interface VetraCompanyRecord {
  id: string
  name: string
  introduction: string
  created_at: string
  updated_at: string
}

export interface VetraCompanyPayload {
  introduction: string
}

interface VetraCompanyListApiResponse {
  items: VetraCompanyRecord[]
  storage: 'neon' | 'local'
}

function apiUrl(path: string): string {
  const base = resolveApiBase()
  return base ? `${base}${path}` : path
}

async function vetraFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => {
    ctrl.abort(
      new DOMException('Vetra database request timed out — try again later', 'TimeoutError'),
    )
  }, FETCH_TIMEOUT_MS)

  try {
    const headers = await buildAuthHeaders(init.headers)
    return await fetch(apiUrl(path), {
      ...init,
      headers,
      signal: ctrl.signal,
    })
  } finally {
    window.clearTimeout(timer)
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string | { message?: string } }
    const detail = body.detail
    if (typeof detail === 'string') return detail
    if (detail && typeof detail.message === 'string') return detail.message
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`
}

export function recordToCompanyPayload(
  record: VetraCompanyRecord,
): VetraCompanyPayload {
  return { introduction: record.introduction }
}

export async function fetchVetraCompanies(): Promise<VetraCompanyRecord[]> {
  const res = await vetraFetch('/api/neon/vetra/companies')

  if (res.status === 401) {
    const err = new Error('Sign in to load companies')
    err.name = 'NeonAuthError'
    throw err
  }
  if (res.status === 503) {
    const err = new Error('Neon is not configured')
    err.name = 'NeonNotConfiguredError'
    throw err
  }
  if (!res.ok) {
    throw new Error(await parseError(res))
  }

  const data = (await res.json()) as VetraCompanyListApiResponse
  return data.items
}

export async function saveVetraCompany(input: {
  id?: string
  name: string
  introduction: string
}): Promise<VetraCompanyRecord> {
  const res = await vetraFetch('/api/neon/vetra/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: input.id,
      name: input.name,
      introduction: input.introduction,
    }),
  })

  if (res.status === 401) {
    const err = new Error('Sign in to save companies')
    err.name = 'NeonAuthError'
    throw err
  }
  if (res.status === 503) {
    const err = new Error('Neon is not configured')
    err.name = 'NeonNotConfiguredError'
    throw err
  }
  if (res.status === 413) {
    throw new Error('Storage quota exceeded')
  }
  if (!res.ok) {
    throw new Error(await parseError(res))
  }

  return (await res.json()) as VetraCompanyRecord
}

export async function deleteVetraCompany(companyId: string): Promise<void> {
  const res = await vetraFetch(`/api/neon/vetra/companies/${encodeURIComponent(companyId)}`, {
    method: 'DELETE',
  })

  if (res.status === 401) {
    const err = new Error('Sign in to delete companies')
    err.name = 'NeonAuthError'
    throw err
  }
  if (res.status === 503) {
    const err = new Error('Neon is not configured')
    err.name = 'NeonNotConfiguredError'
    throw err
  }
  if (!res.ok) {
    throw new Error(await parseError(res))
  }
}
