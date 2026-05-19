/** DeepSeek Chat Completions（OpenAI 兼容） */
export const DEEPSEEK_DEFAULTS = {
  /** 开发环境经 Vite 代理，生产需自建后端转发 */
  apiBase: import.meta.env.VITE_DEEPSEEK_API_BASE || '/api/deepseek',
  model: import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat',
  chatPath: '/chat/completions',
} as const

export const SYSTEM_PROMPT =
  '你是 Scarper 项目中的智能助手，请用简洁、准确的中文回答用户问题。'
