import { useEffect, useRef } from 'react'
import type { VetraCompany } from './companiesData'
import './VetraCompaniesView.css'

interface CompanyCardProps {
  company: VetraCompany
  isActive: boolean
  isEditing: boolean
  editingName: string
  renameLabel: string
  deleteLabel: string
  canDelete: boolean
  saving?: boolean
  onSelect: () => void
  onStartEdit: () => void
  onEditingNameChange: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onDelete: () => void
}

function CompanyCard({
  company,
  isActive,
  isEditing,
  editingName,
  renameLabel,
  deleteLabel,
  canDelete,
  saving = false,
  onSelect,
  onStartEdit,
  onEditingNameChange,
  onCommitRename,
  onCancelRename,
  onDelete,
}: CompanyCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const skipBlurCommitRef = useRef(false)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onCommitRename()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      skipBlurCommitRef.current = true
      onCancelRename()
    }
  }

  const handleBlur = () => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false
      return
    }
    onCommitRename()
  }

  return (
    <div
      role="listitem"
      className={`vetra-company-card${isActive ? ' vetra-company-card--active' : ''}${
        isEditing ? ' vetra-company-card--editing' : ''
      }`}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          className="vetra-company-card__input"
          value={editingName}
          aria-label={renameLabel}
          onChange={(event) => onEditingNameChange(event.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <div className="vetra-company-card__row">
          <button
            type="button"
            className="vetra-company-card__button"
            aria-pressed={isActive}
            onClick={onSelect}
            onDoubleClick={(event) => {
              event.preventDefault()
              onStartEdit()
            }}
          >
            <span className="vetra-company-card__name">{company.name}</span>
          </button>
          {canDelete ? (
            <button
              type="button"
              className="vetra-company-card__delete"
              aria-label={`${deleteLabel} ${company.name}`}
              title={deleteLabel}
              disabled={saving}
              onClick={(event) => {
                event.stopPropagation()
                onDelete()
              }}
            >
              ×
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

interface VetraCompanyListPanelProps {
  title: string
  listLabel: string
  createLabel: string
  renameLabel: string
  deleteLabel: string
  companies: VetraCompany[]
  selectedId: string
  editingId: string | null
  editingName: string
  saving?: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  importLabel?: string
  onImport?: () => void
  importing?: boolean
  onStartEdit: (company: VetraCompany) => void
  onEditingNameChange: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onDelete: (company: VetraCompany) => void
  statusMessage?: string | null
  statusIsError?: boolean
}

export function VetraCompanyListPanel({
  title,
  listLabel,
  createLabel,
  renameLabel,
  deleteLabel,
  companies,
  selectedId,
  editingId,
  editingName,
  saving = false,
  onSelect,
  onCreate,
  importLabel = 'Import from Task',
  onImport,
  importing = false,
  onStartEdit,
  onEditingNameChange,
  onCommitRename,
  onCancelRename,
  onDelete,
  statusMessage = null,
  statusIsError = false,
}: VetraCompanyListPanelProps) {
  const canDelete = companies.length > 0
  return (
    <aside className="vetra-companies-list" aria-label={listLabel}>
      <header className="vetra-companies-list__head">
        <h2 className="vetra-companies-list__title">{title}</h2>
        <div className="vetra-companies-list__actions">
          <span className="vetra-companies-list__count">{companies.length}</span>
          {onImport ? (
            <button
              type="button"
              className="vetra-companies-list__import"
              aria-label={importLabel}
              title={importLabel}
              disabled={saving || importing}
              onClick={onImport}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 3v12m0 0l4-4m-4 4L8 11M5 15v4h14v-4"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className="vetra-companies-list__create"
            aria-label={createLabel}
            title={createLabel}
            disabled={saving}
            onClick={onCreate}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>

      {statusMessage ? (
        <p
          className={`vetra-companies-list__status${
            statusIsError ? ' vetra-companies-list__status--error' : ''
          }`}
          role={statusIsError ? 'alert' : 'status'}
        >
          {statusMessage}
        </p>
      ) : null}

      <div className="vetra-companies-list__scroll scarper-scrollbar" role="list">
        {companies.map((company) => (
          <CompanyCard
            key={company.id}
            company={company}
            isActive={selectedId === company.id}
            isEditing={editingId === company.id}
            editingName={editingName}
            renameLabel={renameLabel}
            onSelect={() => onSelect(company.id)}
            onStartEdit={() => onStartEdit(company)}
            onEditingNameChange={onEditingNameChange}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
            deleteLabel={deleteLabel}
            canDelete={canDelete}
            saving={saving}
            onDelete={() => onDelete(company)}
          />
        ))}
      </div>
    </aside>
  )
}
