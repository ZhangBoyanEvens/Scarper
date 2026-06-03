import { scopedStorageKey } from './userScope'

const DRAFT_BASE = 'scarper.dashboard.draft.v1'

function draftKey(projectId: string, recordId: string): string {
  return scopedStorageKey(`${DRAFT_BASE}.${projectId}.${recordId}`)
}

export function loadDashboardDraft(
  projectId: string,
  recordId: string,
): string | null {
  try {
    return localStorage.getItem(draftKey(projectId, recordId))
  } catch {
    return null
  }
}

export function saveDashboardDraft(
  projectId: string,
  recordId: string,
  text: string,
): void {
  try {
    localStorage.setItem(draftKey(projectId, recordId), text)
  } catch {
    /* ignore */
  }
}

export function clearDashboardDraft(projectId: string, recordId: string): void {
  try {
    localStorage.removeItem(draftKey(projectId, recordId))
  } catch {
    /* ignore */
  }
}
