import type { UserProfile } from '../types/user'
import { buildAuthHeaders } from './authToken'

const API_BASE = import.meta.env.VITE_API_BASE || ''

/** 获取当前登录用户资料（需 Clerk Token） */
export async function fetchCurrentUser(): Promise<UserProfile | null> {
  const res = await fetch(`${API_BASE}/api/user/me`, {
    headers: await buildAuthHeaders(),
  })
  if (res.status === 401) return null
  if (!res.ok) return null
  return (await res.json()) as UserProfile
}
