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
          <span className="result-card-badge">任务 {index + 1}</span>
        )}
        <p className="results-url">{data.url || '—'}</p>
        <p>{data.error}</p>
      </article>
    )
  }

  return (
    <article className="result-card">
      {index !== undefined && (
        <span className="result-card-badge">任务 {index + 1}</span>
      )}
      <h3 className="results-title">{data.title || '无标题'}</h3>
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
          <h4>摘要</h4>
          <p>{data.summary}</p>
        </section>
      )}
      {data.key_points.length > 0 && (
        <section>
          <h4>要点</h4>
          <ul>
            {data.key_points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      )}
      {data.content && (
        <section>
          <h4>正文</h4>
          <pre className="results-content">{data.content}</pre>
        </section>
      )}
    </article>
  )
}
