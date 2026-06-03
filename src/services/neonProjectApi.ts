import { resolveApiBase } from '../config/api'
import type {
  NeonStatusResponse,
  NeonStorageResponse,
  ProjectUploadApiResponse,
  ProjectUploadResult,
} from '../types/neon'
import type {
  ProjectDataRecord,
  ProjectDataRecordListResponse,
} from '../types/projectRecord'
import type {
  ProjectCreateApiBody,
  ProjectListApiResponse,
} from '../types/neonProject'
import type { Project } from '../types/project'
import type { ExtractResponse } from '../types/extraction'
import { buildAuthHeaders } from './authToken'

const neonUploadFlag =
  import.meta.env.VITE_NEON_UPLOAD_ENABLED === 'true' ||
  import.meta.env.VITE_NEON_UPLOAD_ENABLED === '1'

let cachedStatus: NeonStatusResponse | null = null
let statusCachedAt = 0
let statusPromise: Promise<NeonStatusResponse> | null = null

/** 连新加坡 Neon：留足 TLS + 冷启动，避免误 abort */
const NEON_FETCH_TIMEOUT_MS = 20_000
/** 状态缓存：避免每次列表都 ping Neon */
const STATUS_CACHE_MS = 90_000
/** 存储用量缓存：Project 页避免频繁统计 Neon */
const STORAGE_CACHE_MS = 60_000

let cachedStorage: NeonStorageResponse | null = null
let storageCachedAt = 0
let storagePromise: Promise<NeonStorageResponse | null> | null = null

let projectsPromise: Promise<Project[]> | null = null

const uploadDetailInflight = new Map<string, Promise<NeonUploadDetail>>()

function apiUrl(path: string): string {
  const base = resolveApiBase()
  return base ? `${base}${path}` : path
}

export function isNeonUploadPreferred(): boolean {
  return neonUploadFlag
}

interface NeonFetchOptions {
  auth?: boolean
}

async function neonFetch(
  path: string,
  init: RequestInit = {},
  options: NeonFetchOptions = {},
): Promise<Response> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => {
    ctrl.abort(
      new DOMException('数据库请求超时，请稍后重试', 'TimeoutError'),
    )
  }, NEON_FETCH_TIMEOUT_MS)
  const useAuth = options.auth !== false
  try {
    const headers = useAuth
      ? await buildAuthHeaders(init.headers)
      : new Headers(init.headers)
    return await fetch(apiUrl(path), {
      ...init,
      headers,
      signal: ctrl.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(err.message)
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('数据库请求已取消或超时，请稍后重试')
    }
    throw err
  } finally {
    window.clearTimeout(timer)
  }
}

export async function fetchNeonStatus(
  force = false,
): Promise<NeonStatusResponse> {
  if (
    !force &&
    cachedStatus &&
    Date.now() - statusCachedAt < STATUS_CACHE_MS
  ) {
    return cachedStatus
  }
  if (!force && statusPromise) return statusPromise

  statusPromise = (async () => {
    try {
      const res = await neonFetch('/api/neon/status', {}, { auth: false })
      if (!res.ok) {
        return defaultLocalStatus()
      }
      const data = (await res.json()) as NeonStatusResponse
      cachedStatus = data
      statusCachedAt = Date.now()
      return data
    } catch {
      return defaultLocalStatus()
    } finally {
      statusPromise = null
    }
  })()

  return statusPromise
}

function defaultLocalStatus(): NeonStatusResponse {
  return {
    enabled: false,
    configured: false,
    connected: false,
    mode: 'local',
  }
}

export async function isNeonAvailable(): Promise<boolean> {
  if (!neonUploadFlag) return false
  const status = await fetchNeonStatus()
  return status.mode === 'neon' && status.connected
}

/** @deprecated 使用 isNeonAvailable */
export async function isNeonUploadAvailable(): Promise<boolean> {
  return isNeonAvailable()
}

function apiItemToProject(item: {
  id: string
  name: string
  description: string
  created_at: string
  updated_at: string
}): Project {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }
}

export async function fetchNeonStorage(
  force = false,
): Promise<NeonStorageResponse | null> {
  if (!neonUploadFlag) return null
  if (
    !force &&
    cachedStorage &&
    Date.now() - storageCachedAt < STORAGE_CACHE_MS
  ) {
    return cachedStorage
  }
  if (!force && storagePromise) return storagePromise

  storagePromise = (async () => {
    const status =
      cachedStatus && Date.now() - statusCachedAt < STATUS_CACHE_MS
        ? cachedStatus
        : await fetchNeonStatus()
    if (status.mode !== 'neon' || !status.connected) return null
    const res = await neonFetch('/api/neon/storage')
    if (res.status === 401) {
      const err = new Error('需要登录')
      err.name = 'NeonAuthError'
      throw err
    }
    if (res.status === 503) return null
    if (!res.ok) {
      throw new Error(`拉取存储用量失败 (${res.status})`)
    }
    const data = (await res.json()) as NeonStorageResponse
    cachedStorage = data
    storageCachedAt = Date.now()
    return data
  })()

  try {
    return await storagePromise
  } finally {
    storagePromise = null
  }
}

export async function fetchNeonProjects(): Promise<Project[]> {
  if (projectsPromise) return projectsPromise

  projectsPromise = (async () => {
    const res = await neonFetch('/api/neon/projects')
    if (res.status === 401) {
      const err = new Error('需要登录')
      err.name = 'NeonAuthError'
      throw err
    }
    if (res.status === 503) {
      const err = new Error('neon_not_configured')
      err.name = 'NeonNotConfiguredError'
      throw err
    }
    if (!res.ok) {
      throw new Error(`拉取项目列表失败 (${res.status})`)
    }
    const data = (await res.json()) as ProjectListApiResponse
    return data.items.map(apiItemToProject)
  })()

  try {
    return await projectsPromise
  } finally {
    projectsPromise = null
  }
}

export async function createNeonProject(input: {
  id: string
  name: string
  description?: string
}): Promise<Project> {
  const body: ProjectCreateApiBody = {
    id: input.id,
    name: input.name,
    description: input.description ?? '',
  }
  const res = await neonFetch('/api/neon/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (res.status === 401) {
    const err = new Error('需要登录')
    err.name = 'NeonAuthError'
    throw err
  }
  if (!res.ok) {
    let detail = `创建项目失败 (${res.status})`
    try {
      const payload = (await res.json()) as { detail?: unknown }
      if (typeof payload.detail === 'string') detail = payload.detail
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  const data = (await res.json()) as ProjectListApiResponse['items'][number]
  return apiItemToProject(data)
}

export async function deleteNeonProject(projectId: string): Promise<void> {
  const res = await neonFetch(
    `/api/neon/projects/${encodeURIComponent(projectId)}`,
    { method: 'DELETE' },
  )
  if (res.status === 401) {
    const err = new Error('需要登录')
    err.name = 'NeonAuthError'
    throw err
  }
  if (res.status === 404) return
  if (!res.ok) {
    throw new Error(`删除项目失败 (${res.status})`)
  }
  invalidateNeonStorageCache()
}

export function clearNeonStatusCache(): void {
  cachedStatus = null
  statusCachedAt = 0
  statusPromise = null
  invalidateNeonStorageCache()
}

export function invalidateNeonStorageCache(): void {
  cachedStorage = null
  storageCachedAt = 0
  storagePromise = null
}

export interface CreateManualRecordOptions {
  title?: string
  initialText?: string
}

export async function createNeonManualRecord(
  projectId: string,
  options: CreateManualRecordOptions = {},
): Promise<ProjectUploadResult> {
  const res = await neonFetch(
    `/api/neon/projects/${encodeURIComponent(projectId)}/records`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: options.title?.trim() ?? '',
        initial_text: options.initialText?.trim() ?? '',
      }),
    },
  )

  if (res.status === 503) {
    const err = new Error('neon_not_configured')
    err.name = 'NeonNotConfiguredError'
    throw err
  }
  if (res.status === 401) {
    const err = new Error('需要登录后才能新建记录')
    err.name = 'NeonAuthError'
    throw err
  }
  if (!res.ok) {
    let detail = `新建记录失败 (${res.status})`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
      else if (
        body.detail &&
        typeof body.detail === 'object' &&
        'message' in body.detail
      ) {
        detail = (body.detail as { message?: string }).message ?? detail
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }

  invalidateNeonStorageCache()
  const data = (await res.json()) as ProjectUploadApiResponse
  return {
    id: data.id,
    projectId: data.project_id,
    uploadedAt: data.uploaded_at,
    bodyOnly: data.body_only,
    resultCount: data.result_count,
    storage: data.storage,
  }
}

export async function uploadProjectResultsToNeon(
  projectId: string,
  results: ExtractResponse[],
  bodyOnly: boolean,
): Promise<ProjectUploadResult> {
  const res = await neonFetch(
    `/api/neon/projects/${encodeURIComponent(projectId)}/upload`,
    {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        results,
        body_only: bodyOnly,
      }),
    },
  )

  if (res.status === 503) {
    const err = new Error('neon_not_configured')
    err.name = 'NeonNotConfiguredError'
    throw err
  }

  if (res.status === 401) {
    let detail = '需要登录后才能上传到 Neon'
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* ignore */
    }
    const err = new Error(detail)
    err.name = 'NeonAuthError'
    throw err
  }

  if (!res.ok) {
    let detail = `Neon 上传失败 (${res.status})`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') {
        detail = body.detail
      } else if (
        body.detail &&
        typeof body.detail === 'object' &&
        'message' in body.detail
      ) {
        const d = body.detail as { message?: string; code?: string }
        detail = d.message ?? detail
        if (d.code === 'storage_quota_exceeded') {
          const err = new Error(detail)
          err.name = 'NeonStorageQuotaError'
          throw err
        }
      }
    } catch (inner) {
      if (inner instanceof Error && inner.name === 'NeonStorageQuotaError') {
        throw inner
      }
    }
    throw new Error(detail)
  }

  invalidateNeonStorageCache()
  const data = (await res.json()) as ProjectUploadApiResponse
  return {
    id: data.id,
    projectId: data.project_id,
    uploadedAt: data.uploaded_at,
    bodyOnly: data.body_only,
    resultCount: data.result_count,
    storage: data.storage,
  }
}

function apiItemToDataRecord(
  item: ProjectDataRecordListResponse['items'][number],
  storage: 'neon' | 'local',
): ProjectDataRecord {
  return {
    id: item.id,
    projectId: item.project_id,
    uploadedAt: item.uploaded_at,
    bodyOnly: item.body_only,
    resultCount: item.result_count,
    successCount: item.success_count,
    source: item.source,
    storage,
  }
}

export interface NeonUploadDetail {
  results: ExtractResponse[]
  editorText: string | null
}

function uploadDetailInflightKey(projectId: string, uploadId: string): string {
  return `${projectId}:${uploadId}`
}

export function invalidateNeonUploadDetailCache(
  projectId: string,
  uploadId?: string,
): void {
  if (uploadId) {
    uploadDetailInflight.delete(uploadDetailInflightKey(projectId, uploadId))
  } else {
    for (const key of uploadDetailInflight.keys()) {
      if (key.startsWith(`${projectId}:`)) uploadDetailInflight.delete(key)
    }
  }
}

export async function fetchNeonUploadEditor(
  projectId: string,
  uploadId: string,
): Promise<NeonUploadDetail> {
  const inflightKey = uploadDetailInflightKey(projectId, uploadId)
  const pending = uploadDetailInflight.get(inflightKey)
  if (pending) return pending

  const promise = (async (): Promise<NeonUploadDetail> => {
    const res = await neonFetch(
      `/api/neon/projects/${encodeURIComponent(projectId)}/uploads/${encodeURIComponent(uploadId)}/editor`,
    )
    if (res.status === 401) {
      const err = new Error('需要登录')
      err.name = 'NeonAuthError'
      throw err
    }
    if (res.status === 404) {
      throw new Error('Record not found')
    }
    if (res.status === 503) {
      const err = new Error('neon_not_configured')
      err.name = 'NeonNotConfiguredError'
      throw err
    }
    if (!res.ok) {
      throw new Error(`拉取记录正文失败 (${res.status})`)
    }
    const data = (await res.json()) as {
      results?: ExtractResponse[]
      editor_text?: string | null
    }
    const editor =
      typeof data.editor_text === 'string' && data.editor_text.trim()
        ? data.editor_text
        : null
    return { results: data.results ?? [], editorText: editor }
  })()

  uploadDetailInflight.set(inflightKey, promise)
  try {
    return await promise
  } finally {
    if (uploadDetailInflight.get(inflightKey) === promise) {
      uploadDetailInflight.delete(inflightKey)
    }
  }
}

export async function fetchNeonUploadDetail(
  projectId: string,
  uploadId: string,
): Promise<NeonUploadDetail> {
  const inflightKey = uploadDetailInflightKey(projectId, uploadId)
  const pending = uploadDetailInflight.get(inflightKey)
  if (pending) return pending

  const promise = (async (): Promise<NeonUploadDetail> => {
    const res = await neonFetch(
      `/api/neon/projects/${encodeURIComponent(projectId)}/uploads/${encodeURIComponent(uploadId)}`,
    )
    if (res.status === 401) {
      const err = new Error('需要登录')
      err.name = 'NeonAuthError'
      throw err
    }
    if (res.status === 404) {
      throw new Error('Record not found')
    }
    if (res.status === 503) {
      const err = new Error('neon_not_configured')
      err.name = 'NeonNotConfiguredError'
      throw err
    }
    if (!res.ok) {
      throw new Error(`拉取记录详情失败 (${res.status})`)
    }
    const data = (await res.json()) as {
      results: ExtractResponse[]
      editor_text?: string | null
    }
    const editor =
      typeof data.editor_text === 'string' && data.editor_text.trim()
        ? data.editor_text
        : null
    return { results: data.results ?? [], editorText: editor }
  })()

  uploadDetailInflight.set(inflightKey, promise)
  try {
    return await promise
  } finally {
    if (uploadDetailInflight.get(inflightKey) === promise) {
      uploadDetailInflight.delete(inflightKey)
    }
  }
}

export async function saveNeonUploadDocument(
  projectId: string,
  uploadId: string,
  editorText: string,
): Promise<void> {
  const res = await neonFetch(
    `/api/neon/projects/${encodeURIComponent(projectId)}/uploads/${encodeURIComponent(uploadId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editor_text: editorText }),
    },
  )
  if (res.status === 401) {
    const err = new Error('需要登录')
    err.name = 'NeonAuthError'
    throw err
  }
  if (res.status === 404) {
    throw new Error('Record not found')
  }
  if (res.status === 503) {
    const err = new Error('neon_not_configured')
    err.name = 'NeonNotConfiguredError'
    throw err
  }
  if (!res.ok) {
    let message = `保存到数据库失败 (${res.status})`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') {
        message = body.detail
      } else if (
        body.detail &&
        typeof body.detail === 'object' &&
        'message' in body.detail
      ) {
        const d = body.detail as { message?: string; code?: string }
        message = d.message ?? message
        if (d.code === 'storage_quota_exceeded') {
          const err = new Error(message)
          err.name = 'NeonStorageQuotaError'
          throw err
        }
      }
    } catch (inner) {
      if (inner instanceof Error && inner.name === 'NeonStorageQuotaError') {
        throw inner
      }
    }
    throw new Error(message)
  }
  invalidateNeonStorageCache()
  invalidateNeonUploadDetailCache(projectId, uploadId)
}

export async function uploadFindocToNeonProject(
  projectId: string,
  editorText: string,
  title?: string,
): Promise<ProjectUploadResult> {
  const res = await neonFetch(
    `/api/neon/projects/${encodeURIComponent(projectId)}/findoc`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        editor_text: editorText,
        title: title?.trim() || '',
      }),
    },
  )
  if (res.status === 401) {
    const err = new Error('需要登录')
    err.name = 'NeonAuthError'
    throw err
  }
  if (res.status === 404) {
    throw new Error('项目不存在')
  }
  if (res.status === 413) {
    throw new Error('存储空间已满，无法保存 FinDoc 结果')
  }
  if (res.status === 503) {
    const err = new Error('neon_not_configured')
    err.name = 'NeonNotConfiguredError'
    throw err
  }
  if (!res.ok) {
    let message = `保存 FinDoc 到项目失败 (${res.status})`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') message = body.detail
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  const data = (await res.json()) as ProjectUploadApiResponse
  invalidateNeonStorageCache()
  return {
    id: data.id,
    projectId: data.project_id,
    uploadedAt: data.uploaded_at,
    bodyOnly: data.body_only,
    resultCount: data.result_count,
    storage: 'neon',
  }
}

export async function fetchNeonProjectRecords(
  projectId: string,
): Promise<ProjectDataRecord[]> {
  const res = await neonFetch(
    `/api/neon/projects/${encodeURIComponent(projectId)}/uploads`,
  )
  if (res.status === 401) {
    const err = new Error('需要登录')
    err.name = 'NeonAuthError'
    throw err
  }
  if (res.status === 503) {
    const err = new Error('neon_not_configured')
    err.name = 'NeonNotConfiguredError'
    throw err
  }
  if (!res.ok) {
    throw new Error(`拉取数据记录失败 (${res.status})`)
  }
  const data = (await res.json()) as ProjectDataRecordListResponse
  return data.items.map((item) => apiItemToDataRecord(item, data.storage))
}

export async function deleteNeonProjectRecord(
  projectId: string,
  recordId: string,
): Promise<void> {
  const res = await neonFetch(
    `/api/neon/projects/${encodeURIComponent(projectId)}/uploads/${encodeURIComponent(recordId)}`,
    { method: 'DELETE' },
  )
  if (res.status === 401) {
    const err = new Error('需要登录')
    err.name = 'NeonAuthError'
    throw err
  }
  if (res.status === 404) return
  if (!res.ok) {
    throw new Error(`删除记录失败 (${res.status})`)
  }
  invalidateNeonStorageCache()
}
