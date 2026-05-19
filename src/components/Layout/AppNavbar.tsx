import { UserButton, useUser } from '@clerk/clerk-react'
import {
  formatExtractQuota,
  useUserProfile,
} from '../../contexts/UserProfileContext'
import { isClerkConfigured } from '../../config/clerk'
import { BrandMark } from '../Brand/BrandMark'
import './AppNavbar.css'

export function AppNavbar() {
  const { user, isLoaded } = useUser()
  const { profile } = useUserProfile()

  const displayName =
    profile?.name ?? user?.fullName ?? user?.username ?? '用户'
  const email = profile?.email ?? user?.primaryEmailAddress?.emailAddress ?? ''
  const planLabel = profile?.plan ?? 'free'
  const quotaText = formatExtractQuota(profile)

  return (
    <nav className="app-navbar" aria-label="主导航">
      <div className="app-navbar-inner">
        <div className="app-navbar-brand">
          <BrandMark size="sm" />
        </div>

        {isClerkConfigured && isLoaded && user && (
          <div className="app-navbar-user">
            <div className="app-navbar-stats">
              <div className="navbar-stat">
                <span className="navbar-stat-label">今日抓取</span>
                <span className="navbar-stat-value navbar-stat-value--quota">
                  {quotaText}
                </span>
              </div>
              <div className="navbar-stat">
                <span className="navbar-stat-label">计划</span>
                <span className="navbar-stat-value">{planLabel}</span>
              </div>
            </div>
            <div className="app-navbar-meta">
              <span className="app-navbar-name">{displayName}</span>
              {email && (
                <span className="app-navbar-email">{email}</span>
              )}
            </div>
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: 'app-navbar-avatar',
                },
              }}
            />
          </div>
        )}
      </div>
    </nav>
  )
}
