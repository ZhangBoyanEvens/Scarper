export type NeonStorageMode = 'neon' | 'local'

export interface NeonStatusResponse {
  enabled: boolean
  configured: boolean
  connected: boolean
  mode: NeonStorageMode
}

export interface NeonStorageResponse {
  used_bytes: number
  quota_bytes: number
  quota_mb: number
  used_percent: number
  storage: 'neon'
}

export interface ProjectUploadApiResponse {
  id: string
  project_id: string
  uploaded_at: string
  body_only: boolean
  result_count: number
  storage: NeonStorageMode
}

export interface ProjectUploadResult {
  id: string
  projectId: string
  uploadedAt: string
  bodyOnly: boolean
  resultCount: number
  storage: NeonStorageMode
}
