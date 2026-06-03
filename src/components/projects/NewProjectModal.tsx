import { useEffect, useId, useRef, useState } from 'react'
import './ProjectPage.css'

interface NewProjectModalProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, description: string) => void
}

export function NewProjectModal({
  open,
  onClose,
  onCreate,
}: NewProjectModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setError(null)
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  if (!open) return null

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('请输入项目名称')
      return
    }
    if (trimmed.length > 80) {
      setError('项目名称不超过 80 个字符')
      return
    }
    onCreate(trimmed, description.trim())
    onClose()
  }

  return (
    <div
      className="project-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="project-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="new-project-title" className="project-modal__title">
          新建 Project
        </h2>
        <label className="project-modal__label" htmlFor={nameId}>
          项目名称
        </label>
        <input
          ref={inputRef}
          id={nameId}
          type="text"
          className="project-modal__input"
          value={name}
          placeholder="例如：竞品监控 Q2"
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
          }}
        />
        <label className="project-modal__label" htmlFor={`${nameId}-desc`}>
          备注（可选）
        </label>
        <textarea
          id={`${nameId}-desc`}
          className="project-modal__textarea"
          value={description}
          rows={3}
          placeholder="用途说明…"
          maxLength={300}
          onChange={(e) => setDescription(e.target.value)}
        />
        {error && (
          <p className="project-modal__error" role="alert">
            {error}
          </p>
        )}
        <div className="project-modal__actions">
          <button
            type="button"
            className="project-btn project-btn--ghost"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="project-btn project-btn--primary"
            onClick={submit}
          >
            创建
          </button>
        </div>
      </div>
    </div>
  )
}
