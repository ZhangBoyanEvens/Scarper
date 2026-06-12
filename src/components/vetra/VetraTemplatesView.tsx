import { useEffect, useState } from 'react'
import '../../styles/panel.css'
import '../../styles/scrollbar.css'
import '../projects/ProjectPage.css'
import { recordToEmailTemplate } from '../../services/vetraTemplateApi'
import type { VetraEmailTemplate } from './vetraEmailTemplate'
import { DEFAULT_EMAIL_TEMPLATE } from './vetraEmailTemplate'
import { VetraCompanyListPanel } from './VetraCompanyListPanel'
import { VetraEmailTemplateEditor } from './VetraEmailTemplateEditor'
import type { VetraTemplate } from './templatesData'
import { useVetraTemplateWorkspaceContext } from './VetraWorkspaceContext'
import './VetraCompaniesView.css'

function cloneTemplate(template: VetraEmailTemplate): VetraEmailTemplate {
  return { subject: template.subject, body: template.body }
}

export function VetraTemplatesView() {
  const workspace = useVetraTemplateWorkspaceContext()
  const {
    templates,
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
    persistTemplate,
    handleCreate,
    handleDelete,
    commitRename,
    updatePayload,
  } = workspace

  const [draft, setDraft] = useState<VetraEmailTemplate>(() =>
    cloneTemplate(DEFAULT_EMAIL_TEMPLATE),
  )
  const [saved, setSaved] = useState<VetraEmailTemplate>(() =>
    cloneTemplate(DEFAULT_EMAIL_TEMPLATE),
  )

  useEffect(() => {
    if (!selectedId) return
    const template = recordToEmailTemplate(getPayload(selectedId))
    setDraft(cloneTemplate(template))
    setSaved(cloneTemplate(template))
  }, [selectedId, getPayload])

  const handleCancel = () => {
    setDraft(cloneTemplate(saved))
    setStatusMessage(null)
  }

  const handleSave = () => {
    const template = templates.find((item) => item.id === selectedId)
    if (!template) return

    const nextPayload = {
      subject: draft.subject,
      body: draft.body,
    }
    const next = cloneTemplate(draft)

    updatePayload(template.id, nextPayload)
    setSaved(next)
    setStatusMessage('Saving…')

    void (async () => {
      try {
        await persistTemplate(template.id, template.name, nextPayload)
        setStatusMessage('Saved to Neon')
      } catch (error) {
        const restored = recordToEmailTemplate(getPayload(selectedId))
        setDraft(cloneTemplate(restored))
        setSaved(cloneTemplate(restored))
        setStatusMessage(
          error instanceof Error ? error.message : 'Failed to save template',
        )
      }
    })()
  }

  const startEdit = (item: VetraTemplate) => {
    setEditingId(item.id)
    setEditingName(item.name)
  }

  const bannerMessage = loadError ?? (syncing ? 'Syncing…' : null)
  const bannerIsError = Boolean(loadError)

  const listStatusMessage = loadError ?? (syncing ? 'Syncing…' : null)
  const listStatusIsError = Boolean(loadError)

  return (
    <div className="vetra-companies-view">
      <section className="vetra-companies-center" aria-label="Email template workspace">
        <VetraEmailTemplateEditor
          template={draft}
          saving={false}
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
        title="Templates"
        listLabel="Template list"
        createLabel="Create template"
        renameLabel="Rename template"
        deleteLabel="Delete template"
        companies={templates}
        selectedId={selectedId}
        editingId={editingId}
        editingName={editingName}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onStartEdit={startEdit}
        onEditingNameChange={setEditingName}
        onCommitRename={() => void commitRename()}
        onCancelRename={() => {
          setEditingId(null)
          setEditingName('')
        }}
        onDelete={(item) => void handleDelete(item.id, item.name)}
        statusMessage={listStatusMessage}
        statusIsError={listStatusIsError}
      />
    </div>
  )
}
