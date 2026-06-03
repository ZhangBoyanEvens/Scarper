import type { NeonStorageMode } from './neon'

export interface ProjectDataRecord {
  id: string
  projectId: string
  uploadedAt: string
  bodyOnly: boolean
  resultCount: number
  successCount: number
  source: string
  storage: NeonStorageMode
  /** 手动新建记录名称（可选） */
  title?: string
}

export interface ProjectDataRecordListResponse {
  project_id: string
  items: Array<{
    id: string
    project_id: string
    uploaded_at: string
    body_only: boolean
    result_count: number
    success_count: number
    source: string
  }>
  storage: NeonStorageMode
}
