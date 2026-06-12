import { isClerkConfigured } from '../../config/clerk'
import { resolveAuthToken } from '../../services/authToken'
import { scopedStorageKey } from '../../storage/userScope'
import {
  fetchVetraTemplates,
  recordToTemplatePayload,
  type VetraTemplatePayload,
  type VetraTemplateRecord,
} from '../../services/vetraTemplateApi'
import type { VetraTemplate } from './templatesData'

export interface VetraTemplateWorkspaceSnapshot {
  templates: VetraTemplate[]
  selectedId: string
  payloadById: Record<string, VetraTemplatePayload>
  fetchedAt: number
}

const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000
const STORAGE_KEY_BASE = 'scarper.vetra.templates.snapshot'

let memoryCache: VetraTemplateWorkspaceSnapshot | null = null
let prefetchPromise: Promise<VetraTemplateWorkspaceSnapshot | null> | null = null

function readPersistentSnapshot(): VetraTemplateWorkspaceSnapshot | null {
  try {
    const raw = localStorage.getItem(scopedStorageKey(STORAGE_KEY_BASE))
    if (!raw) return null
    const parsed = JSON.parse(raw) as VetraTemplateWorkspaceSnapshot
    if (!Array.isArray(parsed.templates) || parsed.templates.length === 0) return null
    if (!parsed.payloadById || typeof parsed.payloadById !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writePersistentSnapshot(
  snapshot: Omit<VetraTemplateWorkspaceSnapshot, 'fetchedAt'>,
): void {
  try {
    localStorage.setItem(
      scopedStorageKey(STORAGE_KEY_BASE),
      JSON.stringify({ ...snapshot, fetchedAt: Date.now() }),
    )
  } catch {
    /* ignore quota / private mode */
  }
}

export function recordsToTemplateWorkspaceSnapshot(
  records: VetraTemplateRecord[],
  selectedId?: string,
): VetraTemplateWorkspaceSnapshot {
  const templates = records.map((record) => ({
    id: record.id,
    name: record.name,
  }))
  const payloadById = Object.fromEntries(
    records.map((record) => [record.id, recordToTemplatePayload(record)]),
  )
  const resolvedSelectedId =
    selectedId && templates.some((template) => template.id === selectedId)
      ? selectedId
      : (templates[0]?.id ?? '')

  return {
    templates,
    selectedId: resolvedSelectedId,
    payloadById,
    fetchedAt: Date.now(),
  }
}

export function readVetraTemplateWorkspaceCache(): VetraTemplateWorkspaceSnapshot | null {
  if (memoryCache && Date.now() - memoryCache.fetchedAt <= MEMORY_CACHE_TTL_MS) {
    return memoryCache
  }

  memoryCache = null
  return readPersistentSnapshot()
}

export function writeVetraTemplateWorkspaceCache(
  snapshot: Omit<VetraTemplateWorkspaceSnapshot, 'fetchedAt'>,
): void {
  if (snapshot.templates.length === 0) return
  memoryCache = { ...snapshot, fetchedAt: Date.now() }
  writePersistentSnapshot(snapshot)
}

export function invalidateVetraTemplateWorkspaceCache(): void {
  memoryCache = null
  prefetchPromise = null
}

export async function prefetchVetraTemplateWorkspace(): Promise<VetraTemplateWorkspaceSnapshot | null> {
  const existing = readVetraTemplateWorkspaceCache()
  if (existing) return existing
  if (prefetchPromise) return prefetchPromise

  if (isClerkConfigured) {
    const token = await resolveAuthToken()
    if (!token) return readPersistentSnapshot()
  }

  prefetchPromise = (async () => {
    try {
      const records = await fetchVetraTemplates()
      if (records.length === 0) return readPersistentSnapshot()
      const snapshot = recordsToTemplateWorkspaceSnapshot(records)
      memoryCache = snapshot
      writePersistentSnapshot(snapshot)
      return snapshot
    } catch {
      return readPersistentSnapshot()
    } finally {
      prefetchPromise = null
    }
  })()

  return prefetchPromise
}
