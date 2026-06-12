import { forwardRef, type ReactNode } from 'react'
import { diffLinesForPreview } from '../../utils/textDiff'
import {
  DashboardRichEditor,
  type DashboardEditorHandle,
} from './DashboardRichEditor'
import '../Results/ResultCard.css'
import '../projects/ProjectPage.css'
import '../Layout/TextInputSection.css'
import './DashboardEditor.css'
import './DashboardRichEditor.css'

export type { DashboardEditorHandle }

export interface PendingEditProposal {
  originalText: string
  proposedText: string
  note: string
}

interface DashboardEditorProps {
  text: string
  pending: PendingEditProposal | null
  disabled?: boolean
  loading?: boolean
  placeholder?: string
  headerSlot?: ReactNode
  onTextChange: (value: string) => void
  onAcceptPending: () => void
  onRejectPending: () => void
}

export const DashboardEditor = forwardRef<
  DashboardEditorHandle,
  DashboardEditorProps
>(function DashboardEditor(
  {
    text,
    pending,
    disabled = false,
    loading = false,
    placeholder = '',
    headerSlot = null,
    onTextChange,
    onAcceptPending,
    onRejectPending,
  },
  ref,
) {
  if (loading) {
    return (
      <p className="dashboard-editor-placeholder">Loading task content…</p>
    )
  }

  if (pending) {
    const lines = diffLinesForPreview(
      pending.originalText,
      pending.proposedText,
    )

    return (
      <div className="dashboard-editor-wrap">
        <div className="dashboard-edit-banner" role="status">
          <div className="dashboard-edit-banner__text">
            <span className="dashboard-edit-banner__title">Suggested AI revision</span>
            {pending.note ? (
              <span className="dashboard-edit-banner__note">
                {pending.note}
              </span>
            ) : null}
          </div>
          <div className="dashboard-edit-banner__actions">
            <button
              type="button"
              className="project-btn project-btn--ghost"
              onClick={onRejectPending}
            >
              Discard
            </button>
            <button
              type="button"
              className="text-input-save dashboard-edit-banner__accept"
              onClick={onAcceptPending}
            >
              Accept
            </button>
          </div>
        </div>
        <div
          className="dashboard-editor-preview scarper-scrollbar scarper-scrollbar--editor"
          aria-label="Pending revision preview; yellow marks changes"
        >
          {lines.map((line, i) => (
            <span
              key={`${i}-${line.kind}`}
              className={
                line.kind === 'changed'
                  ? 'dashboard-diff-line dashboard-diff-line--changed'
                  : 'dashboard-diff-line'
              }
            >
              {line.text}
              {i < lines.length - 1 ? '\n' : ''}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-editor-stack">
      {headerSlot}
      <DashboardRichEditor
        ref={ref}
        text={text}
        disabled={disabled}
        placeholder={placeholder}
        onTextChange={onTextChange}
      />
    </div>
  )
})
