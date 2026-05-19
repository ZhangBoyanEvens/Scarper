import { apiBase } from '../config/api'
import type { UserProfile } from '../types/user'
import { buildAuthHeaders } from './authToken'

/** 获取当前登录用户资料（需 Clerk Token） */
export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const meUrl = apiBase ? `${apiBase}/api/user/me` : '/api/user/me'
  const res = await fetch(meUrl, {
    headers: await buildAuthHeaders(),
  })
  if (res.status === 401) return null
  if (!res.ok) return null
  return (await res.json()) as UserProfile
}
