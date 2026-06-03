import { saveFindocDocumentToProjectLocal } from '../storage/projectDatabaseStorage'
import { extractFindocDocumentTitle } from '../utils/findocRichText'
import type { ProjectUploadResult } from '../types/neon'
import {
  invalidateRecordsCache,
  notifyProjectRecordsChanged,
  peekProjectRecords,
  saveTaskEditorText,
} from './projectRecordService'
import {
  isNeonAvailable,
  isNeonUploadPreferred,
  uploadFindocToNeonProject,
} from './neonProjectApi'

export async function saveFindocOutputToProject(
  projectId: string,
  editorText: string,
  existingRecordId?: string | null,
): Promise<ProjectUploadResult> {
  const text = editorText.trim()
  if (!text) {
    throw new Error('Content cannot be empty')
  }

  const title = extractFindocDocumentTitle(text)

  if (existingRecordId) {
    const record = peekProjectRecords(projectId).find((r) => r.id === existingRecordId)
    if (record?.source === 'findoc') {
      await saveTaskEditorText(projectId, existingRecordId, text)
      invalidateRecordsCache(projectId)
      notifyProjectRecordsChanged()
      return {
        id: existingRecordId,
        projectId,
        uploadedAt: record.uploadedAt,
        bodyOnly: true,
        resultCount: 1,
        storage: record.storage,
      }
    }
  }

  if (isNeonUploadPreferred() && (await isNeonAvailable())) {
    try {
      const result = await uploadFindocToNeonProject(projectId, text, title)
      saveFindocDocumentToProjectLocal(projectId, text, title)
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

  const entry = saveFindocDocumentToProjectLocal(projectId, text, title)
  invalidateRecordsCache(projectId)
  notifyProjectRecordsChanged()
  return {
    id: entry.id,
    projectId: entry.projectId,
    uploadedAt: entry.uploadedAt,
    bodyOnly: true,
    resultCount: 1,
    storage: 'local',
  }
}
