import { useEffect, useId, useState } from 'react'

import type { ProjectDataRecord } from '../../types/projectRecord'

import '../projects/ProjectPage.css'

import './FinDocTaskSelectModal.css'



function formatTaskLabel(record: ProjectDataRecord, index: number): string {

  let when = record.uploadedAt

  try {

    when = new Date(record.uploadedAt).toLocaleString('en-US', {

      month: '2-digit',

      day: '2-digit',

      hour: '2-digit',

      minute: '2-digit',

    })

  } catch {

    /* keep raw */

  }

  const kind = record.source === 'findoc' ? 'FinDoc' : 'Scrape'

  return `#${index + 1} ${when} · ${kind}`

}



export interface FinDocTaskSelectModalProps {

  open: boolean

  records: ProjectDataRecord[]

  selectedIds: string[]

  onClose: () => void

  onConfirm: (ids: string[]) => void

}



export function FinDocTaskSelectModal({

  open,

  records,

  selectedIds,

  onClose,

  onConfirm,

}: FinDocTaskSelectModalProps) {

  const titleId = useId()

  const [draftIds, setDraftIds] = useState<Set<string>>(() => new Set(selectedIds))



  useEffect(() => {

    if (!open) return

    setDraftIds(new Set(selectedIds))

  }, [open, selectedIds])



  useEffect(() => {

    if (!open) return

    const onKey = (e: KeyboardEvent) => {

      if (e.key === 'Escape') onClose()

    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)

  }, [open, onClose])



  if (!open) return null



  const allIds = records.map((r) => r.id)

  const allSelected =

    records.length > 0 && allIds.every((id) => draftIds.has(id))

  const noneSelected = draftIds.size === 0



  const toggle = (id: string) => {

    setDraftIds((prev) => {

      const next = new Set(prev)

      if (next.has(id)) next.delete(id)

      else next.add(id)

      return next

    })

  }



  const submit = () => {

    onConfirm(Array.from(draftIds))

    onClose()

  }



  return (

    <div

      className="project-modal-backdrop"

      role="presentation"

      onClick={onClose}

    >

      <div

        className="project-modal findoc-task-modal"

        role="dialog"

        aria-modal="true"

        aria-labelledby={titleId}

        onClick={(e) => e.stopPropagation()}

      >

        <h2 id={titleId} className="project-modal__title findoc-task-modal__title">

          Select Tasks

        </h2>

        <p className="findoc-task-modal__hint">

          Multi-select supported; all uploads in this Project are selected by default.

        </p>



        {records.length > 0 ? (

          <>

            <div className="findoc-task-modal__bulk">

              <button

                type="button"

                className="findoc-task-modal__bulk-btn"

                disabled={allSelected}

                onClick={() => setDraftIds(new Set(allIds))}

              >

                Select all

              </button>

              <span className="findoc-task-modal__bulk-sep" aria-hidden>

                ·

              </span>

              <button

                type="button"

                className="findoc-task-modal__bulk-btn"

                disabled={noneSelected}

                onClick={() => setDraftIds(new Set())}

              >

                Clear

              </button>

            </div>

            <ul

              className="findoc-task-modal__list scarper-scrollbar"

              aria-label="Task list"

            >

              {records.map((record, index) => (

                <li key={record.id}>

                  <label className="findoc-task-modal__item">

                    <input

                      type="checkbox"

                      className="findoc-task-modal__checkbox"

                      checked={draftIds.has(record.id)}

                      onChange={() => toggle(record.id)}

                    />

                    <span className="findoc-task-modal__item-text">

                      {formatTaskLabel(record, index)}

                    </span>

                  </label>

                </li>

              ))}

            </ul>

          </>

        ) : (

          <p className="findoc-task-modal__empty">No Task records in this Project</p>

        )}



        <div className="project-modal__actions">

          <button

            type="button"

            className="project-btn project-btn--ghost"

            onClick={onClose}

          >

            Cancel

          </button>

          <button

            type="button"

            className="project-btn project-btn--primary"

            disabled={records.length > 0 && noneSelected}

            onClick={submit}

          >

            Confirm

          </button>

        </div>

      </div>

    </div>

  )

}


