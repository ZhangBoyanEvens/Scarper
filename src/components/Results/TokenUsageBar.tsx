import { useCallback } from 'react'

import { useAppSettings } from '../../contexts/AppSettingsContext'

import { COST_CURRENCIES } from '../../config/currency'

import { DEFAULT_MODEL } from '../../config/modelPricing'

import type { AggregatedTokenUsage } from '../../utils/tokenUsage'

import { formatCost, formatTokenCount } from '../../utils/tokenUsage'

import './TokenUsageBar.css'



interface TokenUsageBarProps {

  usage: AggregatedTokenUsage

}



function pageCacheLabel(usage: AggregatedTokenUsage): string {

  if (usage.page_cache_hit) return 'Hit'

  if (usage.page_cache_partial) return 'Partial'

  return 'Miss'

}



function promptCacheLabel(usage: AggregatedTokenUsage): string {

  if (usage.page_cache_hit) return '—'

  if (usage.prompt_cache_hit_tokens > 0 && usage.prompt_cache_miss_tokens > 0) {

    return 'Partial'

  }

  if (usage.prompt_cache_hit_tokens > 0) return 'Hit'

  return 'Miss'

}



export function TokenUsageBar({ usage }: TokenUsageBarProps) {

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

    <div className="token-usage-bar" role="status" aria-label="Token usage this run">

      <div className="token-usage-bar__item">

        <span className="token-usage-bar__label">Model</span>

        <span className="token-usage-bar__value">{model}</span>

      </div>

      <div className="token-usage-bar__item">

        <span className="token-usage-bar__label">Input</span>

        <span className="token-usage-bar__value">

          {formatTokenCount(usage.prompt_tokens)}

        </span>

      </div>

      <div className="token-usage-bar__item">

        <span className="token-usage-bar__label">Output</span>

        <span className="token-usage-bar__value">

          {formatTokenCount(usage.completion_tokens)}

        </span>

      </div>

      <div className="token-usage-bar__item">

        <span className="token-usage-bar__label">Total</span>

        <span className="token-usage-bar__value">

          {formatTokenCount(usage.total_tokens)}

        </span>

      </div>

      <div className="token-usage-bar__item">

        <span className="token-usage-bar__label">Page cache</span>

        <span

          className={`token-usage-bar__value token-usage-bar__cache ${

            usage.page_cache_hit

              ? 'token-usage-bar__cache--hit'

              : usage.page_cache_partial

                ? 'token-usage-bar__cache--partial'

                : ''

          }`}

        >

          {pageCacheLabel(usage)}

        </span>

      </div>

      <div className="token-usage-bar__item">

        <span className="token-usage-bar__label">Prompt cache</span>

        <span

          className={`token-usage-bar__value token-usage-bar__cache ${

            usage.prompt_cache_hit_tokens > 0 && !usage.page_cache_hit

              ? 'token-usage-bar__cache--hit'

              : ''

          }`}

        >

          {promptCacheLabel(usage)}

          {usage.prompt_cache_hit_tokens > 0 && !usage.page_cache_hit && (

            <span className="token-usage-bar__sub">

              {formatTokenCount(usage.prompt_cache_hit_tokens)} hit

            </span>

          )}

        </span>

      </div>

      <div className="token-usage-bar__item token-usage-bar__item--cost">

        <span className="token-usage-bar__label">Cost</span>

        <div className="token-usage-bar__cost-row">

          <span className="token-usage-bar__value token-usage-bar__cost">

            {formatCost(usage.estimated_cost_usd, currency)}

          </span>

          <select

            className="token-usage-bar__currency"

            value={currency}

            aria-label="Cost display currency"

            onChange={(e) =>

              onCurrencyChange(e.target.value as typeof settings.costCurrency)

            }

          >

            {COST_CURRENCIES.map((c) => (

              <option key={c.code} value={c.code}>

                {c.label}

              </option>

            ))}

          </select>

        </div>

      </div>

      {usage.task_count > 1 && (

        <div className="token-usage-bar__item token-usage-bar__item--tasks">

          <span className="token-usage-bar__label">Tasks</span>

          <span className="token-usage-bar__value">{usage.task_count}</span>

        </div>

      )}

    </div>

  )

}


