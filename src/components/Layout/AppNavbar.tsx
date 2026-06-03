import { UserButton, useUser } from '@clerk/clerk-react'
import {
  formatExtractQuota,
  useUserProfile,
} from '../../contexts/UserProfileContext'
import { isClerkConfigured } from '../../config/clerk'
import { APP_NAV_ITEMS, isToolsFamilyView, type AppView } from '../../types/appView'
import { BrandMark } from '../Brand/BrandMark'
import './AppNavbar.css'

interface AppNavbarProps {
  activeView: AppView
  scrapeRunning?: boolean
  navItems?: typeof APP_NAV_ITEMS
  onNavigate: (view: AppView) => void
}

export function AppNavbar({
  activeView,
  scrapeRunning = false,
  navItems = APP_NAV_ITEMS,
  onNavigate,
}: AppNavbarProps) {
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

        <div className="app-navbar-nav" role="navigation" aria-label="应用页面">
          {navItems.map((item) => {
            const isActive =
              activeView === item.id ||
              (item.id === 'tools' && isToolsFamilyView(activeView))
            const isScrapeBusy = item.id === 'tools' && scrapeRunning

            return (
            <button
              key={item.id}
              type="button"
              className={`app-navbar-link${isActive ? ' app-navbar-link--active' : ''}${isScrapeBusy ? ' app-navbar-link--busy' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
              {isScrapeBusy && (
                <span className="app-navbar-link__dot" aria-label="Scrape in progress" />
              )}
            </button>
            )
          })}
        </div>

        {isClerkConfigured && isLoaded && user && (
          <div className="app-navbar-user">
            <div className="app-navbar-stats">
              <div className="navbar-stat">
                <span className="navbar-stat-label">Today</span>
                <span className="navbar-stat-value navbar-stat-value--quota">
                  {quotaText}
                </span>
              </div>
              <div className="navbar-stat">
                <span className="navbar-stat-label">Plan</span>
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
