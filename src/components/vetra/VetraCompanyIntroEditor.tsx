import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import '../../styles/panel.css'
import '../../styles/scrollbar.css'
import '../Layout/TextInputSection.css'
import '../projects/ProjectPage.css'
import { GlowPanel } from '../Layout/GlowPanel'
import {
  insertAtCursor,
  parseEmailTemplateSegments,
  unwrapAiSlotsInRange,
  wrapSelectionAsAiSlot,
} from './vetraEmailTemplate'
import { VetraEmailToolbar } from './VetraEmailToolbar'
import './VetraEmailTemplateEditor.css'

interface VetraCompanyIntroEditorProps {
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
  saving?: boolean
  statusMessage?: string | null
  statusIsError?: boolean
}

function HighlightedIntroText({
  value,
  placeholder,
}: {
  value: string
  placeholder?: string
}) {
  const segments = parseEmailTemplateSegments(value)

  if (!value.trim() && placeholder) {
    return <span className="vetra-email-highlight__placeholder">{placeholder}</span>
  }

  if (segments.length === 0) {
    return <span>{value}</span>
  }

  return (
    <>
      {segments.map((segment, index) =>
        segment.isAiSlot ? (
          <mark key={index} className="vetra-email-highlight__slot">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  )
}

export function VetraCompanyIntroEditor({
  value,
  onChange,
  onCancel,
  onSave,
  saving = false,
  statusMessage = null,
  statusIsError = false,
}: VetraCompanyIntroEditorProps) {
  const { t } = useI18n()
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const [bodyFocused, setBodyFocused] = useState(false)

  const syncHighlightScroll = useCallback(() => {
    const body = bodyRef.current
    const highlight = highlightRef.current
    if (!body || !highlight) return
    highlight.scrollTop = body.scrollTop
    highlight.scrollLeft = body.scrollLeft
  }, [])

  useEffect(() => {
    syncHighlightScroll()
  }, [value, syncHighlightScroll])

  const updateValue = (next: string, cursorStart?: number, cursorEnd?: number) => {
    onChange(next)
    if (cursorStart !== undefined && cursorEnd !== undefined) {
      requestAnimationFrame(() => {
        const el = bodyRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(cursorStart, cursorEnd)
      })
    }
  }

  const applyEdit = (
    edit: (text: string, start: number, end: number) => {
      nextValue: string
      cursorStart: number
      cursorEnd: number
    },
  ) => {
    const el = bodyRef.current
    if (!el) return
    const { nextValue, cursorStart, cursorEnd } = edit(
      value,
      el.selectionStart,
      el.selectionEnd,
    )
    updateValue(nextValue, cursorStart, cursorEnd)
  }

  return (
    <div className="vetra-email-editor">
      <VetraEmailToolbar
        showLockedTools={false}
        onInsertAiSlot={() => applyEdit(wrapSelectionAsAiSlot)}
        onRemoveAiSlot={() => applyEdit(unwrapAiSlotsInRange)}
        onInsertGreeting={() =>
          applyEdit((text, start, end) =>
            insertAtCursor(
              text,
              start,
              end,
              '{{company_name}} is a {{industry}} company based in {{location}}.\n\n{{company_overview}}\n\n',
            ),
          )
        }
        onInsertSignoff={() =>
          applyEdit((text, start, end) =>
            insertAtCursor(
              text,
              start,
              end,
              '\n\nKey highlights:\n- {{highlight_1}}\n- {{highlight_2}}\n',
            ),
          )
        }
      />

      <GlowPanel
        title={t('vetra.companyEditor.title')}
        className="vetra-email-editor__panel"
        bodyClassName="panel-body--input"
      >
        <div className="vetra-email-editor__form">
          <div className="vetra-email-editor__body-label">{t('vetra.companyEditor.introLabel')}</div>

          <div
            className={`vetra-email-editor__body-wrap${
              bodyFocused ? ' vetra-email-editor__body-wrap--focus' : ''
            }`}
          >
            <div
              ref={highlightRef}
              className="vetra-email-body-highlight scarper-scrollbar"
              aria-hidden
            >
              <HighlightedIntroText
                value={value}
                placeholder={t('vetra.companyEditor.placeholder')}
              />
            </div>
            <textarea
              ref={bodyRef}
              className="vetra-email-editor__body scarper-scrollbar"
              value={value}
              spellCheck={false}
              onChange={(event) => updateValue(event.target.value)}
              onScroll={syncHighlightScroll}
              onFocus={() => setBodyFocused(true)}
              onBlur={() => setBodyFocused(false)}
            />
          </div>

          <p className="vetra-email-editor__hint">
            {t('vetra.companyEditor.hint')}
          </p>

          <footer className="text-input-footer vetra-email-editor__footer">
            {statusMessage ? (
              <span
                className={`vetra-email-editor__status${
                  statusIsError ? ' vetra-email-editor__status--error' : ''
                }`}
              >
                {statusMessage}
              </span>
            ) : null}
            <button
              type="button"
              className="project-btn project-btn--ghost"
              disabled={saving}
              onClick={onCancel}
            >
              {t('vetra.companyEditor.cancel')}
            </button>
            <button
              type="button"
              className="text-input-save"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? t('vetra.companyEditor.saving') : t('vetra.companyEditor.save')}
            </button>
          </footer>
        </div>
      </GlowPanel>
    </div>
  )
}
