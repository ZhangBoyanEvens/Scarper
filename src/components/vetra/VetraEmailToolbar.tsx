import type { ReactNode } from 'react'
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
  return (
    <div className="vetra-email-toolbar" aria-label="Email template tools">
      {showLockedTools && onInsertLocked && onRemoveLocked ? (
        <>
          <button
            type="button"
            className="vetra-email-toolbar__btn vetra-email-toolbar__btn--lock"
            title="Mark as locked [[ ]]"
            aria-label="Mark as locked"
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
            <span className="vetra-email-toolbar__hint">Lock</span>
          </button>

          <button
            type="button"
            className="vetra-email-toolbar__btn vetra-email-toolbar__btn--lock-remove"
            title="Remove locked [[ ]]"
            aria-label="Remove locked mark"
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
        title="Insert AI slot {{ }}"
        aria-label="Insert AI slot"
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
        <span className="vetra-email-toolbar__hint">AI</span>
      </button>

      <button
        type="button"
        className="vetra-email-toolbar__btn vetra-email-toolbar__btn--unwrap"
        title="Remove AI highlight {{ }}"
        aria-label="Remove AI highlight"
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
        title="Insert greeting block"
        aria-label="Insert greeting block"
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
        title="Insert sign-off block"
        aria-label="Insert sign-off block"
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
            Lock
          </span>
        ) : null}
        <span className="vetra-email-toolbar__legend-row">
          <span className="vetra-email-toolbar__legend-swatch vetra-email-toolbar__legend-swatch--slot" />
          Fill
        </span>
      </div>
    </div>
  )
}
