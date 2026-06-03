import type { ReactNode } from 'react'
import { isClerkConfigured } from '../../config/clerk'
import { ClerkTokenBridge } from './ClerkTokenBridge'

interface AuthGateProps {
  children: ReactNode
}

/** 未配置 Clerk 时直通；已配置时始终进入应用，登录在 Homepage 右侧 */
export function AuthGate({ children }: AuthGateProps) {
  if (!isClerkConfigured) {
    return <>{children}</>
  }

  return (
    <>
      <ClerkTokenBridge />
      {children}
    </>
  )
}
