import {
  createManualEntryLocal,
  deleteProjectEntryLocal,
  getProjectEntryLocal,
  listEntriesForProject,
  updateProjectEntryEditorLocal,
} from '../storage/projectDatabaseStorage'
import { getActiveStorageUserId } from '../storage/userScope'
import type { ExtractResponse } from '../types/extraction'
import type { ProjectDataRecord } from '../types/projectRecord'
import { isExtractSuccess } from '../types/extraction'
import { resolveStoredEditorText } from '../utils/recordEditorText'
import {
  createNeonManualRecord,
  deleteNeonProjectRecord,
  fetchNeonProjectRecords,
  fetchNeonUploadDetail,
  fetchNeonUploadEditor,
  invalidateNeonUploadDetailCache,
  isNeonUploadPreferred,
  saveNeonUploadDocument,
} from './neonProjectApi'
import { clearDashboardDraft } from '../storage/dashboardDraftStorage'
import { cacheGet, cacheInvalidate, cacheSet, CacheKeys } from './memoryCache'

function localEntriesToRecords(projectId: string): ProjectDataRecord[] {
  return listEntriesForProject(projectId).map((entry) => ({
    id: entry.id,
    projectId: entry.projectId,
    uploadedAt: entry.uploadedAt,
    bodyOnly: entry.bodyOnly ?? false,
    resultCount: entry.results.length,
    successCount: entry.results.filter(isExtractSuccess).length,
    source: entry.source ?? entry.uploadMethod ?? 'scrape',
    storage: 'local' as const,
    title:
      entry.title?.trim() ||
      (() => {
        const hit = entry.results.find(
          (r) => isExtractSuccess(r) && Boolean(r.title?.trim()),
        )
        return hit && isExtractSuccess(hit) ? hit.title.trim() : undefined
      })(),
  }))
}

function recordsCacheKey(projectId: string): string[] {
  return CacheKeys.records(getActiveStorageUserId() ?? '', projectId)
}

function taskTextCacheKey(projectId: string, recordId: string): string[] {
  return CacheKeys.taskText(
    getActiveStorageUserId() ?? '',
    projectId,
    recordId,
  )
}

function uploadDetailCacheKey(projectId: string, recordId: string): string[] {
  return CacheKeys.uploadDetail(
    getActiveStorageUserId() ?? '',
    projectId,
    recordId,
  )
}

export function notifyProjectRecordsChanged(): void {
  window.dispatchEvent(new Event('scarper:project-records-changed'))
}

function recordsListSignature(records: ProjectDataRecord[]): string {
  return records
    .map(
      (r) =>
        `${r.id}:${r.resultCount}:${r.successCount}:${r.uploadedAt}:${r.bodyOnly}`,
    )
    .join('|')
}

export function invalidateRecordsCache(projectId?: string): void {
  if (projectId) {
    cacheInvalidate(recordsCacheKey(projectId))
    return
  }
  cacheInvalidate(['records', getActiveStorageUserId() ?? ''])
}

/** 立即返回任务列表（缓存 / 本地上传），不等待 Neon */
export function peekProjectRecords(projectId: string): ProjectDataRecord[] {
  const key = recordsCacheKey(projectId)
  const cached = cacheGet<ProjectDataRecord[]>(key, 600_000)
  if (cached) return cached
  const local = localEntriesToRecords(projectId)
  if (local.length > 0) return local
  return []
}

async function fetchRecordsRemote(
  projectId: string,
): Promise<ProjectDataRecord[]> {
  if (isNeonUploadPreferred()) {
    try {
      return await fetchNeonProjectRecords(projectId)
    } catch (e) {
      if (e instanceof Error && e.name === 'NeonAuthError') {
        return localEntriesToRecords(projectId)
      }
      if (e instanceof Error && e.name === 'NeonNotConfiguredError') {
        return localEntriesToRecords(projectId)
      }
      throw e
    }
  }
  return localEntriesToRecords(projectId)
}

export async function listProjectDataRecords(
  projectId: string,
): Promise<ProjectDataRecord[]> {
  const key = recordsCacheKey(projectId)
  const stale = peekProjectRecords(projectId)
  if (stale.length > 0) {
    const staleSig = recordsListSignature(stale)
    void fetchRecordsRemote(projectId)
      .then((remote) => {
        const next = remote.length > 0 ? remote : stale
        cacheSet(key, next)
        if (recordsListSignature(next) !== staleSig) {
          notifyProjectRecordsChanged()
        }
      })
      .catch(() => {})
    return stale
  }

  const remote = await fetchRecordsRemote(projectId)
  cacheSet(key, remote)
  return remote
}

interface TaskDetailPayload {
  results: ExtractResponse[]
  editorText: string | null
}

function localTaskPayload(
  projectId: string,
  recordId: string,
): TaskDetailPayload | null {
  const local = getProjectEntryLocal(projectId, recordId)
  if (!local) return null
  return {
    results: local.results,
    editorText: local.editorText?.trim() || null,
  }
}

function recordStorageHint(
  projectId: string,
  recordId: string,
): 'neon' | 'local' | null {
  return (
    peekProjectRecords(projectId).find((r) => r.id === recordId)?.storage ??
    null
  )
}

function isRecordNotFoundError(err: unknown): boolean {
  return err instanceof Error && err.message === 'Record not found'
}

async function fetchNeonTaskDetail(
  projectId: string,
  recordId: string,
  preferFullResults: boolean,
): Promise<TaskDetailPayload> {
  const fetcher = preferFullResults
    ? fetchNeonUploadDetail
    : fetchNeonUploadEditor
  try {
    const detail = await fetcher(projectId, recordId)
    return {
      results: detail.results,
      editorText: detail.editorText,
    }
  } catch (err) {
    if (!isRecordNotFoundError(err) || preferFullResults) throw err
    return fetchNeonTaskDetail(projectId, recordId, true)
  }
}

async function fetchTaskDetail(
  projectId: string,
  recordId: string,
  options: { preferFullResults?: boolean } = {},
): Promise<TaskDetailPayload> {
  const cacheKey = uploadDetailCacheKey(projectId, recordId)
  const cached = cacheGet<TaskDetailPayload>(cacheKey, 600_000)
  if (cached && !options.preferFullResults) return cached

  const localPayload = localTaskPayload(projectId, recordId)
  const storageHint = recordStorageHint(projectId, recordId)

  if (localPayload && storageHint === 'local' && !options.preferFullResults) {
    cacheSet(cacheKey, localPayload)
    return localPayload
  }

  if (isNeonUploadPreferred() && storageHint !== 'local') {
    try {
      const payload = await fetchNeonTaskDetail(
        projectId,
        recordId,
        Boolean(options.preferFullResults),
      )
      cacheSet(cacheKey, payload)
      return payload
    } catch (err) {
      if (localPayload) {
        cacheSet(cacheKey, localPayload)
        return localPayload
      }
      if (isRecordNotFoundError(err)) {
        return { results: [], editorText: null }
      }
      throw err
    }
  }

  if (localPayload) {
    cacheSet(cacheKey, localPayload)
    return localPayload
  }

  return { results: [], editorText: null }
}

/** 从本机或 Neon 加载任务原始入库数据（结构化抓取结果） */
export async function loadTaskDbResults(
  projectId: string,
  recordId: string,
): Promise<ExtractResponse[]> {
  const detail = await fetchTaskDetail(projectId, recordId)
  if (detail.results.length > 0) return detail.results
  if (detail.editorText) return []
  const full = await fetchTaskDetail(projectId, recordId, {
    preferFullResults: true,
  })
  return full.results
}

/** 数据库中已保存的正文（不含未保存的编辑态） */
export async function loadTaskStoredDocumentText(
  projectId: string,
  recordId: string,
): Promise<string> {
  const { results, editorText } = await fetchTaskDetail(projectId, recordId)
  return resolveStoredEditorText(results, editorText)
}

/** RAG / 聊天：单次请求加载 results + 正文 */
export async function loadTaskContentBundle(
  projectId: string,
  recordId: string,
): Promise<{ results: ExtractResponse[]; documentText: string }> {
  const { results, editorText } = await fetchTaskDetail(projectId, recordId)
  return {
    results,
    documentText: resolveStoredEditorText(results, editorText),
  }
}

/** FinDoc Proceed：强制拉取 Task 实质内容（Neon / 本地 / 抓取结果） */
export async function loadTaskContentForFinDoc(
  projectId: string,
  recordId: string,
): Promise<string> {
  cacheInvalidate(taskTextCacheKey(projectId, recordId))
  cacheInvalidate(uploadDetailCacheKey(projectId, recordId))
  invalidateNeonUploadDetailCache(projectId, recordId)

  let detail = await fetchTaskDetail(projectId, recordId)
  let text = resolveStoredEditorText(detail.results, detail.editorText).trim()
  if (text) {
    cacheSet(taskTextCacheKey(projectId, recordId), text)
    return text
  }

  detail = await fetchTaskDetail(projectId, recordId, { preferFullResults: true })
  text = resolveStoredEditorText(detail.results, detail.editorText).trim()
  if (text) {
    cacheSet(taskTextCacheKey(projectId, recordId), text)
  }
  return text
}

async function loadTaskEditorSourceText(
  projectId: string,
  recordId: string,
): Promise<string> {
  const text = await loadTaskStoredDocumentText(projectId, recordId)
  cacheSet(taskTextCacheKey(projectId, recordId), text)
  return text
}

/** 同步读取可展示的编辑文本（缓存 / 本地） */
export function peekTaskEditorText(
  projectId: string,
  recordId: string,
): string {
  const cached = cacheGet<string>(
    taskTextCacheKey(projectId, recordId),
    600_000,
  )
  if (cached !== null) return cached

  const local = getProjectEntryLocal(projectId, recordId)
  if (local) {
    return resolveStoredEditorText(local.results, local.editorText)
  }

  return ''
}

/** 加载 Task 正文：先返回已有内容，必要时后台拉 Neon */
export async function loadTaskEditorText(
  projectId: string,
  recordId: string,
): Promise<string> {
  const immediate = peekTaskEditorText(projectId, recordId)
  if (immediate) {
    void loadTaskEditorSourceText(projectId, recordId).catch(() => {})
    return immediate
  }
  return loadTaskEditorSourceText(projectId, recordId)
}

/** 保存正文到 Neon / 本地项目库，并清除未提交的本地草稿 */
export async function saveTaskEditorText(
  projectId: string,
  recordId: string,
  text: string,
): Promise<void> {
  clearDashboardDraft(projectId, recordId)

  let saved = false

  if (isNeonUploadPreferred()) {
    try {
      await saveNeonUploadDocument(projectId, recordId, text)
      saved = true
    } catch (e) {
      if (e instanceof Error && e.message === 'Record not found') {
        /* Neon 无此记录，尝试本地 */
      } else if (
        e instanceof Error &&
        (e.name === 'NeonAuthError' || e.name === 'NeonNotConfiguredError')
      ) {
        /* fall through local */
      } else {
        throw e
      }
    }
  }

  if (updateProjectEntryEditorLocal(projectId, recordId, text)) {
    saved = true
  }

  if (!saved) {
    throw new Error(
      'Could not save. Sign in with Neon configured, or ensure the record exists locally.',
    )
  }

  cacheSet(taskTextCacheKey(projectId, recordId), text)
  cacheInvalidate(uploadDetailCacheKey(projectId, recordId))
}

/** 取消编辑：丢弃未保存更改，恢复为数据库中的正文 */
export async function revertTaskEditorText(
  projectId: string,
  recordId: string,
): Promise<string> {
  clearDashboardDraft(projectId, recordId)
  cacheInvalidate(taskTextCacheKey(projectId, recordId))
  cacheInvalidate(uploadDetailCacheKey(projectId, recordId))
  const text = await loadTaskEditorSourceText(projectId, recordId)
  return text
}

export interface CreateProjectDataRecordOptions {
  title?: string
  initialText?: string
}

/** Dashboard：在当前 Project 下插入一条新的手动记录 */
export async function createProjectDataRecord(
  projectId: string,
  options: CreateProjectDataRecordOptions = {},
): Promise<ProjectDataRecord> {
  const initialText = options.initialText?.trim() ?? ''
  const title = options.title?.trim() ?? ''

  if (isNeonUploadPreferred()) {
    try {
      const created = await createNeonManualRecord(projectId, {
        title,
        initialText,
      })
      const record: ProjectDataRecord = {
        id: created.id,
        projectId,
        uploadedAt: created.uploadedAt,
        bodyOnly: true,
        resultCount: created.resultCount,
        successCount: created.resultCount > 0 ? 1 : 0,
        source: 'manual',
        storage: created.storage,
        title: title || undefined,
      }
      const key = recordsCacheKey(projectId)
      const prev = cacheGet<ProjectDataRecord[]>(key, 600_000) ?? []
      cacheSet(key, [record, ...prev.filter((r) => r.id !== record.id)])
      if (initialText) {
        cacheSet(taskTextCacheKey(projectId, record.id), initialText)
      }
      notifyProjectRecordsChanged()
      return record
    } catch (e) {
      if (
        e instanceof Error &&
        (e.name === 'NeonAuthError' || e.name === 'NeonNotConfiguredError')
      ) {
        /* fall through local */
      } else {
        throw e
      }
    }
  }

  const entry = createManualEntryLocal(projectId, initialText, title)
  const record: ProjectDataRecord = {
    id: entry.id,
    projectId: entry.projectId,
    uploadedAt: entry.uploadedAt,
    bodyOnly: true,
    resultCount: 0,
    successCount: 0,
    source: 'manual',
    storage: 'local',
    title: title || undefined,
  }
  const key = recordsCacheKey(projectId)
  const prev = cacheGet<ProjectDataRecord[]>(key, 600_000) ?? []
  cacheSet(key, [record, ...prev.filter((r) => r.id !== record.id)])
  if (initialText) {
    cacheSet(taskTextCacheKey(projectId, record.id), initialText)
  }
  notifyProjectRecordsChanged()
  return record
}

export async function deleteProjectDataRecord(
  projectId: string,
  recordId: string,
): Promise<void> {
  let neonDeleted = false
  if (isNeonUploadPreferred()) {
    try {
      await deleteNeonProjectRecord(projectId, recordId)
      neonDeleted = true
    } catch (e) {
      if (
        e instanceof Error &&
        (e.name === 'NeonAuthError' || e.name === 'NeonNotConfiguredError')
      ) {
        /* fall through local */
      } else {
        throw e
      }
    }
  }

  const localDeleted = deleteProjectEntryLocal(projectId, recordId)
  if (!neonDeleted && !localDeleted) {
    throw new Error('Record not found')
  }
  invalidateRecordsCache(projectId)
  cacheInvalidate(taskTextCacheKey(projectId, recordId))
  cacheInvalidate(uploadDetailCacheKey(projectId, recordId))
  invalidateNeonUploadDetailCache(projectId, recordId)
  notifyProjectRecordsChanged()
}

