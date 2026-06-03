import type { FindocTemplate } from '../types/findocTemplate'

import { buildAuthHeaders } from './authToken'

import { isNeonUploadPreferred } from './neonProjectApi'

import { resolveApiBase } from '../config/api'



const FETCH_TIMEOUT_MS = 20_000



interface FindocTemplateApiItem {

  id: string

  name: string

  content: string

  created_at: string

  updated_at: string

}



interface FindocTemplateListApiResponse {

  items: FindocTemplateApiItem[]

  storage: 'neon' | 'local'

}



function apiUrl(path: string): string {

  const base = resolveApiBase()

  return base ? `${base}${path}` : path

}



async function findocFetch(

  path: string,

  init: RequestInit = {},

): Promise<Response> {

  const ctrl = new AbortController()

  const timer = window.setTimeout(() => {

    ctrl.abort(

      new DOMException('Template database request timed out — try again later', 'TimeoutError'),

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



function apiItemToTemplate(item: FindocTemplateApiItem): FindocTemplate {

  return {

    id: item.id,

    name: item.name,

    content: item.content,

    source: 'custom',

  }

}



async function parseError(res: Response): Promise<string> {

  if (res.status === 404) {

    return 'Template API not found (404). Restart the backend: run python run_dev.py in the backend folder'

  }

  try {

    const body = (await res.json()) as {

      detail?: string | { message?: string }

    }

    const detail = body.detail

    if (typeof detail === 'string') return detail

    if (detail && typeof detail.message === 'string') return detail.message

  } catch {

    /* ignore */

  }

  return `Request failed (${res.status})`

}



export async function fetchNeonFindocTemplates(): Promise<FindocTemplate[]> {

  const res = await findocFetch('/api/neon/findoc/templates')

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

  if (!res.ok) {

    throw new Error(await parseError(res))

  }

  const data = (await res.json()) as FindocTemplateListApiResponse

  return data.items.map(apiItemToTemplate)

}



export async function saveNeonFindocTemplate(input: {

  id?: string

  name: string

  content: string

}): Promise<FindocTemplate> {

  const res = await findocFetch('/api/neon/findoc/templates', {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({

      id: input.id,

      name: input.name,

      content: input.content,

    }),

  })

  if (res.status === 401) {

    const err = new Error('Sign in to save templates')

    err.name = 'NeonAuthError'

    throw err

  }

  if (res.status === 413) {

    throw new Error('Storage quota full — cannot save template')

  }

  if (res.status === 503) {

    const err = new Error('Neon is not configured')

    err.name = 'NeonNotConfiguredError'

    throw err

  }

  if (!res.ok) {

    throw new Error(await parseError(res))

  }

  const data = (await res.json()) as FindocTemplateApiItem

  return apiItemToTemplate(data)

}



export async function deleteNeonFindocTemplate(id: string): Promise<void> {

  const res = await findocFetch(`/api/neon/findoc/templates/${encodeURIComponent(id)}`, {

    method: 'DELETE',

  })

  if (res.status === 401) {

    const err = new Error('Sign in to delete templates')

    err.name = 'NeonAuthError'

    throw err

  }

  if (res.status === 404) return

  if (res.status === 503) {

    const err = new Error('Neon is not configured')

    err.name = 'NeonNotConfiguredError'

    throw err

  }

  if (!res.ok) {

    throw new Error(await parseError(res))

  }

}



export function isFindocTemplateDbPreferred(): boolean {

  return isNeonUploadPreferred()

}


