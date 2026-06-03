import type { ExtractResponse } from '../../types/extraction'
import { isExtractSuccess } from '../../types/extraction'
import './ResultCard.css'

interface ResultCardProps {
  data: ExtractResponse
  index?: number
}

export function ResultCard({ data, index }: ResultCardProps) {
  if (!isExtractSuccess(data)) {
    return (
      <article className="result-card result-card--error">
        {index !== undefined && (
          <span className="result-card-badge">Task {index + 1}</span>
        )}
        <p className="results-url">{data.url || '—'}</p>
        {data.stage_label && (
          <p className="result-error-stage">
            Failed at: <span>{data.stage_label}</span>
          </p>
        )}
        <p className="result-error-message">{data.error}</p>
        {data.recovery_note && (
          <p className="result-recovery-note">Auto-recovery tried: {data.recovery_note}</p>
        )}
        {data.diagnosis && (
          <section className="result-diagnosis">
            <h4>AI diagnosis</h4>
            <p>{data.diagnosis}</p>
          </section>
        )}
        {!data.diagnosis && data.suggested_action && (
          <p className="result-suggested-action">Suggestion: {data.suggested_action}</p>
        )}
      </article>
    )
  }

  return (
    <article className="result-card">
      {index !== undefined && (
        <span className="result-card-badge">Task {index + 1}</span>
      )}
      <h3 className="results-title">{data.title || 'Untitled'}</h3>
      <p className="results-meta">
        <a href={data.url} target="_blank" rel="noopener noreferrer">
          {data.url}
        </a>
        {data.detected_language && (
          <span> · {data.detected_language}</span>
        )}
      </p>
      {data.summary && (
        <section>
          <h4>Summary</h4>
          <p>{data.summary}</p>
        </section>
      )}
      {data.key_points.length > 0 && (
        <section>
          <h4>Key points</h4>
          <ul>
            {data.key_points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      )}
      {data.content && (
        <section>
          <h4>Body (output language)</h4>
          <pre className="results-content">{data.content}</pre>
        </section>
      )}
    </article>
  )
}
