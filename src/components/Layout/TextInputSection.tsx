import { useCallback, useEffect, useState } from 'react'
import { useAppSettingsOptional } from '../../contexts/AppSettingsContext'
import { loadSavedPrompt, savePromptToStorage } from '../../storage/promptStorage'
import '../SearchBar/SearchBar.css'
import { GlowPanel } from './GlowPanel'
import './TextInputSection.css'

export interface TextInputSectionProps {
  /** panel = 左侧大面板；toolbar = 顶部横条（原 URL 搜索框尺寸） */
  layout?: 'panel' | 'toolbar'
  placeholder?: string
  /** 保存成功后回调 */
  onPromptSaved?: (prompt: string) => void
}

export function TextInputSection({
  layout = 'panel',
  placeholder = 'Processing prompt, e.g. extract key insights and list action items…',
  onPromptSaved,
}: TextInputSectionProps) {
  const appSettings = useAppSettingsOptional()
  const [draft, setDraft] = useState('')
  const [savedPrompt, setSavedPrompt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const fromSettings = appSettings?.settings.processingPrompt
    const stored = fromSettings ?? loadSavedPrompt()
    if (stored !== null) {
      setSavedPrompt(stored)
      setDraft(stored)
    }
    setLoaded(true)
  }, [appSettings?.settings.processingPrompt])

  const isDirty = savedPrompt === null ? draft.length > 0 : draft !== savedPrompt
  const canSave = loaded && draft.trim().length > 0 && isDirty

  const handleSave = useCallback(() => {
    const text = draft
    savePromptToStorage(text)
    appSettings?.setProcessingPrompt(text)
    setSavedPrompt(text)
    onPromptSaved?.(text)
  }, [appSettings, draft, onPromptSaved])

  const saveLabel =
    savedPrompt !== null && !isDirty ? 'Saved' : savedPrompt !== null ? 'Save changes' : 'Save'

  const [focused, setFocused] = useState(false)

  if (layout === 'toolbar') {
    return (
      <div className="search-bar prompt-toolbar">
        <div
          className={`panel-shell search-shell ${focused ? 'search-shell--focus' : ''}`}
          role="group"
          aria-label="Processing prompt"
        >
          <label className="panel-inner search-field">
            <span className="search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 6h16M4 12h10M4 18h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              type="text"
              className="search-input"
              value={draft}
              placeholder={placeholder}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            <button
              type="button"
              className="search-go"
              disabled={!canSave}
              aria-label={saveLabel}
              title={saveLabel}
              onClick={handleSave}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </label>
        </div>
        {savedPrompt !== null && isDirty && (
          <p className="search-error prompt-toolbar-hint">Edited — not saved</p>
        )}
      </div>
    )
  }

  return (
    <GlowPanel title="Processing prompt" bodyClassName="panel-body--input">
      <div className="text-input-wrap">
        <textarea
          className="panel-textarea"
          value={draft}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="text-input-footer">
          {savedPrompt !== null && isDirty && (
            <span className="text-input-status">Edited — not saved</span>
          )}
          <button
            type="button"
            className="text-input-save"
            disabled={!canSave}
            onClick={handleSave}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </GlowPanel>
  )
}
