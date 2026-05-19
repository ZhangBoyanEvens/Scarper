export interface ExtractSuccess {
  url: string
  title: string
  summary: string
  key_points: string[]
  content: string
  detected_language: string
  status: 'success'
}

export interface ExtractError {
  url: string
  status: 'error'
  error: string
  error_code?: string
}

export type ExtractResponse = ExtractSuccess | ExtractError

export function isExtractSuccess(
  r: ExtractResponse,
): r is ExtractSuccess {
  return r.status === 'success'
}
