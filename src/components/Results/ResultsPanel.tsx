import type { ExtractResponse } from '../../types/extraction'
import { GlowPanel } from '../Layout/GlowPanel'
import { ResultCard } from './ResultCard'
import './ResultsPanel.css'

export type ResultsState =
  | { kind: 'idle' }
  | {
      kind: 'loading'
      urls: string[]
      completed: number
      total: number
      usingPrompt?: boolean
    }
  | { kind: 'done'; results: ExtractResponse[] }
  | { kind: 'error'; message: string }

interface ResultsPanelProps {
  state: ResultsState
}

export function ResultsPanel({ state }: ResultsPanelProps) {
  return (
    <GlowPanel title="结果" bodyClassName="panel-body--results">


      {state.kind === 'loading' && (
        <div className="results-loading">
          <p>
            正在处理 {state.completed}/{state.total} 个任务…
            {state.usingPrompt && (
              <span className="results-prompt-hint">
                {' '}
                （已应用左侧保存的处理指令）
              </span>
            )}
          </p>
          <ul className="results-url-list">
            {state.urls.map((url) => (
              <li key={url} className="results-url">
                {url}
              </li>
            ))}
          </ul>
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
            <ResultCard
              key={data.url || `task-${index}`}
              data={data}
              index={state.results.length > 1 ? index : undefined}
            />
          ))}
        </div>
      )}
    </GlowPanel>
  )
}
