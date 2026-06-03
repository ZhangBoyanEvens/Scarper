import { resolveApiBase } from '../config/api'
import type { ExtractSuccess, ExtractTokenUsage } from '../types/extraction'
import { buildAuthHeaders } from './authToken'
import type { OutputDetail } from '../types/outputDetail'
import type { OutputLanguage } from '../types/outputLanguage'

export interface MergeSourceInput {
  url: string
  title: string
  summary: string
  key_points: string[]
  content: string
  detected_language: string
}

export interface MergeIntegrateOptions {
  sources: MergeSourceInput[]
  processingPrompt?: string | null
  outputLanguage?: OutputLanguage
  outputDetail?: OutputDetail
  signal?: AbortSignal
}

export async function mergeIntegrateSources(
  options: MergeIntegrateOptions,
): Promise<ExtractSuccess> {
  const body: Record<string, unknown> = {
    sources: options.sources,
    output_language: options.outputLanguage ?? 'zh',
    output_detail: options.outputDetail ?? 'concise',
  }
  const prompt = options.processingPrompt?.trim()
  if (prompt) body.processing_prompt = prompt

  const base = resolveApiBase()
  const endpoint = base ? `${base}/api/merge` : '/api/merge'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: await buildAuthHeaders(),
    body: JSON.stringify(body),
    signal: options.signal,
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = (await res.json()) as { detail?: string }
      if (typeof err.detail === 'string') detail = err.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }

  return (await res.json()) as ExtractSuccess
}

/** 合并各任务 token 用量与整合接口返回的用量 */
export function combineTokenUsage(
  perTask: ExtractTokenUsage[],
  merged?: ExtractTokenUsage | null,
): ExtractTokenUsage | undefined {
  const all = [...perTask, merged].filter(Boolean) as ExtractTokenUsage[]
  if (all.length === 0) return undefined

  const agg = all.reduce(
    (acc, u) => {
      acc.prompt_tokens += u.prompt_tokens
      acc.completion_tokens += u.completion_tokens
      acc.total_tokens += u.total_tokens || u.prompt_tokens + u.completion_tokens
      acc.prompt_cache_hit_tokens += u.prompt_cache_hit_tokens
      acc.prompt_cache_miss_tokens += u.prompt_cache_miss_tokens
      acc.estimated_cost_usd += u.estimated_cost_usd ?? 0
      if (!acc.model && u.model) acc.model = u.model
      return acc
    },
    {
      model: '',
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: 0,
      estimated_cost_usd: 0,
    },
  )

  return {
    model: agg.model || 'deepseek-chat',
    prompt_tokens: agg.prompt_tokens,
    completion_tokens: agg.completion_tokens,
    total_tokens: agg.total_tokens,
    prompt_cache_hit_tokens: agg.prompt_cache_hit_tokens,
    prompt_cache_miss_tokens: agg.prompt_cache_miss_tokens,
    page_cache_hit: false,
    estimated_cost_usd: agg.estimated_cost_usd,
  }
}
