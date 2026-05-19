import { SignedIn, SignedOut } from '@clerk/clerk-react'
import type { ReactNode } from 'react'
import { isClerkConfigured } from '../../config/clerk'
import { AuthPage } from './AuthPage'
import { ClerkTokenBridge } from './ClerkTokenBridge'

interface AuthGateProps {
  children: ReactNode
}

/** 未配置 Clerk 时直通；已配置则需登录 */
export function AuthGate({ children }: AuthGateProps) {
  if (!isClerkConfigured) {
    return <>{children}</>
  }

  return (
    <>
      <ClerkTokenBridge />
      <SignedOut>
        <AuthPage />
      </SignedOut>
      <SignedIn>{children}</SignedIn>
    </>
  )
}
