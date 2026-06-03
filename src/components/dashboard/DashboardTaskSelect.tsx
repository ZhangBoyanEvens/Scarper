import { useEffect, useId, useRef, useState } from 'react'
import type { ProjectDataRecord } from '../../types/projectRecord'
import './DashboardTaskSelect.css'

interface DashboardTaskSelectProps {
  records: ProjectDataRecord[]
  selectedIds: string[]
  disabled?: boolean
  formatLabel: (record: ProjectDataRecord, index: number) => string
  onChange: (ids: string[]) => void
}

export function DashboardTaskSelect({
  records,
  selectedIds,
  disabled = false,
  formatLabel,
  onChange,
}: DashboardTaskSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggleId = (id: string) => {
    if (selectedIds.includes(id)) {
      if (selectedIds.length <= 1) return
      onChange(selectedIds.filter((x) => x !== id))
      return
    }
    onChange([...selectedIds, id])
  }

  const selectAll = () => {
    onChange(records.map((r) => r.id))
  }

  const triggerLabel = (() => {
    if (records.length === 0) return '暂无记录'
    if (selectedIds.length === 0) return '选择 Task'
    if (selectedIds.length === 1) {
      const idx = records.findIndex((r) => r.id === selectedIds[0])
      if (idx >= 0) return formatLabel(records[idx], idx)
    }
    return `已选 ${selectedIds.length} 个 Task`
  })()

  return (
    <div
      className="dashboard-task-select"
      ref={rootRef}
    >
      <button
        type="button"
        className="lang-select-control dashboard-select dashboard-task-select__trigger"
        disabled={disabled || records.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="dashboard-task-select__trigger-text">{triggerLabel}</span>
        <span className="dashboard-task-select__chevron" aria-hidden>
          ▾
        </span>
      </button>

      {open && records.length > 0 && (
        <div className="dashboard-task-select__menu" id={listId} role="listbox" aria-multiselectable>
          <div className="dashboard-task-select__menu-head">
            <span>可多选 Task</span>
            <button
              type="button"
              className="dashboard-task-select__link"
              onClick={selectAll}
            >
              全选
            </button>
          </div>
          <ul className="dashboard-task-select__list">
            {records.map((record, index) => {
              const checked = selectedIds.includes(record.id)
              return (
                <li key={record.id}>
                  <label className="dashboard-task-select__option">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={checked && selectedIds.length <= 1}
                      onChange={() => toggleId(record.id)}
                    />
                    <span>{formatLabel(record, index)}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
