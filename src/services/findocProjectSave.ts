import { listEntriesForProject, upsertProjectEntryLocal } from '../storage/projectDatabaseStorage'
import { extractFindocDocumentTitle } from '../utils/findocRichText'
import type { FindocProceedContext } from '../types/findoc'
import type { ProjectUploadResult } from '../types/neon'
import type { ProjectDatabaseEntry } from '../types/projectEntry'
import {
  invalidateRecordsCache,
  notifyProjectRecordsChanged,
  peekProjectRecords,
} from './projectRecordService'
import {
  isNeonAvailable,
  isNeonUploadPreferred,
  matchSavedFindocOnNeon,
  uploadFindocToNeonProject,
} from './neonProjectApi'

export interface SavedFindocMatch {
  id: string
  editorText: string
  title?: string
  uploadedAt?: string
  storage: 'neon' | 'local'
}

function normalizeContext(context: FindocProceedContext): FindocProceedContext {
  return {
    templateId: context.templateId.trim(),
    taskIds: context.taskIds.map((id) => id.trim()).filter(Boolean),
    adjustmentPrompt: context.adjustmentPrompt.trim(),
  }
}

function contextsEqual(
  a: FindocProceedContext,
  b: FindocProceedContext,
): boolean {
  const left = normalizeContext(a)
  const right = normalizeContext(b)
  return (
    left.templateId === right.templateId &&
    left.adjustmentPrompt === right.adjustmentPrompt &&
    left.taskIds.length === right.taskIds.length &&
    left.taskIds.every((id, index) => id === right.taskIds[index])
  )
}

function findLocalSavedFindoc(
  projectId: string,
  context: FindocProceedContext,
): SavedFindocMatch | null {
  const normalized = normalizeContext(context)
  if (!normalized.templateId || normalized.taskIds.length === 0) {
    return null
  }

  const hit = listEntriesForProject(projectId).find(
    (entry) =>
      entry.source === 'findoc' &&
      Boolean(entry.editorText?.trim()) &&
      entry.findocContext &&
      contextsEqual(entry.findocContext, normalized),
  )

  if (!hit?.editorText?.trim()) return null

  return {
    id: hit.id,
    editorText: hit.editorText.trim(),
    title: hit.title,
    uploadedAt: hit.uploadedAt,
    storage: 'local',
  }
}

export async function lookupSavedFindocOutput(
  projectId: string,
  context: FindocProceedContext,
): Promise<SavedFindocMatch | null> {
  const normalized = normalizeContext(context)
  if (!normalized.templateId || normalized.taskIds.length === 0) {
    return null
  }

  if (isNeonUploadPreferred() && (await isNeonAvailable())) {
    try {
      const match = await matchSavedFindocOnNeon(projectId, normalized)
      if (match) return match
    } catch (e) {
      if (e instanceof Error && e.name === 'NeonNotConfiguredError') {
        /* fall through local */
      } else {
        throw e
      }
    }
  }

  return findLocalSavedFindoc(projectId, normalized)
}

function buildFindocLocalEntry(
  projectId: string,
  recordId: string,
  editorText: string,
  title: string,
  findocContext: FindocProceedContext | undefined,
  uploadedAt?: string,
): ProjectDatabaseEntry {
  const text = editorText.trim()
  const docTitle = title.trim() || 'FinDoc 文档'
  return {
    id: recordId,
    projectId,
    uploadedAt: uploadedAt ?? new Date().toISOString(),
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
    title: docTitle,
    findocContext: findocContext
      ? normalizeContext(findocContext)
      : undefined,
  }
}

export async function saveFindocOutputToProject(
  projectId: string,
  editorText: string,
  existingRecordId?: string | null,
  proceedContext?: FindocProceedContext,
): Promise<ProjectUploadResult> {
  const text = editorText.trim()
  if (!text) {
    throw new Error('Content cannot be empty')
  }

  const title = extractFindocDocumentTitle(text)
  const normalizedContext = proceedContext
    ? normalizeContext(proceedContext)
    : undefined
  const existingRecord = existingRecordId
    ? peekProjectRecords(projectId).find((r) => r.id === existingRecordId)
    : undefined

  if (isNeonUploadPreferred() && (await isNeonAvailable())) {
    try {
      const result = await uploadFindocToNeonProject(
        projectId,
        text,
        title,
        existingRecordId,
        normalizedContext,
      )
      upsertProjectEntryLocal(
        buildFindocLocalEntry(
          projectId,
          result.id,
          text,
          title,
          normalizedContext,
          result.uploadedAt,
        ),
      )
      invalidateRecordsCache(projectId)
      notifyProjectRecordsChanged()
      return result
    } catch (e) {
      if (e instanceof Error && e.name === 'NeonNotConfiguredError') {
        /* fall through local */
      } else {
        throw e
      }
    }
  }

  const recordId = existingRecordId ?? crypto.randomUUID()
  const uploadedAt =
    existingRecord?.uploadedAt ?? new Date().toISOString()
  upsertProjectEntryLocal(
    buildFindocLocalEntry(
      projectId,
      recordId,
      text,
      title,
      normalizedContext,
      uploadedAt,
    ),
  )
  invalidateRecordsCache(projectId)
  notifyProjectRecordsChanged()
  return {
    id: recordId,
    projectId,
    uploadedAt,
    bodyOnly: true,
    resultCount: 1,
    storage: 'local',
  }
}
