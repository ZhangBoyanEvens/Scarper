import { useCallback, useEffect, useState } from 'react'
import { loadSavedPrompt, savePromptToStorage } from '../../storage/promptStorage'
import { GlowPanel } from './GlowPanel'
import './TextInputSection.css'

export interface TextInputSectionProps {
  placeholder?: string
  /** 保存成功后回调 */
  onPromptSaved?: (prompt: string) => void
}

export function TextInputSection({
  placeholder = '输入处理指令，例如：提取核心观点并列出行动建议…',
  onPromptSaved,
}: TextInputSectionProps) {
  const [draft, setDraft] = useState('')
  const [savedPrompt, setSavedPrompt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const stored = loadSavedPrompt()
    if (stored !== null) {
      setSavedPrompt(stored)
      setDraft(stored)
    }
    setLoaded(true)
  }, [])

  const isDirty = savedPrompt === null ? draft.length > 0 : draft !== savedPrompt
  const canSave = loaded && draft.trim().length > 0 && isDirty

  const handleSave = useCallback(() => {
    const text = draft
    savePromptToStorage(text)
    setSavedPrompt(text)
    onPromptSaved?.(text)
  }, [draft, onPromptSaved])

  const saveLabel =
    savedPrompt !== null && !isDirty ? '已保存' : savedPrompt !== null ? '保存修改' : '保存'

  return (
    <GlowPanel title="处理指令" bodyClassName="panel-body--input">
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
            <span className="text-input-status">编辑中，未保存</span>
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
