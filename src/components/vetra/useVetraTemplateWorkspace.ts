import { useCallback, useEffect, useRef, useState } from 'react'
import { isClerkConfigured } from '../../config/clerk'
import { subscribeVetraAuthReady } from './vetraAuthReady'
import {
  deleteVetraTemplate,
  fetchVetraTemplates,
  recordToTemplatePayload,
  saveVetraTemplate,
  type VetraTemplatePayload,
  type VetraTemplateRecord,
} from '../../services/vetraTemplateApi'
import { type VetraTemplate } from './templatesData'
import { createEmptyEmailTemplate } from './vetraEmailTemplate'
import {
  buildEmptyTemplateWorkspace,
  buildOptimisticTemplateWorkspace,
  isOptimisticTemplateId,
} from './vetraTemplateWorkspaceState'
import {
  prefetchVetraTemplateWorkspace,
  readVetraTemplateWorkspaceCache,
  recordsToTemplateWorkspaceSnapshot,
  writeVetraTemplateWorkspaceCache,
} from './vetraTemplateWorkspaceCache'
import {
  fetchWithEmptyRetry,
  protectedRecordCount,
  shouldSkipSyncApply,
} from './vetraWorkspaceSync'

function nextTemplateId(): string {
  return crypto.randomUUID()
}

function defaultTemplateName(count: number): string {
  return `Template ${count}`
}

function clonePayload(payload: VetraTemplatePayload): VetraTemplatePayload {
  return { subject: payload.subject, body: payload.body }
}

interface WorkspaceSnapshot {
  templates: VetraTemplate[]
  selectedId: string
  payloadById: Record<string, VetraTemplatePayload>
  editingId: string | null
  editingName: string
}

function snapshotWorkspace(
  templates: VetraTemplate[],
  selectedId: string,
  payloadById: Record<string, VetraTemplatePayload>,
  editingId: string | null,
  editingName: string,
): WorkspaceSnapshot {
  return {
    templates: templates.map((template) => ({ ...template })),
    selectedId,
    payloadById: Object.fromEntries(
      Object.entries(payloadById).map(([id, payload]) => [id, clonePayload(payload)]),
    ),
    editingId,
    editingName,
  }
}

function resolveInitialWorkspace() {
  const cached = readVetraTemplateWorkspaceCache()
  if (cached) {
    return {
      templates: cached.templates,
      selectedId: cached.selectedId,
      payloadById: cached.payloadById,
      hasCache: true,
    }
  }

  if (isClerkConfigured) {
    const empty = buildEmptyTemplateWorkspace()
    return {
      templates: empty.templates,
      selectedId: empty.selectedId,
      payloadById: empty.payloadById,
      hasCache: false,
    }
  }

  const optimistic = buildOptimisticTemplateWorkspace()
  return {
    templates: optimistic.templates,
    selectedId: optimistic.selectedId,
    payloadById: optimistic.payloadById,
    hasCache: false,
  }
}

function isNeonAuthError(error: unknown): boolean {
  return error instanceof Error && error.name === 'NeonAuthError'
}

export function useVetraTemplateWorkspace() {
  const [authReady, setAuthReady] = useState(!isClerkConfigured)
  const authRetryRef = useRef(0)
  const initial = resolveInitialWorkspace()
  const [templates, setTemplates] = useState<VetraTemplate[]>(initial.templates)
  const [selectedId, setSelectedId] = useState<string>(initial.selectedId)
  const [payloadById, setPayloadById] = useState<Record<string, VetraTemplatePayload>>(
    initial.payloadById,
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [syncing, setSyncing] = useState(!initial.hasCache)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const syncGenerationRef = useRef(0)
  const templatesRef = useRef(initial.templates)
  const mutationSeqRef = useRef(0)

  templatesRef.current = templates

  const bumpMutation = () => {
    mutationSeqRef.current += 1
  }

  useEffect(() => subscribeVetraAuthReady(() => setAuthReady(true)), [])

  const persistCache = useCallback(
    (
      nextTemplates: VetraTemplate[],
      nextSelectedId: string,
      nextPayloadById: Record<string, VetraTemplatePayload>,
    ) => {
      if (nextTemplates.length === 0) return
      writeVetraTemplateWorkspaceCache({
        templates: nextTemplates,
        selectedId: nextSelectedId,
        payloadById: nextPayloadById,
      })
    },
    [],
  )

  const applyRecords = useCallback(
    (records: VetraTemplateRecord[]) => {
      setSelectedId((current) => {
        const snapshot = recordsToTemplateWorkspaceSnapshot(records, current)
        setTemplates(snapshot.templates)
        setPayloadById(snapshot.payloadById)
        persistCache(snapshot.templates, snapshot.selectedId, snapshot.payloadById)
        return snapshot.selectedId
      })
    },
    [persistCache],
  )

  const restoreSnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    setTemplates(snapshot.templates)
    setSelectedId(snapshot.selectedId)
    setPayloadById(snapshot.payloadById)
    setEditingId(snapshot.editingId)
    setEditingName(snapshot.editingName)
    persistCache(snapshot.templates, snapshot.selectedId, snapshot.payloadById)
  }, [persistCache])

  const reconcileRecord = useCallback(
    (record: VetraTemplateRecord, previousTemplateId: string) => {
      setTemplates((prev) => {
        const withoutPrevious = prev.filter((template) => template.id !== previousTemplateId)
        const exists = withoutPrevious.some((template) => template.id === record.id)
        const nextTemplates = exists
          ? withoutPrevious.map((template) =>
              template.id === record.id
                ? { id: record.id, name: record.name }
                : template,
            )
          : [...withoutPrevious, { id: record.id, name: record.name }]

        setPayloadById((prevPayloads) => {
          const nextPayloads = { ...prevPayloads }
          if (previousTemplateId !== record.id) {
            delete nextPayloads[previousTemplateId]
          }
          nextPayloads[record.id] = recordToTemplatePayload(record)
          persistCache(nextTemplates, record.id, nextPayloads)
          return nextPayloads
        })

        return nextTemplates
      })
      setSelectedId(record.id)
      setEditingId((current) => {
        if (current === previousTemplateId) {
          setEditingName(record.name)
          return record.id
        }
        return current
      })
    },
    [persistCache],
  )

  useEffect(() => {
    if (!authReady) return

    const generation = ++syncGenerationRef.current
    let cancelled = false

    const syncFromServer = async () => {
      const syncMutation = mutationSeqRef.current
      const prefetched = await prefetchVetraTemplateWorkspace()
      if (cancelled || generation !== syncGenerationRef.current) return

      if (prefetched && !initial.hasCache) {
        setTemplates(prefetched.templates)
        setPayloadById(prefetched.payloadById)
        setSelectedId(prefetched.selectedId)
        setSyncing(false)
      }

      setSyncing(true)
      setLoadError(null)
      try {
        const protectedCount = protectedRecordCount(
          readVetraTemplateWorkspaceCache()?.templates.length ?? 0,
          templatesRef.current.length,
        )
        const records = await fetchWithEmptyRetry(
          fetchVetraTemplates,
          protectedCount,
        )

        if (
          shouldSkipSyncApply(
            records.length,
            protectedRecordCount(
              readVetraTemplateWorkspaceCache()?.templates.length ?? 0,
              templatesRef.current.length,
            ),
            mutationSeqRef.current !== syncMutation,
          )
        ) {
          if (!cancelled && generation === syncGenerationRef.current) {
            if (records.length === 0 && protectedCount > 0) {
              setLoadError('Could not refresh templates — kept your saved data')
            }
          }
          return
        }

        if (!cancelled && generation === syncGenerationRef.current) {
          applyRecords(records)
          setLoadError(null)
          authRetryRef.current = 0
        }
      } catch (error) {
        if (!cancelled && generation === syncGenerationRef.current) {
          if (isNeonAuthError(error) && authRetryRef.current < 4) {
            authRetryRef.current += 1
            setLoadError(null)
            window.setTimeout(() => {
              if (!cancelled && generation === syncGenerationRef.current) {
                void syncFromServer()
              }
            }, 600 * authRetryRef.current)
            return
          }
          if (isNeonAuthError(error)) {
            setLoadError('Unable to authenticate — refresh the page or sign in again')
            return
          }
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load templates',
          )
        }
      } finally {
        if (!cancelled && generation === syncGenerationRef.current) {
          setSyncing(false)
        }
      }
    }

    void syncFromServer()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync when auth becomes ready
  }, [applyRecords, authReady])

  const getPayload = useCallback(
    (templateId: string): VetraTemplatePayload =>
      payloadById[templateId] ?? createEmptyEmailTemplate(),
    [payloadById],
  )

  const persistTemplate = async (
    templateId: string,
    name: string,
    payload: VetraTemplatePayload,
  ) => {
    const rollback = snapshotWorkspace(
      templates,
      selectedId,
      payloadById,
      editingId,
      editingName,
    )

    const nextTemplates = templates.some((template) => template.id === templateId)
      ? templates.map((template) =>
          template.id === templateId ? { id: templateId, name } : template,
        )
      : [...templates, { id: templateId, name }]

    setTemplates(nextTemplates)
    setPayloadById((prev) => {
      const next = { ...prev, [templateId]: clonePayload(payload) }
      persistCache(nextTemplates, templateId, next)
      return next
    })
    setSelectedId(templateId)

    try {
      const record = await saveVetraTemplate({
        id: isOptimisticTemplateId(templateId) ? undefined : templateId,
        name,
        subject: payload.subject,
        body: payload.body,
      })
      reconcileRecord(record, templateId)
      return record
    } catch (error) {
      restoreSnapshot(rollback)
      throw error
    }
  }

  const handleCreate = () => {
    bumpMutation()
    const id = nextTemplateId()
    const name = defaultTemplateName(templates.length + 1)
    const payload: VetraTemplatePayload = createEmptyEmailTemplate()
    const rollback = snapshotWorkspace(
      templates,
      selectedId,
      payloadById,
      editingId,
      editingName,
    )

    const nextTemplates = [...templates, { id, name }]
    const nextPayloadById = { ...payloadById, [id]: clonePayload(payload) }

    setTemplates(nextTemplates)
    setPayloadById(nextPayloadById)
    setSelectedId(id)
    setEditingId(id)
    setEditingName(name)
    setStatusMessage('Creating…')
    persistCache(nextTemplates, id, nextPayloadById)

    void (async () => {
      try {
        const record = await saveVetraTemplate({
          id,
          name,
          subject: payload.subject,
          body: payload.body,
        })
        reconcileRecord(record, id)
        setStatusMessage('Template created')
      } catch (error) {
        restoreSnapshot(rollback)
        setStatusMessage(
          error instanceof Error ? error.message : 'Failed to create template',
        )
      }
    })()
  }

  const commitRename = () => {
    if (!editingId) return
    const trimmed = editingName.trim()
    const template = templates.find((item) => item.id === editingId)
    if (!trimmed || !template || trimmed === template.name) {
      setEditingId(null)
      setEditingName('')
      return
    }

    const targetId = editingId
    const rollback = snapshotWorkspace(
      templates,
      selectedId,
      payloadById,
      editingId,
      editingName,
    )
    const nextTemplates = templates.map((item) =>
      item.id === targetId ? { ...item, name: trimmed } : item,
    )

    setTemplates(nextTemplates)
    persistCache(nextTemplates, selectedId, payloadById)
    setEditingId(null)
    setEditingName('')
    setStatusMessage('Renaming…')

    void (async () => {
      try {
        await persistTemplate(targetId, trimmed, getPayload(targetId))
        setStatusMessage('Template renamed')
      } catch (error) {
        restoreSnapshot(rollback)
        setStatusMessage(
          error instanceof Error ? error.message : 'Failed to rename template',
        )
      }
    })()
  }

  const updatePayload = (templateId: string, payload: VetraTemplatePayload) => {
    setPayloadById((prev) => {
      const next = { ...prev, [templateId]: clonePayload(payload) }
      persistCache(templates, selectedId, next)
      return next
    })
  }

  const handleDelete = (templateId: string, templateName: string) => {
    if (!window.confirm(`Delete template "${templateName}"?`)) return

    bumpMutation()
    const rollback = snapshotWorkspace(
      templates,
      selectedId,
      payloadById,
      editingId,
      editingName,
    )
    const remaining = templates.filter((template) => template.id !== templateId)
    const nextPayloadById = { ...payloadById }
    delete nextPayloadById[templateId]
    const nextSelectedId =
      selectedId === templateId ? (remaining[0]?.id ?? '') : selectedId

    setTemplates(remaining)
    setPayloadById(nextPayloadById)
    setSelectedId(nextSelectedId)
    if (editingId === templateId) {
      setEditingId(null)
      setEditingName('')
    }
    persistCache(remaining, nextSelectedId, nextPayloadById)
    setStatusMessage('Template deleted')

    if (isOptimisticTemplateId(templateId)) return

    void (async () => {
      try {
        await deleteVetraTemplate(templateId)
      } catch (error) {
        restoreSnapshot(rollback)
        setStatusMessage(
          error instanceof Error ? error.message : 'Failed to delete template',
        )
      }
    })()
  }

  return {
    templates,
    selectedId,
    setSelectedId,
    payloadById,
    getPayload,
    editingId,
    setEditingId,
    editingName,
    setEditingName,
    syncing,
    saving,
    setSaving,
    statusMessage,
    setStatusMessage,
    loadError,
    persistTemplate,
    handleCreate,
    handleDelete,
    commitRename,
    updatePayload,
    clonePayload,
  }
}
