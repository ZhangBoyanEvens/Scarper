import { Select } from 'antd'
import { useCallback } from 'react'

import { useAppSettings } from '../../contexts/AppSettingsContext'
import { useI18n } from '../../contexts/I18nContext'

import { COST_CURRENCIES } from '../../config/currency'

import { DEFAULT_MODEL } from '../../config/modelPricing'

import type { AggregatedTokenUsage } from '../../utils/tokenUsage'

import { formatCost, formatTokenCount } from '../../utils/tokenUsage'

import { scarperSelectProps } from '../common/scarperForm'

import './TokenUsageBar.css'

interface TokenUsageBarProps {
  usage: AggregatedTokenUsage
}

type TranslateFn = (path: string, params?: Record<string, string | number>) => string

function pageCacheLabel(usage: AggregatedTokenUsage, t: TranslateFn): string {
  if (usage.page_cache_hit) return t('scrape.token.hit')
  if (usage.page_cache_partial) return t('scrape.token.partial')
  return t('scrape.token.miss')
}

function promptCacheLabel(usage: AggregatedTokenUsage, t: TranslateFn): string {
  if (usage.page_cache_hit) return '—'
  if (usage.prompt_cache_hit_tokens > 0 && usage.prompt_cache_miss_tokens > 0) {
    return t('scrape.token.partial')
  }
  if (usage.prompt_cache_hit_tokens > 0) return t('scrape.token.hit')
  return t('scrape.token.miss')
}

export function TokenUsageBar({ usage }: TokenUsageBarProps) {
  const { t } = useI18n()
  const { settings, setCostCurrency } = useAppSettings()
  const currency = settings.costCurrency
  const model = usage.model || DEFAULT_MODEL

  const onCurrencyChange = useCallback(
    (code: typeof settings.costCurrency) => {
      setCostCurrency(code)
    },
    [setCostCurrency],
  )

  return (
    <div className="token-usage-bar" role="status" aria-label={t('scrape.token.aria')}>
      <div className="token-usage-bar__item">
        <span className="token-usage-bar__label">{t('scrape.token.model')}</span>
        <span className="token-usage-bar__value">{model}</span>
      </div>
      <div className="token-usage-bar__item">
        <span className="token-usage-bar__label">{t('scrape.token.input')}</span>
        <span className="token-usage-bar__value">
          {formatTokenCount(usage.prompt_tokens)}
        </span>
      </div>
      <div className="token-usage-bar__item">
        <span className="token-usage-bar__label">{t('scrape.token.output')}</span>
        <span className="token-usage-bar__value">
          {formatTokenCount(usage.completion_tokens)}
        </span>
      </div>
      <div className="token-usage-bar__item">
        <span className="token-usage-bar__label">{t('scrape.token.total')}</span>
        <span className="token-usage-bar__value">
          {formatTokenCount(usage.total_tokens)}
        </span>
      </div>
      <div className="token-usage-bar__item">
        <span className="token-usage-bar__label">{t('scrape.token.pageCache')}</span>
        <span
          className={`token-usage-bar__value token-usage-bar__cache ${
            usage.page_cache_hit
              ? 'token-usage-bar__cache--hit'
              : usage.page_cache_partial
                ? 'token-usage-bar__cache--partial'
                : ''
          }`}
        >
          {pageCacheLabel(usage, t)}
        </span>
      </div>
      <div className="token-usage-bar__item">
        <span className="token-usage-bar__label">{t('scrape.token.promptCache')}</span>
        <span
          className={`token-usage-bar__value token-usage-bar__cache ${
            usage.prompt_cache_hit_tokens > 0 && !usage.page_cache_hit
              ? 'token-usage-bar__cache--hit'
              : ''
          }`}
        >
          {promptCacheLabel(usage, t)}
          {usage.prompt_cache_hit_tokens > 0 && !usage.page_cache_hit && (
            <span className="token-usage-bar__sub">
              {formatTokenCount(usage.prompt_cache_hit_tokens)} {t('scrape.token.hit').toLowerCase()}
            </span>
          )}
        </span>
      </div>
      <div className="token-usage-bar__item token-usage-bar__item--cost">
        <span className="token-usage-bar__label">{t('scrape.token.cost')}</span>
        <div className="token-usage-bar__cost-row">
          <span className="token-usage-bar__value token-usage-bar__cost">
            {formatCost(usage.estimated_cost_usd, currency)}
          </span>
          <Select
            className="token-usage-bar__currency"
            aria-label={t('scrape.token.currencyAria')}
            value={currency}
            {...scarperSelectProps({ minWidth: 88, maxWidth: 120 })}
            options={COST_CURRENCIES.map((c) => ({
              value: c.code,
              label: c.label,
            }))}
            onChange={onCurrencyChange}
          />
        </div>
      </div>
      {usage.task_count > 1 && (
        <div className="token-usage-bar__item token-usage-bar__item--tasks">
          <span className="token-usage-bar__label">{t('scrape.token.tasks')}</span>
          <span className="token-usage-bar__value">{usage.task_count}</span>
        </div>
      )}
    </div>
  )
}
