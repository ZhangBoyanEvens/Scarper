import { useCallback, useEffect, useRef, useState } from 'react'
import { isClerkConfigured } from '../../config/clerk'
import { subscribeVetraAuthReady } from './vetraAuthReady'
import {
  deleteVetraCompany,
  fetchVetraCompanies,
  recordToCompanyPayload,
  saveVetraCompany,
  type VetraCompanyPayload,
  type VetraCompanyRecord,
} from '../../services/vetraCompanyApi'
import { type VetraCompany } from './companiesData'
import {
  buildEmptyCompanyWorkspace,
  buildOptimisticCompanyWorkspace,
  isOptimisticCompanyId,
} from './vetraWorkspaceState'
import {
  createEmptyCompanyIntroduction,
} from './vetraEmailTemplate'
import {
  prefetchVetraWorkspace,
  readVetraWorkspaceCache,
  recordsToWorkspaceSnapshot,
  writeVetraWorkspaceCache,
} from './vetraWorkspaceCache'
import {
  fetchWithEmptyRetry,
  protectedRecordCount,
  shouldSkipSyncApply,
} from './vetraWorkspaceSync'

function nextCompanyId(): string {
  return crypto.randomUUID()
}

function defaultCompanyName(count: number): string {
  return `Company ${count}`
}

function clonePayload(payload: VetraCompanyPayload): VetraCompanyPayload {
  return { introduction: payload.introduction }
}

interface WorkspaceSnapshot {
  companies: VetraCompany[]
  selectedId: string
  payloadById: Record<string, VetraCompanyPayload>
  editingId: string | null
  editingName: string
}

function snapshotWorkspace(
  companies: VetraCompany[],
  selectedId: string,
  payloadById: Record<string, VetraCompanyPayload>,
  editingId: string | null,
  editingName: string,
): WorkspaceSnapshot {
  return {
    companies: companies.map((company) => ({ ...company })),
    selectedId,
    payloadById: Object.fromEntries(
      Object.entries(payloadById).map(([id, payload]) => [id, clonePayload(payload)]),
    ),
    editingId,
    editingName,
  }
}

function resolveInitialWorkspace() {
  const cached = readVetraWorkspaceCache()
  if (cached) {
    return {
      companies: cached.companies,
      selectedId: cached.selectedId,
      payloadById: cached.payloadById,
      hasCache: true,
    }
  }

  if (isClerkConfigured) {
    const empty = buildEmptyCompanyWorkspace()
    return {
      companies: empty.companies,
      selectedId: empty.selectedId,
      payloadById: empty.payloadById,
      hasCache: false,
    }
  }

  const optimistic = buildOptimisticCompanyWorkspace()
  return {
    companies: optimistic.companies,
    selectedId: optimistic.selectedId,
    payloadById: optimistic.payloadById,
    hasCache: false,
  }
}

function isNeonAuthError(error: unknown): boolean {
  return error instanceof Error && error.name === 'NeonAuthError'
}

export function useVetraCompanyWorkspace() {
  const [authReady, setAuthReady] = useState(!isClerkConfigured)
  const authRetryRef = useRef(0)
  const initial = resolveInitialWorkspace()
  const [companies, setCompanies] = useState<VetraCompany[]>(initial.companies)
  const [selectedId, setSelectedId] = useState<string>(initial.selectedId)
  const [payloadById, setPayloadById] = useState<Record<string, VetraCompanyPayload>>(
    initial.payloadById,
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [syncing, setSyncing] = useState(!initial.hasCache)
  const [saving, setSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const syncGenerationRef = useRef(0)
  const companiesRef = useRef(initial.companies)
  const mutationSeqRef = useRef(0)

  companiesRef.current = companies

  const bumpMutation = () => {
    mutationSeqRef.current += 1
  }

  useEffect(() => subscribeVetraAuthReady(() => setAuthReady(true)), [])

  const persistCache = useCallback(
    (
      nextCompanies: VetraCompany[],
      nextSelectedId: string,
      nextPayloadById: Record<string, VetraCompanyPayload>,
    ) => {
      if (nextCompanies.length === 0) return
      writeVetraWorkspaceCache({
        companies: nextCompanies,
        selectedId: nextSelectedId,
        payloadById: nextPayloadById,
      })
    },
    [],
  )

  const applyRecords = useCallback(
    (records: VetraCompanyRecord[]) => {
      setSelectedId((current) => {
        const snapshot = recordsToWorkspaceSnapshot(records, current)
        setCompanies(snapshot.companies)
        setPayloadById(snapshot.payloadById)
        persistCache(snapshot.companies, snapshot.selectedId, snapshot.payloadById)
        return snapshot.selectedId
      })
    },
    [persistCache],
  )

  const restoreSnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    setCompanies(snapshot.companies)
    setSelectedId(snapshot.selectedId)
    setPayloadById(snapshot.payloadById)
    setEditingId(snapshot.editingId)
    setEditingName(snapshot.editingName)
    persistCache(snapshot.companies, snapshot.selectedId, snapshot.payloadById)
  }, [persistCache])

  const reconcileRecord = useCallback(
    (record: VetraCompanyRecord, previousCompanyId: string) => {
      setCompanies((prev) => {
        const withoutPrevious = prev.filter((company) => company.id !== previousCompanyId)
        const exists = withoutPrevious.some((company) => company.id === record.id)
        const nextCompanies = exists
          ? withoutPrevious.map((company) =>
              company.id === record.id
                ? { id: record.id, name: record.name }
                : company,
            )
          : [...withoutPrevious, { id: record.id, name: record.name }]

        setPayloadById((prevPayloads) => {
          const nextPayloads = { ...prevPayloads }
          if (previousCompanyId !== record.id) {
            delete nextPayloads[previousCompanyId]
          }
          nextPayloads[record.id] = recordToCompanyPayload(record)
          persistCache(nextCompanies, record.id, nextPayloads)
          return nextPayloads
        })

        return nextCompanies
      })
      setSelectedId(record.id)
      setEditingId((current) => {
        if (current === previousCompanyId) {
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
      const prefetched = await prefetchVetraWorkspace()
      if (cancelled || generation !== syncGenerationRef.current) return

      if (prefetched && !initial.hasCache) {
        setCompanies(prefetched.companies)
        setPayloadById(prefetched.payloadById)
        setSelectedId(prefetched.selectedId)
        setSyncing(false)
      }

      setSyncing(true)
      setLoadError(null)
      try {
        const protectedCount = protectedRecordCount(
          readVetraWorkspaceCache()?.companies.length ?? 0,
          companiesRef.current.length,
        )
        const records = await fetchWithEmptyRetry(
          fetchVetraCompanies,
          protectedCount,
        )

        if (
          shouldSkipSyncApply(
            records.length,
            protectedRecordCount(
              readVetraWorkspaceCache()?.companies.length ?? 0,
              companiesRef.current.length,
            ),
            mutationSeqRef.current !== syncMutation,
          )
        ) {
          if (!cancelled && generation === syncGenerationRef.current) {
            if (records.length === 0 && protectedCount > 0) {
              setLoadError('Could not refresh companies — kept your saved data')
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
            error instanceof Error ? error.message : 'Failed to load companies',
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
    (companyId: string): VetraCompanyPayload =>
      payloadById[companyId] ?? {
        introduction: createEmptyCompanyIntroduction(),
      },
    [payloadById],
  )

  const persistCompany = async (
    companyId: string,
    name: string,
    payload: VetraCompanyPayload,
  ) => {
    const rollback = snapshotWorkspace(
      companies,
      selectedId,
      payloadById,
      editingId,
      editingName,
    )

    const nextCompanies = companies.some((company) => company.id === companyId)
      ? companies.map((company) =>
          company.id === companyId ? { id: companyId, name } : company,
        )
      : [...companies, { id: companyId, name }]

    setCompanies(nextCompanies)
    setPayloadById((prev) => {
      const next = { ...prev, [companyId]: clonePayload(payload) }
      persistCache(nextCompanies, companyId, next)
      return next
    })
    setSelectedId(companyId)

    try {
      const record = await saveVetraCompany({
        id: isOptimisticCompanyId(companyId) ? undefined : companyId,
        name,
        introduction: payload.introduction,
      })
      reconcileRecord(record, companyId)
      return record
    } catch (error) {
      restoreSnapshot(rollback)
      throw error
    }
  }

  const handleCreate = () => {
    bumpMutation()
    const id = nextCompanyId()
    const name = defaultCompanyName(companies.length + 1)
    const payload: VetraCompanyPayload = {
      introduction: createEmptyCompanyIntroduction(),
    }
    const rollback = snapshotWorkspace(
      companies,
      selectedId,
      payloadById,
      editingId,
      editingName,
    )

    const nextCompanies = [...companies, { id, name }]
    const nextPayloadById = { ...payloadById, [id]: clonePayload(payload) }

    setCompanies(nextCompanies)
    setPayloadById(nextPayloadById)
    setSelectedId(id)
    setEditingId(id)
    setEditingName(name)
    setStatusMessage('Creating…')
    persistCache(nextCompanies, id, nextPayloadById)

    void (async () => {
      try {
        const record = await saveVetraCompany({
          id,
          name,
          introduction: payload.introduction,
        })
        reconcileRecord(record, id)
        setStatusMessage('Company created')
      } catch (error) {
        restoreSnapshot(rollback)
        setStatusMessage(
          error instanceof Error ? error.message : 'Failed to create company',
        )
      }
    })()
  }

  const commitRename = () => {
    if (!editingId) return
    const trimmed = editingName.trim()
    const company = companies.find((item) => item.id === editingId)
    if (!trimmed || !company || trimmed === company.name) {
      setEditingId(null)
      setEditingName('')
      return
    }

    const targetId = editingId
    const rollback = snapshotWorkspace(
      companies,
      selectedId,
      payloadById,
      editingId,
      editingName,
    )
    const nextCompanies = companies.map((item) =>
      item.id === targetId ? { ...item, name: trimmed } : item,
    )

    setCompanies(nextCompanies)
    persistCache(nextCompanies, selectedId, payloadById)
    setEditingId(null)
    setEditingName('')
    setStatusMessage('Renaming…')

    void (async () => {
      try {
        await persistCompany(targetId, trimmed, getPayload(targetId))
        setStatusMessage('Company renamed')
      } catch (error) {
        restoreSnapshot(rollback)
        setStatusMessage(
          error instanceof Error ? error.message : 'Failed to rename company',
        )
      }
    })()
  }

  const updatePayload = (companyId: string, payload: VetraCompanyPayload) => {
    setPayloadById((prev) => {
      const next = { ...prev, [companyId]: clonePayload(payload) }
      persistCache(companies, selectedId, next)
      return next
    })
  }

  const handleDelete = (companyId: string, companyName: string) => {
    if (!window.confirm(`Delete company "${companyName}"?`)) return

    bumpMutation()
    const rollback = snapshotWorkspace(
      companies,
      selectedId,
      payloadById,
      editingId,
      editingName,
    )
    const remaining = companies.filter((company) => company.id !== companyId)
    const nextPayloadById = { ...payloadById }
    delete nextPayloadById[companyId]
    const nextSelectedId =
      selectedId === companyId ? (remaining[0]?.id ?? '') : selectedId

    setCompanies(remaining)
    setPayloadById(nextPayloadById)
    setSelectedId(nextSelectedId)
    if (editingId === companyId) {
      setEditingId(null)
      setEditingName('')
    }
    persistCache(remaining, nextSelectedId, nextPayloadById)
    setStatusMessage('Company deleted')

    if (isOptimisticCompanyId(companyId)) return

    void (async () => {
      try {
        await deleteVetraCompany(companyId)
      } catch (error) {
        restoreSnapshot(rollback)
        setStatusMessage(
          error instanceof Error ? error.message : 'Failed to delete company',
        )
      }
    })()
  }

  return {
    companies,
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
    persistCompany,
    handleCreate,
    handleDelete,
    commitRename,
    updatePayload,
    clonePayload,
  }
}
