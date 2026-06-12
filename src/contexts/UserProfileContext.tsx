import { useUser } from '@clerk/clerk-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { isClerkConfigured } from '../config/clerk'
import { fetchCurrentUser } from '../services/userApi'
import type { UserProfile } from '../types/user'

interface UserProfileContextValue {
  profile: UserProfile | null
  refreshProfile: () => Promise<void>
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null)

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useUser()
  const [profile, setProfile] = useState<UserProfile | null>(null)

  const refreshProfile = useCallback(async () => {
    if (!isClerkConfigured || !user) {
      setProfile(null)
      return
    }
    const data = await fetchCurrentUser()
    setProfile(data)
  }, [user?.id])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  const value = useMemo(
    () => ({ profile, refreshProfile }),
    [profile, refreshProfile],
  )

  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  )
}

export function useUserProfile() {
  const ctx = useContext(UserProfileContext)
  if (!ctx) {
    throw new Error('useUserProfile must be used within UserProfileProvider')
  }
  return ctx
}

/** 未配置 Clerk 或未包裹 Provider 时安全读取 */
export function useUserProfileOptional() {
  return useContext(UserProfileContext)
}

export function formatExtractQuota(
  profile: UserProfile | null,
  unlimitedLabel = '(unlimited)',
): string {
  const count = profile?.extract_count ?? 0
  const limit = profile?.extract_limit
  if (limit != null && limit > 0) {
    return `${count}/${limit}`
  }
  return `${count} ${unlimitedLabel}`
}
