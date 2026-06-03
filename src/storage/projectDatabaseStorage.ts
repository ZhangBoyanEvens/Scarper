import type { ExtractResponse } from '../types/extraction'
import type { ProjectDatabaseEntry } from '../types/projectEntry'
import { scopedStorageKey } from './userScope'

const ENTRIES_BASE = 'scarper.projectDatabase.v1'
const SELECTED_PROJECT_BASE = 'scarper.scrape.selectedProjectId'

function entriesKey(): string {
  return scopedStorageKey(ENTRIES_BASE)
}

function selectedProjectKey(): string {
  return scopedStorageKey(SELECTED_PROJECT_BASE)
}

function readAll(): ProjectDatabaseEntry[] {
  try {
    const raw = localStorage.getItem(entriesKey())
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry)
  } catch {
    return []
  }
}

function isEntry(value: unknown): value is ProjectDatabaseEntry {
  if (!value || typeof value !== 'object') return false
  const e = value as ProjectDatabaseEntry
  return (
    typeof e.id === 'string' &&
    typeof e.projectId === 'string' &&
    typeof e.uploadedAt === 'string' &&
    Array.isArray(e.results)
  )
}

function writeAll(entries: ProjectDatabaseEntry[]): void {
  try {
    localStorage.setItem(entriesKey(), JSON.stringify(entries))
  } catch {
    /* ignore */
  }
}

export function getSelectedProjectId(): string | null {
  try {
    const id = localStorage.getItem(selectedProjectKey())
    return id && id.length > 0 ? id : null
  } catch {
    return null
  }
}

export function setSelectedProjectId(projectId: string | null): void {
  try {
    if (!projectId) {
      localStorage.removeItem(selectedProjectKey())
      return
    }
    localStorage.setItem(selectedProjectKey(), projectId)
  } catch {
    /* ignore */
  }
}

export function listEntriesForProject(projectId: string): ProjectDatabaseEntry[] {
  return readAll()
    .filter((e) => e.projectId === projectId)
    .sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    )
}

export function getProjectEntryLocal(
  projectId: string,
  entryId: string,
): ProjectDatabaseEntry | null {
  return (
    readAll().find((e) => e.projectId === projectId && e.id === entryId) ?? null
  )
}

export function deleteProjectEntriesLocal(projectId: string): void {
  writeAll(readAll().filter((e) => e.projectId !== projectId))
}

export function updateProjectEntryEditorLocal(
  projectId: string,
  entryId: string,
  editorText: string,
): boolean {
  const all = readAll()
  let updated = false
  const next = all.map((e) => {
    if (e.projectId === projectId && e.id === entryId) {
      updated = true
      return { ...e, editorText }
    }
    return e
  })
  if (!updated) return false
  writeAll(next)
  return true
}

export function deleteProjectEntryLocal(projectId: string, entryId: string): boolean {
  const all = readAll()
  const next = all.filter((e) => !(e.projectId === projectId && e.id === entryId))
  if (next.length === all.length) return false
  writeAll(next)
  return true
}

export function upsertProjectEntryLocal(entry: ProjectDatabaseEntry): void {
  const all = readAll()
  const index = all.findIndex(
    (e) => e.projectId === entry.projectId && e.id === entry.id,
  )
  if (index >= 0) {
    all[index] = { ...all[index], ...entry }
  } else {
    all.unshift(entry)
  }
  writeAll(all)
}

export function uploadResultsToProject(
  projectId: string,
  results: ExtractResponse[],
  includeBody = false,
  source = 'scrape',
): ProjectDatabaseEntry {
  const entry: ProjectDatabaseEntry = {
    id: crypto.randomUUID(),
    projectId,
    uploadedAt: new Date().toISOString(),
    results,
    bodyOnly: includeBody,
    source,
    uploadMethod: source,
  }
  const all = readAll()
  all.unshift(entry)
  writeAll(all)
  return entry
}

export function createManualEntryLocal(
  projectId: string,
  initialText = '',
  title = '',
): ProjectDatabaseEntry {
  const text = initialText.trim()
  const name = title.trim()
  const entry: ProjectDatabaseEntry = {
    id: crypto.randomUUID(),
    projectId,
    uploadedAt: new Date().toISOString(),
    results: [],
    bodyOnly: true,
    source: 'manual',
    uploadMethod: 'manual',
    ...(text ? { editorText: text } : {}),
    ...(name ? { title: name } : {}),
  }
  const all = readAll()
  all.unshift(entry)
  writeAll(all)
  return entry
}

export function saveFindocDocumentToProjectLocal(
  projectId: string,
  editorText: string,
  title: string,
): ProjectDatabaseEntry {
  const text = editorText.trim()
  const docTitle = title.trim() || 'FinDoc 文档'
  const entry: ProjectDatabaseEntry = {
    id: crypto.randomUUID(),
    projectId,
    uploadedAt: new Date().toISOString(),
    results: [
      {
        status: 'success',
        url: 'findoc://output',
        title: docTitle,
        summary: '',
        content: '',
        key_points: [],
        detected_language: 'zh',
      },
    ],
    bodyOnly: true,
    source: 'findoc',
    uploadMethod: 'findoc',
    editorText: text,
  }
  const all = readAll()
  all.unshift(entry)
  writeAll(all)
  return entry
}
