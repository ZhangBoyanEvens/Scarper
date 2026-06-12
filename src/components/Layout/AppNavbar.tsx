import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { UserButton, useUser } from '@clerk/clerk-react'
import {
  HomeOutlined,
  SettingOutlined,
  ToolOutlined,
  FolderOutlined,
} from '@ant-design/icons'
import { useI18n } from '../../contexts/I18nContext'
import {
  formatExtractQuota,
  useUserProfile,
} from '../../contexts/UserProfileContext'
import { isClerkConfigured } from '../../config/clerk'
import {
  APP_NAV_ITEMS,
  isToolsFamilyView,
  type AppView,
} from '../../types/appView'
import { BrandMark } from '../Brand/BrandMark'
import './AppNavbar.css'

const NAV_ICONS: Partial<Record<AppView, ReactNode>> = {
  homepage: <HomeOutlined />,
  project: <FolderOutlined />,
  tools: <ToolOutlined />,
  settings: <SettingOutlined />,
}

interface IndicatorStyle {
  x: number
  width: number
}

interface AppNavbarProps {
  activeView: AppView
  scrapeRunning?: boolean
  navItems?: AppView[]
  onNavigate: (view: AppView) => void
}

export function AppNavbar({
  activeView,
  scrapeRunning = false,
  navItems = APP_NAV_ITEMS,
  onNavigate,
}: AppNavbarProps) {
  const { t } = useI18n()
  const { user, isLoaded } = useUser()
  const { profile } = useUserProfile()

  const navRef = useRef<HTMLElement>(null)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [indicator, setIndicator] = useState<IndicatorStyle>({ x: 0, width: 0 })

  const displayName =
    profile?.name ??
    user?.fullName ??
    user?.username ??
    t('common.user')
  const email = profile?.email ?? user?.primaryEmailAddress?.emailAddress ?? ''
  const planLabel = profile?.plan ?? 'free'
  const quotaText = formatExtractQuota(profile, t('common.unlimited'))

  const selectedKey =
    activeView === 'homepage'
      ? 'homepage'
      : isToolsFamilyView(activeView)
        ? 'tools'
        : activeView

  const indicatorKey = hoverKey ?? selectedKey

  const updateIndicator = useCallback((key: string) => {
    const nav = navRef.current
    const item = itemRefs.current.get(key)
    if (!nav || !item) return

    const navRect = nav.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    setIndicator({
      x: itemRect.left - navRect.left + nav.scrollLeft,
      width: itemRect.width,
    })
  }, [])

  useLayoutEffect(() => {
    updateIndicator(indicatorKey)
  }, [indicatorKey, navItems.length, updateIndicator])

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const onReflow = () => updateIndicator(indicatorKey)
    const ro = new ResizeObserver(onReflow)
    ro.observe(nav)
    nav.addEventListener('scroll', onReflow, { passive: true })
    window.addEventListener('resize', onReflow)

    return () => {
      ro.disconnect()
      nav.removeEventListener('scroll', onReflow)
      window.removeEventListener('resize', onReflow)
    }
  }, [indicatorKey, updateIndicator])

  const registerItem = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) itemRefs.current.set(key, el)
    else itemRefs.current.delete(key)
  }

  return (
    <header className="app-navbar">
      <div className="app-navbar-inner">
        <div className="app-navbar-brand">
          <BrandMark size="sm" />
        </div>

        <div className="app-navbar-track" onMouseLeave={() => setHoverKey(null)}>
          <nav
            ref={navRef}
            className="app-navbar-nav"
            aria-label={t('nav.main')}
          >
            {navItems.map((navId) => {
              const isActive = selectedKey === navId
              const isHovered = hoverKey === navId
              const showBusy = navId === 'tools' && scrapeRunning

              return (
                <button
                  key={navId}
                  ref={registerItem(navId)}
                  type="button"
                  className={[
                    'app-navbar-link',
                    isActive && 'app-navbar-link--active',
                    isHovered && 'app-navbar-link--hover',
                    showBusy && 'app-navbar-link--busy',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onNavigate(navId)}
                  onMouseEnter={() => setHoverKey(navId)}
                  onFocus={() => setHoverKey(navId)}
                  onBlur={() => setHoverKey(null)}
                >
                  <span className="app-navbar-link__icon" aria-hidden>
                    {NAV_ICONS[navId]}
                  </span>
                  <span className="app-navbar-link__label">
                    {t(`nav.${navId}`)}
                  </span>
                  {showBusy ? (
                    <span
                      className="app-navbar-link__dot"
                      aria-label={t('nav.scrapeRunning')}
                    />
                  ) : null}
                </button>
              )
            })}
          </nav>

          <span
            className={`app-navbar-indicator${hoverKey && hoverKey !== selectedKey ? ' app-navbar-indicator--preview' : ''}`}
            aria-hidden
            style={{
              transform: `translateX(${indicator.x}px)`,
              width: indicator.width,
            }}
          />
        </div>

        {isClerkConfigured && isLoaded && user ? (
          <div className="app-navbar-user">
            <div className="app-navbar-stats">
              <div className="navbar-stat">
                <span className="navbar-stat-label">{t('nav.today')}</span>
                <span className="navbar-stat-value navbar-stat-value--quota">
                  {quotaText}
                </span>
              </div>
              <div className="navbar-stat">
                <span className="navbar-stat-label">{t('nav.plan')}</span>
                <span className="navbar-stat-value">{planLabel}</span>
              </div>
            </div>
            <div className="app-navbar-meta">
              <span className="app-navbar-name">{displayName}</span>
              {email ? (
                <span className="app-navbar-email">{email}</span>
              ) : null}
            </div>
            <UserButton afterSignOutUrl="/" />
          </div>
        ) : null}
      </div>
    </header>
  )
}
