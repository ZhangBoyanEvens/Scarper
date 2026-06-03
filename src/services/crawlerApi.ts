import { resolveApiBase } from '../config/api'
import type { ExtractResponse } from '../types/extraction'
import { buildAuthHeaders } from './authToken'
import type { OutputDetail } from '../types/outputDetail'
import type { OutputLanguage } from '../types/outputLanguage'

export interface ExtractOptions {
  /** Saved processing prompt from the toolbar */
  processingPrompt?: string | null
  outputLanguage?: OutputLanguage
  outputDetail?: OutputDetail
  signal?: AbortSignal
}

export async function extractUrl(
  url: string,
  options?: ExtractOptions,
): Promise<ExtractResponse> {
  const body: {
    url: string
    processing_prompt?: string
    output_language: OutputLanguage
    output_detail: OutputDetail
  } = {
    url,
    output_language: options?.outputLanguage ?? 'zh',
    output_detail: options?.outputDetail ?? 'concise',
  }
  const prompt = options?.processingPrompt?.trim()
  if (prompt) {
    body.processing_prompt = prompt
  }

  const base = resolveApiBase()
  const endpoint = base ? `${base}/api/extract` : '/api/extract'

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: await buildAuthHeaders(),
      body: JSON.stringify(body),
      signal: options?.signal,
    })
  } catch {
    return {
      url,
      status: 'error',
      error:
        'Cannot reach backend (Failed to fetch). Confirm the server is running and CORS is configured, or set VITE_BACKEND_URL.',
      error_code: 'network_error',
    }
  }

  if (res.status === 401) {
    return {
      url,
      status: 'error',
      error: 'Sign in before scraping',
      error_code: 'unauthorized',
    }
  }

  if (res.status === 429) {
    let message = 'Too many requests — try again later'
    try {
      const body = (await res.json()) as { detail?: string }
      if (typeof body.detail === 'string') {
        message = body.detail
      }
    } catch {
      /* ignore */
    }
    return {
      url,
      status: 'error',
      error: message,
      error_code: 'rate_limited',
    }
  }

  const raw = await res.text()
  if (!raw.trim()) {
    const hint = `Empty backend response (HTTP ${res.status}) — check server logs`
    return {
      url,
      status: 'error',
      error: hint,
      error_code: 'empty_response',
    }
  }

  try {
    return JSON.parse(raw) as ExtractResponse
  } catch {
    return {
      url,
      status: 'error',
      error: `Backend response is not valid JSON (HTTP ${res.status})`,
      error_code: 'invalid_json',
    }
  }
}
