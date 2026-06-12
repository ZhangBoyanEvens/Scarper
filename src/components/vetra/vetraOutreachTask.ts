import type { ProjectDataRecord } from '../../types/projectRecord'

export interface VetraOutreachTaskOption {
  key: string
  projectId: string
  projectName: string
  record: ProjectDataRecord
  index: number
}

export function outreachTaskKey(projectId: string, recordId: string): string {
  return `${projectId}:${recordId}`
}

export function parseOutreachTaskKey(key: string): {
  projectId: string
  recordId: string
} | null {
  const separator = key.indexOf(':')
  if (separator <= 0) return null
  const projectId = key.slice(0, separator)
  const recordId = key.slice(separator + 1)
  if (!projectId || !recordId) return null
  return { projectId, recordId }
}

export function formatOutreachTaskLabel(
  record: ProjectDataRecord,
  index: number,
  projectName?: string,
): string {
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
  const prefix = projectName ? `${projectName} · ` : ''
  const title = record.title?.trim()
  if (title) {
    return `${prefix}${title}`
  }
  return `${prefix}#${index + 1} ${when} · ${record.resultCount} items`
}
