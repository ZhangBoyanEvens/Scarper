import { resolveApiBase } from '../config/api'
import type { VetraEmailTemplate } from '../components/vetra/vetraEmailTemplate'
import { buildAuthHeaders } from './authToken'

const FETCH_TIMEOUT_MS = 20_000

export interface VetraTemplateRecord {
  id: string
  name: string
  subject: string
  body: string
  created_at: string
  updated_at: string
}

export interface VetraTemplatePayload {
  subject: string
  body: string
}

interface VetraTemplateListApiResponse {
  items: VetraTemplateRecord[]
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

export function recordToEmailTemplate(
  record: Pick<VetraTemplateRecord, 'subject' | 'body'>,
): VetraEmailTemplate {
  return { subject: record.subject, body: record.body }
}

export function recordToTemplatePayload(
  record: VetraTemplateRecord,
): VetraTemplatePayload {
  return { subject: record.subject, body: record.body }
}

export async function fetchVetraTemplates(): Promise<VetraTemplateRecord[]> {
  const res = await vetraFetch('/api/neon/vetra/templates')

  if (res.status === 401) {
    const err = new Error('Sign in to load templates')
    err.name = 'NeonAuthError'
    throw err
  }
  if (res.status === 503) {
    const err = new Error('Neon is not configured')
    err.name = 'NeonNotConfiguredError'
    throw err
  }
  if (res.status === 404) {
    throw new Error('Template API unavailable — restart the backend server')
  }
  if (!res.ok) {
    throw new Error(await parseError(res))
  }

  const data = (await res.json()) as VetraTemplateListApiResponse
  return data.items
}

export async function saveVetraTemplate(input: {
  id?: string
  name: string
  subject: string
  body: string
}): Promise<VetraTemplateRecord> {
  const res = await vetraFetch('/api/neon/vetra/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: input.id,
      name: input.name,
      subject: input.subject,
      body: input.body,
    }),
  })

  if (res.status === 401) {
    const err = new Error('Sign in to save templates')
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
  if (res.status === 404) {
    throw new Error('Template API unavailable — restart the backend server')
  }
  if (!res.ok) {
    throw new Error(await parseError(res))
  }

  return (await res.json()) as VetraTemplateRecord
}

export async function deleteVetraTemplate(templateId: string): Promise<void> {
  const res = await vetraFetch(
    `/api/neon/vetra/templates/${encodeURIComponent(templateId)}`,
    { method: 'DELETE' },
  )

  if (res.status === 401) {
    const err = new Error('Sign in to delete templates')
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
