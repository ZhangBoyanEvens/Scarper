import { isClerkConfigured } from '../../config/clerk'
import { resolveAuthToken } from '../../services/authToken'
import { scopedStorageKey } from '../../storage/userScope'
import {
  fetchVetraCompanies,
  recordToCompanyPayload,
  type VetraCompanyPayload,
  type VetraCompanyRecord,
} from '../../services/vetraCompanyApi'
import type { VetraCompany } from './companiesData'

export interface VetraWorkspaceSnapshot {
  companies: VetraCompany[]
  selectedId: string
  payloadById: Record<string, VetraCompanyPayload>
  fetchedAt: number
}

const MEMORY_CACHE_TTL_MS = 10 * 60 * 1000
const STORAGE_KEY_BASE = 'scarper.vetra.companies.snapshot'

let memoryCache: VetraWorkspaceSnapshot | null = null
let prefetchPromise: Promise<VetraWorkspaceSnapshot | null> | null = null

function readPersistentSnapshot(): VetraWorkspaceSnapshot | null {
  try {
    const raw = localStorage.getItem(scopedStorageKey(STORAGE_KEY_BASE))
    if (!raw) return null
    const parsed = JSON.parse(raw) as VetraWorkspaceSnapshot
    if (!Array.isArray(parsed.companies) || parsed.companies.length === 0) return null
    if (!parsed.payloadById || typeof parsed.payloadById !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writePersistentSnapshot(
  snapshot: Omit<VetraWorkspaceSnapshot, 'fetchedAt'>,
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

export function recordsToWorkspaceSnapshot(
  records: VetraCompanyRecord[],
  selectedId?: string,
): VetraWorkspaceSnapshot {
  const companies = records.map((record) => ({
    id: record.id,
    name: record.name,
  }))
  const payloadById = Object.fromEntries(
    records.map((record) => [record.id, recordToCompanyPayload(record)]),
  )
  const resolvedSelectedId =
    selectedId && companies.some((company) => company.id === selectedId)
      ? selectedId
      : (companies[0]?.id ?? '')

  return {
    companies,
    selectedId: resolvedSelectedId,
    payloadById,
    fetchedAt: Date.now(),
  }
}

export function readVetraWorkspaceCache(): VetraWorkspaceSnapshot | null {
  if (memoryCache && Date.now() - memoryCache.fetchedAt <= MEMORY_CACHE_TTL_MS) {
    return memoryCache
  }

  memoryCache = null
  return readPersistentSnapshot()
}

export function writeVetraWorkspaceCache(
  snapshot: Omit<VetraWorkspaceSnapshot, 'fetchedAt'>,
): void {
  if (snapshot.companies.length === 0) return
  memoryCache = { ...snapshot, fetchedAt: Date.now() }
  writePersistentSnapshot(snapshot)
}

export function invalidateVetraWorkspaceCache(): void {
  memoryCache = null
  prefetchPromise = null
}

export async function prefetchVetraWorkspace(): Promise<VetraWorkspaceSnapshot | null> {
  const existing = readVetraWorkspaceCache()
  if (existing) return existing
  if (prefetchPromise) return prefetchPromise

  if (isClerkConfigured) {
    const token = await resolveAuthToken()
    if (!token) return readPersistentSnapshot()
  }

  prefetchPromise = (async () => {
    try {
      const records = await fetchVetraCompanies()
      if (records.length === 0) return readPersistentSnapshot()
      const snapshot = recordsToWorkspaceSnapshot(records)
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
