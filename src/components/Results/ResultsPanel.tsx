import { useI18n } from '../../contexts/I18nContext'
import type { ExtractResponse } from '../../types/extraction'
import { aggregateTokenUsage } from '../../utils/tokenUsage'
import { GlowPanel } from '../Layout/GlowPanel'
import { EditableResultCard } from './EditableResultCard'
import { TaskProgressBar } from './TaskProgressBar'
import { TokenUsageBar } from './TokenUsageBar'
import './ResultsPanel.css'

export type ResultsState =
  | { kind: 'idle' }
  | {
      kind: 'loading'
      urls: string[]
      completed: number
      total: number
      usingPrompt?: boolean
      currentUrl: string
      stepLabel: string
      stepHint?: string
      /** 整体进度 0–100（含已完成任务与当前任务） */
      progress: number
    }
  | { kind: 'done'; results: ExtractResponse[] }
  | { kind: 'error'; message: string }

interface ResultsPanelProps {
  state: ResultsState
  onResultChange?: (index: number, item: ExtractResponse) => void
}

export function ResultsPanel({ state, onResultChange }: ResultsPanelProps) {
  const { t } = useI18n()
  const tokenUsage =
    state.kind === 'done' ? aggregateTokenUsage(state.results) : null

  return (
    <GlowPanel title={t('scrape.results.title')} bodyClassName="panel-body--results">
      <div className="results-panel-scroll">
        {tokenUsage && <TokenUsageBar usage={tokenUsage} />}



        {state.kind === 'loading' && (
          <div className="results-loading">
            <TaskProgressBar
              progress={state.progress}
              stepLabel={state.stepLabel}
              stepHint={state.stepHint}
              taskIndex={state.completed + 1}
              taskTotal={state.total}
              currentUrl={state.currentUrl}
              usingPrompt={state.usingPrompt}
            />
            {state.total > 1 && state.completed > 0 && (
              <ul className="results-url-list results-url-list--queued">
                {state.urls.slice(0, state.completed).map((url, idx) => (
                  <li key={`${url}-${idx}`} className="results-url results-url--done">
                    {url}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {state.kind === 'error' && (
          <div className="results-error" role="alert">
            {state.message}
          </div>
        )}

        {state.kind === 'done' && (
          <div className="results-batch">
            {state.results.map((data, index) => (
              <EditableResultCard
                key={`${data.url || 'task'}-${index}`}
                data={data}
                index={state.results.length > 1 ? index : undefined}
                onChange={(next) => onResultChange?.(index, next)}
              />
            ))}
          </div>
        )}
      </div>
    </GlowPanel>
  )
}
