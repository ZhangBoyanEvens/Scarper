/** 当前登录账户 — 用于 localStorage / 缓存与 Neon schema 对齐（Clerk user id） */

let activeUserId: string | null = null

export function setActiveStorageUserId(userId: string | null): void {
  activeUserId = userId?.trim() || null
}

export function getActiveStorageUserId(): string | null {
  return activeUserId
}

/** 生成按账户隔离的 localStorage 键 */
export function scopedStorageKey(base: string): string {
  const uid = activeUserId ?? 'anonymous'
  const safe = uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  return `${base}.${safe}`
}
