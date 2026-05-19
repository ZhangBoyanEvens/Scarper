import { useAuth } from '@clerk/clerk-react'
import { useEffect } from 'react'
import {
  clearAuthTokenGetter,
  registerAuthTokenGetter,
} from '../../services/authToken'

/** 将 Clerk session token 注入 API 层 */
export function ClerkTokenBridge() {
  const { getToken, isSignedIn } = useAuth()

  useEffect(() => {
    if (!isSignedIn) {
      clearAuthTokenGetter()
      return
    }
    registerAuthTokenGetter(() => getToken())
    return () => clearAuthTokenGetter()
  }, [getToken, isSignedIn])

  return null
}
