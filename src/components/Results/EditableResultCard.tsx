import { useI18n } from '../../contexts/I18nContext'
import type { ExtractResponse, ExtractSuccess } from '../../types/extraction'
import { isExtractSuccess } from '../../types/extraction'
import { splitResultUrls } from '../../utils/resultUrls'
import { AutoResizeTextarea } from './AutoResizeTextarea'
import './ResultCard.css'

interface EditableResultCardProps {
  data: ExtractResponse
  index?: number
  onChange: (next: ExtractResponse) => void
}

function patchSuccess(
  data: ExtractSuccess,
  patch: Partial<ExtractSuccess>,
): ExtractSuccess {
  return { ...data, ...patch }
}

export function EditableResultCard({
  data,
  index,
  onChange,
}: EditableResultCardProps) {
  const { t } = useI18n()

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

  const keyPointsText = data.key_points.join('\n')

  return (
    <article className="result-card result-card--editable">
      {index !== undefined && (
        <span className="result-card-badge">
          {t('scrape.results.taskBadge', { n: index + 1 })}
        </span>
      )}
      <label className="result-field">
        <span className="result-field__label">{t('scrape.results.fields.title')}</span>
        <input
          type="text"
          className="result-field__input"
          value={data.title}
          onChange={(e) =>
            onChange(patchSuccess(data, { title: e.target.value }))
          }
        />
      </label>
      <p className="results-meta results-meta--sources">
        {splitResultUrls(data.url).map((href) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="results-meta__link"
          >
            {href}
          </a>
        ))}
        {data.detected_language && <span> · {data.detected_language}</span>}
      </p>
      <label className="result-field">
        <span className="result-field__label">{t('scrape.results.fields.summary')}</span>
        <AutoResizeTextarea
          className="result-field__textarea"
          minRows={3}
          value={data.summary}
          onChange={(e) =>
            onChange(patchSuccess(data, { summary: e.target.value }))
          }
        />
      </label>
      <label className="result-field">
        <span className="result-field__label">{t('scrape.results.fields.keyPoints')}</span>
        <AutoResizeTextarea
          className="result-field__textarea"
          minRows={3}
          value={keyPointsText}
          onChange={(e) =>
            onChange(
              patchSuccess(data, {
                key_points: e.target.value
                  .split('\n')
                  .map((line) => line.replace(/^[\s•\-]+/, '').trim())
                  .filter(Boolean),
              }),
            )
          }
        />
      </label>
      <label className="result-field">
        <span className="result-field__label">{t('scrape.results.fields.body')}</span>
        <AutoResizeTextarea
          className="result-field__textarea result-field__textarea--body"
          minRows={8}
          value={data.content}
          onChange={(e) =>
            onChange(patchSuccess(data, { content: e.target.value }))
          }
        />
      </label>
    </article>
  )
}
