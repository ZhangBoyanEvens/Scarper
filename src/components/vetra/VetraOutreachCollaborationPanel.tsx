import type { VetraCollaborationAnalysis } from '../../services/vetraOutreachCollaboration'
import { useI18n } from '../../contexts/I18nContext'
import './VetraOutreachCollaborationPanel.css'

interface VetraOutreachCollaborationPanelProps {
  fromCompanyName: string
  toCompanyName: string
  analysis: VetraCollaborationAnalysis | null
  selectedIndices: ReadonlySet<number>
  onToggleOpportunity: (index: number) => void
  onGenerate: () => void
  canGenerate?: boolean
  generating?: boolean
  statusMessage?: string | null
  loading?: boolean
  error?: string | null
}

function matchTone(score: number): string {
  if (score >= 75) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}

export function VetraOutreachCollaborationPanel({
  fromCompanyName,
  toCompanyName,
  analysis,
  selectedIndices,
  onToggleOpportunity,
  onGenerate,
  canGenerate = false,
  generating = false,
  statusMessage = null,
  loading = false,
  error = null,
}: VetraOutreachCollaborationPanelProps) {
  const { t } = useI18n()
  const selectedCount = selectedIndices.size

  return (
    <aside className="vetra-outreach-collab" aria-label={t('vetra.collab.aria')}>
      <header className="vetra-outreach-collab__head">
        <div className="vetra-outreach-collab__head-row">
          <h2 className="vetra-outreach-collab__title">{t('vetra.collab.title')}</h2>
          {analysis && selectedCount > 0 ? (
            <span className="vetra-outreach-collab__selected-count">
              {t('vetra.collab.selected', { count: selectedCount })}
            </span>
          ) : null}
          <button
            type="button"
            className="text-input-save vetra-outreach-collab__generate"
            disabled={!canGenerate || generating}
            onClick={onGenerate}
          >
            {generating ? t('vetra.collab.generating') : t('vetra.collab.generate')}
          </button>
        </div>
        <p className="vetra-outreach-collab__pair">
          {fromCompanyName || t('vetra.outreach.from')} → {toCompanyName || t('vetra.outreach.to')}
        </p>
        {statusMessage ? (
          <p className="vetra-outreach-collab__status" role="status">
            {statusMessage}
          </p>
        ) : null}
      </header>

      <div className="vetra-outreach-collab__scroll scarper-scrollbar">
        {loading ? (
          <p className="vetra-outreach-collab__placeholder">{t('vetra.collab.analyzing')}</p>
        ) : error ? (
          <p className="vetra-outreach-collab__error">{error}</p>
        ) : !analysis ? (
          <p className="vetra-outreach-collab__placeholder">
            {t('vetra.collab.placeholder')}
          </p>
        ) : (
          <>
            <div
              className={`vetra-outreach-collab__score vetra-outreach-collab__score--${matchTone(
                analysis.matchScore,
              )}`}
            >
              <span className="vetra-outreach-collab__score-value">
                {analysis.matchScore}
              </span>
              <div className="vetra-outreach-collab__score-meta">
                <span className="vetra-outreach-collab__score-label">{t('vetra.collab.matchScore')}</span>
                {analysis.matchSummary ? (
                  <p className="vetra-outreach-collab__score-summary">
                    {analysis.matchSummary}
                  </p>
                ) : null}
              </div>
            </div>

            <p className="vetra-outreach-collab__hint">
              {t('vetra.collab.selectHint')}
            </p>

            <ul className="vetra-outreach-collab__list" aria-label={t('vetra.collab.opportunitiesAria')}>
              {analysis.opportunities.map((item, index) => {
                const selected = selectedIndices.has(index)
                return (
                  <li key={`${item.title}-${index}`}>
                    <button
                      type="button"
                      className={`vetra-outreach-collab__item${
                        selected ? ' vetra-outreach-collab__item--selected' : ''
                      }`}
                      aria-pressed={selected}
                      onClick={() => onToggleOpportunity(index)}
                    >
                      <span className="vetra-outreach-collab__item-check" aria-hidden="true">
                        {selected ? '✓' : ''}
                      </span>
                      <span className="vetra-outreach-collab__item-body">
                        <span className="vetra-outreach-collab__item-title">
                          {index + 1}. {item.title}
                        </span>
                        <span className="vetra-outreach-collab__item-desc">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  )
}
