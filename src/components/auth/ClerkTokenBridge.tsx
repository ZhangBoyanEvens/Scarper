import { useAuth } from '@clerk/clerk-react'
import { useCallback, useEffect } from 'react'
import { clerkJwtTemplate } from '../../config/clerk'
import { invalidateProjectsCache } from '../../services/projectService'
import { invalidateRecordsCache } from '../../services/projectRecordService'
import { clearNeonStatusCache } from '../../services/neonProjectApi'
import { cacheInvalidate } from '../../services/memoryCache'
import {
  clearAuthTokenGetter,
  registerAuthTokenGetter,
} from '../../services/authToken'
import { setSelectedProjectId } from '../../storage/projectDatabaseStorage'
import { setActiveStorageUserId } from '../../storage/userScope'

/** 将 Clerk session token 注入 API 层，并按账户隔离本地缓存 */
export function ClerkTokenBridge() {
  const { getToken, isSignedIn, userId } = useAuth()

  useEffect(() => {
    setActiveStorageUserId(isSignedIn && userId ? userId : null)
    clearNeonStatusCache()
    invalidateProjectsCache()
    invalidateRecordsCache()
    cacheInvalidate(['taskText'])
    setSelectedProjectId(null)
    window.dispatchEvent(new Event('scarper:projects-changed'))
    window.dispatchEvent(new Event('scarper:project-records-changed'))
  }, [isSignedIn, userId])

  const fetchClerkJwt = useCallback(async () => {
    if (!isSignedIn) return null
    try {
      const opts = clerkJwtTemplate
        ? { template: clerkJwtTemplate, skipCache: true as const }
        : { skipCache: true as const }
      return (await getToken(opts)) ?? null
    } catch {
      return null
    }
  }, [getToken, isSignedIn])

  useEffect(() => {
    if (!isSignedIn) {
      clearAuthTokenGetter()
      return
    }
    registerAuthTokenGetter(fetchClerkJwt)
    return () => clearAuthTokenGetter()
  }, [fetchClerkJwt, isSignedIn])

  return null
}
