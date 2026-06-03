import {
  createProjectLocal,
  deleteProjectLocal,
  listProjectsLocal,
  replaceProjectsLocal,
  touchProjectLocal,
} from '../storage/projectStorage'
import {
  deleteProjectEntriesLocal,
} from '../storage/projectDatabaseStorage'
import type { Project } from '../types/project'
import { getActiveStorageUserId } from '../storage/userScope'
import { cacheGet, cacheInvalidate, cacheSet, CacheKeys } from './memoryCache'
import {
  createNeonProject,
  deleteNeonProject,
  fetchNeonProjects,
  isNeonUploadPreferred,
} from './neonProjectApi'

function notifyProjectsChanged(): void {
  window.dispatchEvent(new Event('scarper:projects-changed'))
}

function projectsCacheKey(): string[] {
  return CacheKeys.projects(getActiveStorageUserId() ?? '')
}

/** 立即返回缓存/本地项目（不等待网络） */
export function peekProjects(): Project[] {
  const cached = cacheGet<Project[]>(projectsCacheKey(), 600_000)
  if (cached && cached.length > 0) return cached
  return listProjectsLocal()
}

export function invalidateProjectsCache(): void {
  cacheInvalidate(projectsCacheKey())
}

/**
 * 列表：Neon 可用时以数据库为准并同步到 localStorage 缓存。
 * 有缓存时立即返回，后台刷新（stale-while-revalidate）。
 */
export async function listProjects(): Promise<Project[]> {
  const local = listProjectsLocal()
  const key = projectsCacheKey()
  if (!isNeonUploadPreferred()) {
    if (local.length > 0) cacheSet(key, local)
    return local
  }

  const stale = peekProjects()
  if (stale.length > 0) {
    void fetchNeonProjects()
      .then((remote) => {
        replaceProjectsLocal(remote)
        cacheSet(key, remote)
        notifyProjectsChanged()
      })
      .catch(() => {})
    return stale
  }

  try {
    const remote = await fetchNeonProjects()
    replaceProjectsLocal(remote)
    cacheSet(key, remote)
    return remote
  } catch (e) {
    if (e instanceof Error && e.name === 'NeonAuthError') {
      return local
    }
    if (
      e instanceof Error &&
      (e.name === 'NeonNotConfiguredError' || e.message.includes('503'))
    ) {
      return local
    }
    if (local.length > 0) {
      return local
    }
    throw e
  }
}

export async function createProject(input: {
  name: string
  description?: string
}): Promise<Project> {
  const local = createProjectLocal(input)

  if (isNeonUploadPreferred()) {
    try {
      const remote = await createNeonProject({
        id: local.id,
        name: local.name,
        description: local.description,
      })
      const merged = listProjectsLocal()
        .map((p) => (p.id === local.id ? remote : p))
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
      replaceProjectsLocal(merged)
      cacheSet(projectsCacheKey(), merged)
      notifyProjectsChanged()
      return remote
    } catch (e) {
      deleteProjectLocal(local.id)
      notifyProjectsChanged()
      throw e
    }
  }

  return local
}

export async function deleteProject(id: string): Promise<void> {
  if (isNeonUploadPreferred()) {
    try {
      await deleteNeonProject(id)
    } catch (e) {
      if (!(e instanceof Error && e.message.includes('404'))) {
        throw e
      }
    }
  }

  deleteProjectLocal(id)
  deleteProjectEntriesLocal(id)
  invalidateProjectsCache()
  notifyProjectsChanged()
}

export async function touchProject(id: string): Promise<void> {
  touchProjectLocal(id)
  notifyProjectsChanged()
}
