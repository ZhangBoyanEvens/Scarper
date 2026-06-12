import { useEffect, useRef, useState } from 'react'
import { loadTaskContentForFinDoc } from '../../services/projectRecordService'
import { generateCompanyIntroFromTask } from '../../services/vetraCompanyIntroImport'
import '../../styles/panel.css'
import '../../styles/scrollbar.css'
import '../projects/ProjectPage.css'
import { VetraCompanyIntroEditor } from './VetraCompanyIntroEditor'
import { VetraCompanyListPanel } from './VetraCompanyListPanel'
import { VetraTaskImportModal } from './VetraTaskImportModal'
import type { VetraCompany } from './companiesData'
import { createEmptyCompanyIntroduction } from './vetraEmailTemplate'
import { useVetraOutreachTasks } from './useVetraOutreachTasks'
import type { VetraOutreachTaskOption } from './vetraOutreachTask'
import { useVetraCompanyWorkspaceContext } from './VetraWorkspaceContext'
import './VetraCompaniesView.css'

export function VetraCompaniesIntroView() {
  const workspace = useVetraCompanyWorkspaceContext()
  const {
    companies,
    selectedId,
    setSelectedId,
    getPayload,
    editingId,
    setEditingId,
    editingName,
    setEditingName,
    syncing,
    statusMessage,
    setStatusMessage,
    loadError,
    persistCompany,
    handleCreate,
    handleDelete,
    commitRename,
  } = workspace

  const {
    tasks,
    loading: tasksLoading,
    refreshTasks,
  } = useVetraOutreachTasks()

  const [draft, setDraft] = useState(createEmptyCompanyIntroduction())
  const [saved, setSaved] = useState(createEmptyCompanyIntroduction())
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const importAbortRef = useRef<AbortController | null>(null)
  const skipDraftLoadRef = useRef(false)

  useEffect(() => {
    skipDraftLoadRef.current = false
  }, [selectedId])

  useEffect(() => {
    if (!selectedId || skipDraftLoadRef.current) return
    const introduction = getPayload(selectedId).introduction
    setDraft(introduction)
    setSaved(introduction)
  }, [selectedId, syncing, getPayload])

  useEffect(() => {
    return () => {
      importAbortRef.current?.abort()
    }
  }, [])

  const handleCancel = () => {
    skipDraftLoadRef.current = false
    setDraft(saved)
    setStatusMessage(null)
  }

  const handleSave = () => {
    const company = companies.find((item) => item.id === selectedId)
    if (!company) return

    const payload = getPayload(selectedId)
    const nextPayload = { ...payload, introduction: draft }

    setSaved(draft)
    setStatusMessage('Saving…')

    void (async () => {
      try {
        await persistCompany(company.id, company.name, nextPayload)
        skipDraftLoadRef.current = false
        setStatusMessage('Saved to Neon')
      } catch (error) {
        const restored = getPayload(selectedId).introduction
        setDraft(restored)
        setSaved(restored)
        setStatusMessage(
          error instanceof Error ? error.message : 'Failed to save introduction',
        )
      }
    })()
  }

  const handleOpenImport = () => {
    if (!selectedId) {
      setStatusMessage('Select or create a company first')
      return
    }
    setStatusMessage(null)
    void refreshTasks(true)
    setImportOpen(true)
  }

  const handleImportTask = (task: VetraOutreachTaskOption) => {
    const company = companies.find((item) => item.id === selectedId)
    if (!company) {
      setStatusMessage('Select or create a company first')
      return
    }

    importAbortRef.current?.abort()
    const controller = new AbortController()
    importAbortRef.current = controller
    setImporting(true)
    setStatusMessage('Importing from Task…')

    void (async () => {
      try {
        const taskText = await loadTaskContentForFinDoc(
          task.projectId,
          task.record.id,
        )
        const introduction = await generateCompanyIntroFromTask(taskText, {
          companyName: company.name,
          signal: controller.signal,
        })

        skipDraftLoadRef.current = true
        setDraft(introduction)
        setSaved(introduction)

        const payload = getPayload(company.id)
        await persistCompany(company.id, company.name, {
          ...payload,
          introduction,
        })

        setStatusMessage('Imported from Task and saved')
        setImportOpen(false)
      } catch (error) {
        if (controller.signal.aborted) return
        skipDraftLoadRef.current = false
        setStatusMessage(
          error instanceof Error ? error.message : 'Failed to import from Task',
        )
      } finally {
        if (importAbortRef.current === controller) {
          importAbortRef.current = null
          setImporting(false)
        }
      }
    })()
  }

  const startEdit = (company: VetraCompany) => {
    setEditingId(company.id)
    setEditingName(company.name)
  }

  const listStatusMessage = loadError ?? (syncing ? 'Syncing…' : null)
  const listStatusIsError = Boolean(loadError)
  const bannerMessage = listStatusMessage
  const bannerIsError = listStatusIsError

  return (
    <div className="vetra-companies-view">
      <section className="vetra-companies-center" aria-label="Company introduction workspace">
        <VetraCompanyIntroEditor
          value={draft}
          saving={importing}
          statusMessage={statusMessage ?? bannerMessage}
          statusIsError={bannerIsError}
          onChange={(next) => {
            setDraft(next)
            setStatusMessage(null)
          }}
          onCancel={handleCancel}
          onSave={() => void handleSave()}
        />
      </section>

      <VetraCompanyListPanel
        title="Companies"
        listLabel="Company list"
        createLabel="Create company"
        importLabel="Import from Task"
        renameLabel="Rename company"
        deleteLabel="Delete company"
        companies={companies}
        selectedId={selectedId}
        editingId={editingId}
        editingName={editingName}
        importing={importing}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onImport={handleOpenImport}
        onStartEdit={startEdit}
        onEditingNameChange={setEditingName}
        onCommitRename={() => void commitRename()}
        onCancelRename={() => {
          setEditingId(null)
          setEditingName('')
        }}
        onDelete={(company) => void handleDelete(company.id, company.name)}
        statusMessage={listStatusMessage}
        statusIsError={listStatusIsError}
      />

      <VetraTaskImportModal
        open={importOpen}
        tasks={tasks}
        loading={tasksLoading}
        importing={importing}
        onClose={() => {
          if (importing) return
          setImportOpen(false)
        }}
        onConfirm={handleImportTask}
      />
    </div>
  )
}
