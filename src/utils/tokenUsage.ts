import {
  convertUsdToCurrency,
  getCostCurrency,
  type CostCurrencyCode,
} from '../config/currency'
import { DEFAULT_MODEL, MODEL_PRICING_USD_PER_M } from '../config/modelPricing'
import type { ExtractResponse, ExtractTokenUsage } from '../types/extraction'
import { isExtractSuccess } from '../types/extraction'

export function estimateCostUsd(usage: ExtractTokenUsage): number {
  if (usage.page_cache_hit) return 0
  if (usage.estimated_cost_usd != null && usage.estimated_cost_usd > 0) {
    return usage.estimated_cost_usd
  }
  const model = usage.model || DEFAULT_MODEL
  const rates =
    MODEL_PRICING_USD_PER_M[model] ?? MODEL_PRICING_USD_PER_M['deepseek-chat']
  const hit = usage.prompt_cache_hit_tokens
  let miss = usage.prompt_cache_miss_tokens
  if (usage.prompt_tokens && hit === 0 && miss === 0) {
    miss = usage.prompt_tokens
  }
  return (
    (hit * rates.inputCacheHit +
      miss * rates.inputCacheMiss +
      usage.completion_tokens * rates.output) /
    1_000_000
  )
}

export interface AggregatedTokenUsage {
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_cache_hit_tokens: number
  prompt_cache_miss_tokens: number
  page_cache_hit: boolean
  page_cache_partial: boolean
  prompt_cache_hit: boolean
  estimated_cost_usd: number
  task_count: number
}

export function aggregateTokenUsage(
  results: ExtractResponse[],
): AggregatedTokenUsage | null {
  const successes = results.filter(isExtractSuccess)
  const withUsage = successes.filter((r) => r.token_usage)
  if (withUsage.length === 0) return null

  const agg = withUsage.reduce(
    (acc, r) => {
      const u = r.token_usage!
      acc.prompt_tokens += u.prompt_tokens
      acc.completion_tokens += u.completion_tokens
      acc.total_tokens += u.total_tokens || u.prompt_tokens + u.completion_tokens
      acc.prompt_cache_hit_tokens += u.prompt_cache_hit_tokens
      acc.prompt_cache_miss_tokens += u.prompt_cache_miss_tokens
      if (u.page_cache_hit) acc.page_cache_hits += 1
      if (u.prompt_cache_hit_tokens > 0) acc.prompt_cache_api_hits += 1
      acc.estimated_cost_usd += estimateCostUsd(u)
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
      page_cache_hits: 0,
      prompt_cache_api_hits: 0,
      estimated_cost_usd: 0,
    },
  )

  const n = withUsage.length
  return {
    model: agg.model || DEFAULT_MODEL,
    prompt_tokens: agg.prompt_tokens,
    completion_tokens: agg.completion_tokens,
    total_tokens: agg.total_tokens,
    prompt_cache_hit_tokens: agg.prompt_cache_hit_tokens,
    prompt_cache_miss_tokens: agg.prompt_cache_miss_tokens,
    page_cache_hit: n > 0 && agg.page_cache_hits === n,
    page_cache_partial: agg.page_cache_hits > 0 && agg.page_cache_hits < n,
    prompt_cache_hit: agg.prompt_cache_api_hits > 0,
    estimated_cost_usd: agg.estimated_cost_usd,
    task_count: n,
  }
}

export function formatCost(amountUsd: number, currency: CostCurrencyCode): string {
  const c = getCostCurrency(currency)
  const local = convertUsdToCurrency(amountUsd, currency)
  const sym = c.symbol

  if (local === 0) {
    return formatLocalAmount(0, c.decimals, sym, currency)
  }

  if (amountUsd > 0 && amountUsd < 0.0001) {
    const minLocal = convertUsdToCurrency(0.0001, currency)
    return `<${formatLocalAmount(minLocal, c.decimals, sym, currency)}`
  }

  return formatLocalAmount(local, c.decimals, sym, currency)
}

function formatLocalAmount(
  amount: number,
  decimals: number,
  symbol: string,
  currency: CostCurrencyCode,
  withSymbol = true,
): string {
  const prefix = withSymbol ? symbol : ''
  if (currency === 'JPY' || currency === 'TWD') {
    if (amount === 0) return `${prefix}0`
    if (amount < 1) return `${prefix}${amount.toFixed(decimals)}`
    return `${prefix}${Math.round(amount).toLocaleString('zh-CN')}`
  }
  if (amount === 0) return `${prefix}0.00`
  if (amount < 0.01) return `${prefix}${amount.toFixed(decimals)}`
  return `${prefix}${amount.toFixed(Math.min(4, decimals))}`
}

/** @deprecated use formatCost */
export function formatUsd(amount: number): string {
  return formatCost(amount, 'USD')
}

export function formatTokenCount(n: number): string {
  return n.toLocaleString('zh-CN')
}
