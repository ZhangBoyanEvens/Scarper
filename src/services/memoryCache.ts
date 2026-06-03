const DEFAULT_TTL_MS = 120_000

type Entry<T> = { at: number; data: T }

const store = new Map<string, Entry<unknown>>()

function key(parts: string[]): string {
  return parts.join(':')
}

export function cacheGet<T>(parts: string[], ttlMs = DEFAULT_TTL_MS): T | null {
  const k = key(parts)
  const hit = store.get(k)
  if (!hit) return null
  if (Date.now() - hit.at > ttlMs) {
    store.delete(k)
    return null
  }
  return hit.data as T
}

export function cacheSet<T>(parts: string[], data: T): void {
  store.set(key(parts), { at: Date.now(), data })
}

export function cacheInvalidate(prefixParts: string[]): void {
  const prefix = key(prefixParts)
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}

export const CacheKeys = {
  projects: (userId: string) => ['projects', userId || 'anon'],
  records: (userId: string, projectId: string) => [
    'records',
    userId || 'anon',
    projectId,
  ],
  taskText: (userId: string, projectId: string, recordId: string) => [
    'taskText',
    userId || 'anon',
    projectId,
    recordId,
  ],
  uploadDetail: (userId: string, projectId: string, recordId: string) => [
    'uploadDetail',
    userId || 'anon',
    projectId,
    recordId,
  ],
}
