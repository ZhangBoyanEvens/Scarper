import { DEEPSEEK_DEFAULTS, resolveDeepseekApiBase } from '../config/deepseek'
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  DeepSeekErrorBody,
} from '../types/deepseek'

function chatUrl(): string {
  const base = resolveDeepseekApiBase().replace(/\/$/, '')
  return `${base}${DEEPSEEK_DEFAULTS.chatPath}`
}

function wrapNetworkError(err: unknown): Error {
  if (err instanceof TypeError && err.message === 'Failed to fetch') {
    return new Error(
      'Cannot reach AI service (Failed to fetch). Ensure the backend is running (http://127.0.0.1:8000) and check network/API settings.',
    )
  }
  if (err instanceof Error) return err
  return new Error('AI request failed')
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as DeepSeekErrorBody
    return body.error?.message ?? res.statusText
  } catch {
    return res.statusText || `HTTP ${res.status}`
  }
}

/** 非流式对话（预留接口，可按需调用） */
export async function createChatCompletion(
  request: ChatCompletionRequest,
  signal?: AbortSignal,
): Promise<ChatCompletionResponse> {
  const model = request.model ?? DEEPSEEK_DEFAULTS.model
  let res: Response
  try {
    res = await fetch(chatUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, model, stream: false }),
      signal,
    })
  } catch (err) {
    throw wrapNetworkError(err)
  }

  if (!res.ok) {
    throw new Error(await parseError(res))
  }

  return (await res.json()) as ChatCompletionResponse
}

/** 流式对话，逐段回调 assistant 文本 */
export async function streamChatCompletion(
  request: ChatCompletionRequest,
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const model = request.model ?? DEEPSEEK_DEFAULTS.model
  let res: Response
  try {
    res = await fetch(chatUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, model, stream: true }),
      signal,
    })
  } catch (err) {
    throw wrapNetworkError(err)
  }

  if (!res.ok) {
    throw new Error(await parseError(res))
  }

  if (!res.body) {
    throw new Error('Empty response body; cannot read stream')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue

      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return

      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const text = json.choices?.[0]?.delta?.content
        if (text) onDelta(text)
      } catch {
        // 忽略不完整 JSON 行
      }
    }
  }
}
