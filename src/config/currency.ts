/** Display currencies — amounts stored/computed in USD, converted for display. */

export type CostCurrencyCode =
  | 'USD'
  | 'CNY'
  | 'EUR'
  | 'GBP'
  | 'HKD'
  | 'TWD'
  | 'JPY'

export interface CostCurrencyOption {
  code: CostCurrencyCode
  label: string
  symbol: string
  /** 1 USD = rateFromUsd × local (e.g. CNY 7.25 means $1 ≈ ¥7.25) */
  rateFromUsd: number
  /** Fraction digits for display */
  decimals: number
}

/** Approximate rates for UI estimates — not live FX. */
export const COST_CURRENCIES: readonly CostCurrencyOption[] = [
  { code: 'USD', label: 'US Dollar USD', symbol: '$', rateFromUsd: 1, decimals: 4 },
  { code: 'CNY', label: 'Chinese Yuan CNY', symbol: '¥', rateFromUsd: 7.25, decimals: 4 },
  { code: 'EUR', label: 'Euro EUR', symbol: '€', rateFromUsd: 0.92, decimals: 4 },
  { code: 'GBP', label: 'British Pound GBP', symbol: '£', rateFromUsd: 0.79, decimals: 4 },
  { code: 'HKD', label: 'Hong Kong Dollar HKD', symbol: 'HK$', rateFromUsd: 7.8, decimals: 4 },
  { code: 'TWD', label: 'New Taiwan Dollar TWD', symbol: 'NT$', rateFromUsd: 32.5, decimals: 2 },
  { code: 'JPY', label: 'Japanese Yen JPY', symbol: '¥', rateFromUsd: 150, decimals: 2 },
] as const

export const DEFAULT_COST_CURRENCY: CostCurrencyCode = 'CNY'

const BY_CODE = new Map(
  COST_CURRENCIES.map((c) => [c.code, c] as const),
)

export function getCostCurrency(code: CostCurrencyCode): CostCurrencyOption {
  return BY_CODE.get(code) ?? BY_CODE.get('USD')!
}

export function convertUsdToCurrency(
  amountUsd: number,
  code: CostCurrencyCode,
): number {
  return amountUsd * getCostCurrency(code).rateFromUsd
}

const STORAGE_KEY = 'scarper.costCurrency.v1'

export function isCostCurrencyCode(v: unknown): v is CostCurrencyCode {
  return typeof v === 'string' && BY_CODE.has(v as CostCurrencyCode)
}

export function loadCostCurrency(): CostCurrencyCode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (isCostCurrencyCode(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_COST_CURRENCY
}

export function saveCostCurrency(code: CostCurrencyCode): void {
  localStorage.setItem(STORAGE_KEY, code)
}
