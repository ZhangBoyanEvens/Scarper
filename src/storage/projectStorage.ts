import type { Project } from '../types/project'
import { scopedStorageKey } from './userScope'

const STORAGE_BASE = 'scarper.projects.v1'

function storageKey(): string {
  return scopedStorageKey(STORAGE_BASE)
}

function readAll(): Project[] {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isProject)
  } catch {
    return []
  }
}

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false
  const p = value as Project
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.description === 'string' &&
    typeof p.createdAt === 'string' &&
    typeof p.updatedAt === 'string'
  )
}

function writeAll(projects: Project[]): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(projects))
  } catch {
    /* ignore */
  }
}

export function listProjects(): Project[] {
  return readAll().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

export function replaceProjectsLocal(projects: Project[]): void {
  writeAll(projects)
}

export function createProjectLocal(input: {
  name: string
  description?: string
}): Project {
  const now = new Date().toISOString()
  const project: Project = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    createdAt: now,
    updatedAt: now,
  }
  const all = readAll()
  all.unshift(project)
  writeAll(all)
  window.dispatchEvent(new Event('scarper:projects-changed'))
  return project
}

export function listProjectsLocal(): Project[] {
  return listProjects()
}

export function deleteProjectLocal(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id))
}

export function touchProjectLocal(id: string): void {
  const all = readAll()
  const idx = all.findIndex((p) => p.id === id)
  if (idx < 0) return
  all[idx] = { ...all[idx], updatedAt: new Date().toISOString() }
  writeAll(all)
}

