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
  type VetraEmailTemplate,
  unwrapAiSlotsInRange,
  unwrapLockedInRange,
  wrapSelectionAsAiSlot,
  wrapSelectionAsLocked,
} from './vetraEmailTemplate'
import { VetraEmailToolbar } from './VetraEmailToolbar'
import './VetraEmailTemplateEditor.css'

interface VetraEmailTemplateEditorProps {
  template: VetraEmailTemplate
  onChange: (template: VetraEmailTemplate) => void
  onCancel: () => void
  onSave: () => void
  saving?: boolean
  statusMessage?: string | null
  statusIsError?: boolean
}

type ActiveField = 'subject' | 'body'

function HighlightedTemplateText({
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
      {segments.map((segment, index) => {
        if (segment.kind === 'ai_slot') {
          return (
            <mark key={index} className="vetra-email-highlight__slot">
              {segment.text}
            </mark>
          )
        }
        if (segment.kind === 'locked') {
          return (
            <mark key={index} className="vetra-email-highlight__locked">
              {segment.text}
            </mark>
          )
        }
        return <span key={index}>{segment.text}</span>
      })}
    </>
  )
}

export function VetraEmailTemplateEditor({
  template,
  onChange,
  onCancel,
  onSave,
  saving = false,
  statusMessage = null,
  statusIsError = false,
}: VetraEmailTemplateEditorProps) {
  const { t } = useI18n()
  const subjectRef = useRef<HTMLInputElement>(null)
  const subjectHighlightRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const bodyHighlightRef = useRef<HTMLDivElement>(null)
  const [activeField, setActiveField] = useState<ActiveField>('body')
  const [subjectFocused, setSubjectFocused] = useState(false)
  const [bodyFocused, setBodyFocused] = useState(false)

  const syncSubjectHighlightScroll = useCallback(() => {
    const input = subjectRef.current
    const highlight = subjectHighlightRef.current
    if (!input || !highlight) return
    highlight.scrollLeft = input.scrollLeft
  }, [])

  const syncBodyHighlightScroll = useCallback(() => {
    const body = bodyRef.current
    const highlight = bodyHighlightRef.current
    if (!body || !highlight) return
    highlight.scrollTop = body.scrollTop
    highlight.scrollLeft = body.scrollLeft
  }, [])

  useEffect(() => {
    syncSubjectHighlightScroll()
  }, [template.subject, syncSubjectHighlightScroll])

  useEffect(() => {
    syncBodyHighlightScroll()
  }, [template.body, syncBodyHighlightScroll])

  const updateSubject = (
    subject: string,
    cursorStart?: number,
    cursorEnd?: number,
  ) => {
    onChange({ ...template, subject })
    if (cursorStart !== undefined && cursorEnd !== undefined) {
      requestAnimationFrame(() => {
        const el = subjectRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(cursorStart, cursorEnd)
      })
    }
  }

  const updateBody = (body: string, cursorStart?: number, cursorEnd?: number) => {
    onChange({ ...template, body })
    if (cursorStart !== undefined && cursorEnd !== undefined) {
      requestAnimationFrame(() => {
        const el = bodyRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(cursorStart, cursorEnd)
      })
    }
  }

  const applyFieldEdit = (
    field: ActiveField,
    edit: (value: string, start: number, end: number) => {
      nextValue: string
      cursorStart: number
      cursorEnd: number
    },
  ) => {
    const el = field === 'subject' ? subjectRef.current : bodyRef.current
    if (!el) return

    const value = field === 'subject' ? template.subject : template.body
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? start
    const { nextValue, cursorStart, cursorEnd } = edit(value, start, end)

    if (field === 'subject') {
      updateSubject(nextValue, cursorStart, cursorEnd)
    } else {
      updateBody(nextValue, cursorStart, cursorEnd)
    }
  }

  const handleInsertAiSlot = () => {
    applyFieldEdit(activeField, wrapSelectionAsAiSlot)
  }

  const handleRemoveAiSlot = () => {
    applyFieldEdit(activeField, unwrapAiSlotsInRange)
  }

  const handleInsertLocked = () => {
    applyFieldEdit(activeField, wrapSelectionAsLocked)
  }

  const handleRemoveLocked = () => {
    applyFieldEdit(activeField, unwrapLockedInRange)
  }

  const handleInsertGreeting = () => {
    applyFieldEdit('body', (value, start, end) =>
      insertAtCursor(value, start, end, 'Dear {{contact_name}},\n\n{{personalized_intro}}\n\n'),
    )
  }

  const handleInsertSignoff = () => {
    applyFieldEdit('body', (value, start, end) =>
      insertAtCursor(value, start, end, '\n\nBest regards,\n{{sender_name}}'),
    )
  }

  return (
    <div className="vetra-email-editor">
      <VetraEmailToolbar
        onInsertAiSlot={handleInsertAiSlot}
        onRemoveAiSlot={handleRemoveAiSlot}
        onInsertLocked={handleInsertLocked}
        onRemoveLocked={handleRemoveLocked}
        onInsertGreeting={handleInsertGreeting}
        onInsertSignoff={handleInsertSignoff}
      />

      <GlowPanel
        title={t('vetra.emailEditor.title')}
        className="vetra-email-editor__panel"
        bodyClassName="panel-body--input"
      >
        <div className="vetra-email-editor__form">
          <label className="vetra-email-editor__subject-row">
            <span className="vetra-email-editor__label">{t('vetra.emailEditor.subject')}</span>
            <div
              className={`vetra-email-editor__subject-wrap${
                subjectFocused ? ' vetra-email-editor__subject-wrap--focus' : ''
              }`}
            >
              <div
                ref={subjectHighlightRef}
                className="vetra-email-subject-highlight scarper-scrollbar"
                aria-hidden
              >
                <HighlightedTemplateText
                  value={template.subject}
                  placeholder={t('vetra.emailEditor.subjectPh')}
                />
              </div>
              <input
                ref={subjectRef}
                type="text"
                className="vetra-email-editor__subject-input"
                value={template.subject}
                spellCheck={false}
                onChange={(event) => updateSubject(event.target.value)}
                onScroll={syncSubjectHighlightScroll}
                onFocus={() => {
                  setActiveField('subject')
                  setSubjectFocused(true)
                }}
                onBlur={() => setSubjectFocused(false)}
              />
            </div>
          </label>

          <div className="vetra-email-editor__body-label">{t('vetra.emailEditor.body')}</div>

          <div
            className={`vetra-email-editor__body-wrap${
              bodyFocused ? ' vetra-email-editor__body-wrap--focus' : ''
            }`}
          >
            <div
              ref={bodyHighlightRef}
              className="vetra-email-body-highlight scarper-scrollbar"
              aria-hidden
            >
              <HighlightedTemplateText
                value={template.body}
                placeholder={t('vetra.emailEditor.bodyPh')}
              />
            </div>
            <textarea
              ref={bodyRef}
              className="vetra-email-editor__body scarper-scrollbar"
              value={template.body}
              spellCheck={false}
              onChange={(event) => updateBody(event.target.value)}
              onScroll={syncBodyHighlightScroll}
              onFocus={() => {
                setActiveField('body')
                setBodyFocused(true)
              }}
              onBlur={() => setBodyFocused(false)}
            />
          </div>

          <p className="vetra-email-editor__hint">
            <span className="vetra-email-editor__hint-item">
              <span className="vetra-email-editor__swatch vetra-email-editor__swatch--locked" />
              {t('vetra.emailEditor.hintLock')}
            </span>
            <span className="vetra-email-editor__hint-item">
              <span className="vetra-email-editor__swatch vetra-email-editor__swatch--plain" />
              {t('vetra.emailEditor.hintPlain')}
            </span>
            <span className="vetra-email-editor__hint-item">
              <span className="vetra-email-editor__swatch vetra-email-editor__swatch--slot" />
              {t('vetra.emailEditor.hintAi')}
            </span>
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
              {t('vetra.emailEditor.cancel')}
            </button>
            <button
              type="button"
              className="text-input-save"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? t('vetra.emailEditor.saving') : t('vetra.emailEditor.save')}
            </button>
          </footer>
        </div>
      </GlowPanel>
    </div>
  )
}
