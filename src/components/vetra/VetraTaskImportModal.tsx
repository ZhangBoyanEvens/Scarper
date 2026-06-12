import { useEffect, useId, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { formatOutreachTaskLabel, type VetraOutreachTaskOption } from './vetraOutreachTask'
import '../projects/ProjectPage.css'
import './VetraTaskImportModal.css'

export interface VetraTaskImportModalProps {
  open: boolean
  tasks: VetraOutreachTaskOption[]
  loading?: boolean
  importing?: boolean
  onClose: () => void
  onConfirm: (task: VetraOutreachTaskOption) => void
}

export function VetraTaskImportModal({
  open,
  tasks,
  loading = false,
  importing = false,
  onClose,
  onConfirm,
}: VetraTaskImportModalProps) {
  const { t } = useI18n()
  const titleId = useId()
  const [selectedKey, setSelectedKey] = useState('')

  useEffect(() => {
    if (!open) return
    setSelectedKey((current) => {
      if (current && tasks.some((task) => task.key === current)) return current
      return tasks[0]?.key ?? ''
    })
  }, [open, tasks])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, importing, onClose])

  if (!open) return null

  const selectedTask = tasks.find((task) => task.key === selectedKey) ?? null

  return (
    <div
      className="project-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!importing) onClose()
      }}
    >
      <div
        className="project-modal vetra-task-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="project-modal__title vetra-task-import-modal__title">
          {t('vetra.taskImport.title')}
        </h2>
        <p className="vetra-task-import-modal__hint">
          {t('vetra.taskImport.hint')}
        </p>

        {loading ? (
          <p className="vetra-task-import-modal__empty">{t('vetra.taskImport.loading')}</p>
        ) : tasks.length === 0 ? (
          <p className="vetra-task-import-modal__empty">
            {t('vetra.taskImport.empty')}
          </p>
        ) : (
          <ul
            className="vetra-task-import-modal__list scarper-scrollbar"
            aria-label={t('vetra.taskImport.listAria')}
          >
            {tasks.map((task) => (
              <li key={task.key}>
                <label className="vetra-task-import-modal__item">
                  <input
                    type="radio"
                    name="vetra-import-task"
                    className="vetra-task-import-modal__radio"
                    checked={selectedKey === task.key}
                    disabled={importing}
                    onChange={() => setSelectedKey(task.key)}
                  />
                  <span className="vetra-task-import-modal__item-text">
                    {formatOutreachTaskLabel(
                      task.record,
                      task.index,
                      task.projectName,
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {importing ? (
          <p className="vetra-task-import-modal__status" role="status">
            {t('vetra.taskImport.generating')}
          </p>
        ) : null}

        <div className="project-modal__actions">
          <button
            type="button"
            className="project-btn project-btn--ghost"
            disabled={importing}
            onClick={onClose}
          >
            {t('vetra.taskImport.cancel')}
          </button>
          <button
            type="button"
            className="project-btn project-btn--primary"
            disabled={loading || importing || !selectedTask}
            onClick={() => {
              if (selectedTask) onConfirm(selectedTask)
            }}
          >
            {importing ? t('vetra.taskImport.importing') : t('vetra.taskImport.import')}
          </button>
        </div>
      </div>
    </div>
  )
}
