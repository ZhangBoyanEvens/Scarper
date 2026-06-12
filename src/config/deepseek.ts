import { resolveApiBase } from './api'

/** DeepSeek Chat Completions（OpenAI 兼容） */
export const DEEPSEEK_DEFAULTS = {
  model: import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat',
  chatPath: '/chat/completions',
} as const

/** 与 Neon 等 API 一致：有 VITE_BACKEND_URL 时走后端代理，否则走同源 /api/deepseek */
export function resolveDeepseekApiBase(): string {
  const backend = resolveApiBase().replace(/\/$/, '')
  if (backend) return `${backend}/api/deepseek`
  return (
    import.meta.env.VITE_DEEPSEEK_API_BASE || '/api/deepseek'
  ).replace(/\/$/, '')
}
export const SYSTEM_PROMPT =
  '你是 Scarper 项目中的智能助手，请用简洁、准确的中文回答用户问题。'
