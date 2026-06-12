import type { ReactNode } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import './VetraEmailToolbar.css'

interface VetraEmailToolbarProps {
  onInsertAiSlot: () => void
  onRemoveAiSlot: () => void
  onInsertLocked?: () => void
  onRemoveLocked?: () => void
  onInsertGreeting: () => void
  onInsertSignoff: () => void
  showLockedTools?: boolean
}

function ToolbarIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      {children}
    </svg>
  )
}

export function VetraEmailToolbar({
  onInsertAiSlot,
  onRemoveAiSlot,
  onInsertLocked,
  onRemoveLocked,
  onInsertGreeting,
  onInsertSignoff,
  showLockedTools = true,
}: VetraEmailToolbarProps) {
  const { t } = useI18n()

  return (
    <div className="vetra-email-toolbar" aria-label={t('vetra.emailToolbar.aria')}>
      {showLockedTools && onInsertLocked && onRemoveLocked ? (
        <>
          <button
            type="button"
            className="vetra-email-toolbar__btn vetra-email-toolbar__btn--lock"
            title={t('vetra.emailToolbar.lock')}
            aria-label={t('vetra.emailToolbar.lock')}
            onClick={onInsertLocked}
          >
            <ToolbarIcon>
              <rect
                x="6"
                y="10"
                width="12"
                height="9"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.75"
              />
              <path
                d="M9 10V8a3 3 0 116 0v2"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </ToolbarIcon>
            <span className="vetra-email-toolbar__hint">{t('vetra.emailToolbar.lockShort')}</span>
          </button>

          <button
            type="button"
            className="vetra-email-toolbar__btn vetra-email-toolbar__btn--lock-remove"
            title={t('vetra.emailToolbar.removeLock')}
            aria-label={t('vetra.emailToolbar.removeLock')}
            onClick={onRemoveLocked}
          >
            <ToolbarIcon>
              <rect
                x="5"
                y="9"
                width="14"
                height="10"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.75"
                fill="rgba(248, 113, 113, 0.2)"
              />
              <path
                d="M9 14h6"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </ToolbarIcon>
          </button>
        </>
      ) : null}

      <button
        type="button"
        className="vetra-email-toolbar__btn"
        title={t('vetra.emailToolbar.insertAi')}
        aria-label={t('vetra.emailToolbar.insertAi')}
        onClick={onInsertAiSlot}
      >
        <ToolbarIcon>
          <path
            d="M8 7h8M8 12h8M8 17h5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <rect
            x="4"
            y="5"
            width="16"
            height="14"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.75"
          />
        </ToolbarIcon>
        <span className="vetra-email-toolbar__hint">{t('vetra.emailToolbar.aiShort')}</span>
      </button>

      <button
        type="button"
        className="vetra-email-toolbar__btn vetra-email-toolbar__btn--unwrap"
        title={t('vetra.emailToolbar.removeAi')}
        aria-label={t('vetra.emailToolbar.removeAi')}
        onClick={onRemoveAiSlot}
      >
        <ToolbarIcon>
          <rect
            x="5"
            y="7"
            width="14"
            height="10"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.75"
            fill="rgba(250, 204, 21, 0.25)"
          />
          <path
            d="M9 12h6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </ToolbarIcon>
      </button>

      <button
        type="button"
        className="vetra-email-toolbar__btn"
        title={t('vetra.emailToolbar.insertGreeting')}
        aria-label={t('vetra.emailToolbar.insertGreeting')}
        onClick={onInsertGreeting}
      >
        <ToolbarIcon>
          <path
            d="M4 6h16M4 12h10M4 18h14"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </ToolbarIcon>
      </button>

      <button
        type="button"
        className="vetra-email-toolbar__btn"
        title={t('vetra.emailToolbar.insertSignoff')}
        aria-label={t('vetra.emailToolbar.insertSignoff')}
        onClick={onInsertSignoff}
      >
        <ToolbarIcon>
          <path
            d="M4 18l6-6 4 4 6-8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </ToolbarIcon>
      </button>

      <div className="vetra-email-toolbar__legend">
        {showLockedTools ? (
          <span className="vetra-email-toolbar__legend-row">
            <span className="vetra-email-toolbar__legend-swatch vetra-email-toolbar__legend-swatch--locked" />
            {t('vetra.emailToolbar.legendLock')}
          </span>
        ) : null}
        <span className="vetra-email-toolbar__legend-row">
          <span className="vetra-email-toolbar__legend-swatch vetra-email-toolbar__legend-swatch--slot" />
          {t('vetra.emailToolbar.legendFill')}
        </span>
      </div>
    </div>
  )
}
