export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
}

export interface ChatCompletionRequest {
  model?: string
  messages: Array<{ role: ChatRole; content: string }>
  stream?: boolean
  temperature?: number
}

export interface ChatCompletionResponse {
  id: string
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface DeepSeekErrorBody {
  error?: {
    message?: string
    type?: string
    code?: string
  }
}
