export interface ExtractTokenUsage {
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_cache_hit_tokens: number
  prompt_cache_miss_tokens: number
  page_cache_hit: boolean
  estimated_cost_usd: number
}

export interface ExtractSuccess {
  url: string
  title: string
  summary: string
  key_points: string[]
  content: string
  detected_language: string
  status: 'success'
  token_usage?: ExtractTokenUsage | null
}

export type PipelineStage =
  | 'validate'
  | 'fetch'
  | 'parse'
  | 'summarize'
  | 'config'
  | 'unknown'

export interface ExtractError {
  url: string
  status: 'error'
  error: string
  error_code?: string
  stage?: PipelineStage | string
  stage_label?: string
  diagnosis?: string
  root_cause?: string
  suggested_action?: string
  recovery_attempted?: boolean
  recovery_note?: string
}

export type ExtractResponse = ExtractSuccess | ExtractError

export function isExtractSuccess(
  r: ExtractResponse,
): r is ExtractSuccess {
  return r.status === 'success'
}
