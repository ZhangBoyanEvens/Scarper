import type { ExtractResponse } from '../types/extraction'
import { buildAuthHeaders } from './authToken'
import type { OutputDetail } from '../types/outputDetail'
import type { OutputLanguage } from '../types/outputLanguage'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export interface ExtractOptions {
  /** 左侧已保存的处理指令 */
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

  const res = await fetch(`${API_BASE}/api/extract`, {
    method: 'POST',
    headers: await buildAuthHeaders(),
    body: JSON.stringify(body),
    signal: options?.signal,
  })

  if (res.status === 401) {
    return {
      url,
      status: 'error',
      error: '请先登录后再抓取',
      error_code: 'unauthorized',
    }
  }

  if (res.status === 429) {
    let message = '请求过于频繁，请稍后再试'
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

  const data = (await res.json()) as ExtractResponse
  return data
}
