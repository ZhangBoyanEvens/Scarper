import { useEffect, useId, useRef, useState } from 'react'
import '../projects/ProjectPage.css'
import './NewRecordModal.css'

export type NewRecordContentMode = 'text' | 'file'

export interface NewRecordModalConfirmPayload {
  name: string
  contentMode: NewRecordContentMode
}

interface NewRecordModalProps {
  open: boolean
  creating?: boolean
  onClose: () => void
  onConfirm: (payload: NewRecordModalConfirmPayload) => void
}

export function NewRecordModal({
  open,
  creating = false,
  onClose,
  onConfirm,
}: NewRecordModalProps) {
  const [name, setName] = useState('')
  const [contentMode, setContentMode] = useState<NewRecordContentMode>('text')
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setContentMode('text')
    setError(null)
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  if (!open) return null

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('请输入记录名称')
      return
    }
    if (trimmed.length > 80) {
      setError('记录名称不超过 80 个字符')
      return
    }
    onConfirm({ name: trimmed, contentMode })
  }

  return (
    <div
      className="project-modal-backdrop"
      role="presentation"
      onClick={creating ? undefined : onClose}
    >
      <div
        className="project-modal new-record-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-record-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="new-record-title" className="project-modal__title">
          新建记录
        </h2>

        <label className="project-modal__label" htmlFor={nameId}>
          记录名称
        </label>
        <input
          ref={inputRef}
          id={nameId}
          type="text"
          className="project-modal__input"
          value={name}
          placeholder="例如：Q2 竞品汇总"
          maxLength={80}
          disabled={creating}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !creating) submit()
            if (e.key === 'Escape' && !creating) onClose()
          }}
        />

        <fieldset className="new-record-modal__mode">
          <legend className="project-modal__label">添加内容</legend>
          <div className="new-record-modal__mode-options">
            <label className="new-record-modal__mode-option">
              <input
                type="radio"
                name="new-record-content-mode"
                value="text"
                checked={contentMode === 'text'}
                disabled={creating}
                onChange={() => setContentMode('text')}
              />
              <span>文本</span>
              <small>清空编辑区并插入空白记录</small>
            </label>
            <label className="new-record-modal__mode-option">
              <input
                type="radio"
                name="new-record-content-mode"
                value="file"
                checked={contentMode === 'file'}
                disabled={creating}
                onChange={() => setContentMode('file')}
              />
              <span>文件</span>
              <small>在编辑区显示文件上传模块</small>
            </label>
          </div>
        </fieldset>

        {error && (
          <p className="project-modal__error" role="alert">
            {error}
          </p>
        )}

        <div className="project-modal__actions">
          <button
            type="button"
            className="project-btn project-btn--ghost"
            disabled={creating}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="project-btn project-btn--primary"
            disabled={creating}
            onClick={submit}
          >
            {creating ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}
