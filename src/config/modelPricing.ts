/** USD per 1M tokens — align with backend app/ai/token_usage.py */
export const MODEL_PRICING_USD_PER_M: Record<
  string,
  { inputCacheHit: number; inputCacheMiss: number; output: number }
> = {
  'deepseek-chat': {
    inputCacheHit: 0.07,
    inputCacheMiss: 0.27,
    output: 1.1,
  },
  'deepseek-reasoner': {
    inputCacheHit: 0.14,
    inputCacheMiss: 0.55,
    output: 2.19,
  },
}

export const DEFAULT_MODEL =
  import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat'
