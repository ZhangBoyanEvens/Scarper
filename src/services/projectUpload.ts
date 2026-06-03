import {
  uploadResultsToProject as uploadResultsToProjectLocal,
  upsertProjectEntryLocal,
} from '../storage/projectDatabaseStorage'
import type { ExtractResponse } from '../types/extraction'
import type { ProjectUploadResult } from '../types/neon'
import {
  isNeonAvailable,
  isNeonUploadPreferred,
  uploadProjectResultsToNeon,
} from './neonProjectApi'

export interface UploadProjectOptions {
  /** 为 true 时 payload 包含 content 字段 */
  includeBody?: boolean
  uploadMethod?: 'scrape'
}

/**
 * 上传抓取结果到项目数据库：优先 Neon（已配置且连通），否则 localStorage。
 */
export async function uploadProjectResults(
  projectId: string,
  results: ExtractResponse[],
  options: UploadProjectOptions = {},
): Promise<ProjectUploadResult> {
  const includeBody = options.includeBody ?? false

  if (isNeonUploadPreferred() && (await isNeonAvailable())) {
    try {
      const result = await uploadProjectResultsToNeon(
        projectId,
        results,
        includeBody,
      )
      upsertProjectEntryLocal({
        id: result.id,
        projectId,
        uploadedAt: result.uploadedAt,
        results,
        bodyOnly: includeBody,
        source: 'scrape',
        uploadMethod: 'scrape',
      })
      window.dispatchEvent(new Event('scarper:project-records-changed'))
      return result
    } catch (e) {
      if (e instanceof Error && e.name === 'NeonNotConfiguredError') {
        /* fall through to local */
      } else {
        throw e
      }
    }
  }

  const entry = uploadResultsToProjectLocal(
    projectId,
    results,
    includeBody,
    options.uploadMethod ?? 'scrape',
  )
  window.dispatchEvent(new Event('scarper:project-records-changed'))
  return {
    id: entry.id,
    projectId: entry.projectId,
    uploadedAt: entry.uploadedAt,
    bodyOnly: includeBody,
    resultCount: entry.results.length,
    storage: 'local',
  }
}
