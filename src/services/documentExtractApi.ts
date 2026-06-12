import { resolveApiBase } from '../config/api'
import { resolveAuthToken } from './authToken'

export interface DocumentExtractResult {
  text: string
  filename: string
  method: string
  char_count: number
}

export class DocumentExtractError extends Error {
  code: string

  constructor(message: string, code = 'extract_failed') {
    super(message)
    this.name = 'DocumentExtractError'
    this.code = code
  }
}

export async function extractDocumentFile(
  file: File,
  signal?: AbortSignal,
): Promise<DocumentExtractResult> {
  const base = resolveApiBase()
  const endpoint = base ? `${base}/api/documents/extract` : '/api/documents/extract'

  const form = new FormData()
  form.append('file', file, file.name)

  const headers: Record<string, string> = {}
  const token = await resolveAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: form,
      signal,
    })
  } catch {
    throw new DocumentExtractError(
      'Cannot reach backend — ensure the service is running',
      'network_error',
    )
  }

  if (!res.ok) {
    let message = `Parse failed (${res.status})`
    try {
      const body = (await res.json()) as { detail?: string }
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      /* ignore */
    }
    throw new DocumentExtractError(message, 'http_error')
  }

  return (await res.json()) as DocumentExtractResult
}
