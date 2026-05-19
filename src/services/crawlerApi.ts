import { apiBase } from '../config/api'
import type { ExtractResponse } from '../types/extraction'
import { buildAuthHeaders } from './authToken'
import type { OutputDetail } from '../types/outputDetail'
import type { OutputLanguage } from '../types/outputLanguage'

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

  const endpoint = apiBase ? `${apiBase}/api/extract` : '/api/extract'

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
        '无法连接后端（Failed to fetch）。请确认 Render 已启动，且 Vercel 已 Redeploy；或在 Vercel 设置 VITE_BACKEND_URL，并在 Render 设置 CORS_ORIGINS 为前端地址。',
      error_code: 'network_error',
    }
  }

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

  const raw = await res.text()
  if (!raw.trim()) {
    const hint = `后端返回为空（HTTP ${res.status}），请检查 Render 日志`
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
      error: `后端响应不是有效 JSON（HTTP ${res.status}）`,
      error_code: 'invalid_json',
    }
  }
}
