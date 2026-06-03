import { useAuth } from '@clerk/clerk-react'
import { useEffect, useMemo, useState } from 'react'
import { useScrapeSessionOptional } from './contexts/ScrapeSessionContext'
import { isClerkConfigured } from './config/clerk'
import { listProjects } from './services/projectService'
import { AppNavbar } from './components/Layout/AppNavbar'
import { DashboardPage } from './components/pages/DashboardPage'
import { FinDocPage } from './components/pages/FinDocPage'
import { FinDocTemplateSetupPage } from './components/pages/FinDocTemplateSetupPage'
import { HomepagePage } from './components/pages/HomepagePage'
import { TutorialPage } from './components/pages/TutorialPage'
import { ProjectPage } from './components/pages/ProjectPage'
import { SettingsPage } from './components/pages/SettingsPage'
import { ScarperApp } from './ScarperApp'
import { RagChatPage } from './components/pages/RagChatPage'
import { ToolsPage } from './components/pages/ToolsPage'
import type { FindocOpenRequest } from './services/findocNavigation'
import {
  APP_NAV_ITEMS,
  DEFAULT_APP_VIEW,
  type AppView,
} from './types/appView'

interface AppLayoutBodyProps {
  authLocked: boolean
}

function AppLayoutBody({ authLocked }: AppLayoutBodyProps) {
  const [view, setView] = useState<AppView>(DEFAULT_APP_VIEW)
  const [findocPendingOpen, setFindocPendingOpen] =
    useState<FindocOpenRequest | null>(null)
  const [templateReturnView, setTemplateReturnView] = useState<AppView>('tools')
  const scrapeSession = useScrapeSessionOptional()
  const scrapeRunning = scrapeSession?.isRunning ?? false

  const navItems = useMemo(
    () =>
      authLocked
        ? APP_NAV_ITEMS.filter((item) => item.id === 'homepage')
        : APP_NAV_ITEMS,
    [authLocked],
  )

  useEffect(() => {
    void listProjects().catch(() => {})
  }, [])

  useEffect(() => {
    if (authLocked) setView('homepage')
  }, [authLocked])

  const handleNavigate = (next: AppView) => {
    if (authLocked && next !== 'homepage') return
    setView(next)
  }

  const handleOpenFindocRecord = (projectId: string, recordId: string) => {
    setFindocPendingOpen({ projectId, recordId })
    setView('findoc')
  }

  return (
    <>
      <AppNavbar
        activeView={view}
        scrapeRunning={scrapeRunning}
        navItems={navItems}
        onNavigate={handleNavigate}
      />
      {view === 'homepage' && (
        <HomepagePage
          onStart={() => handleNavigate('scrape')}
          onTutorial={() => handleNavigate('tutorial')}
        />
      )}
      {view === 'tutorial' && !authLocked && (
        <TutorialPage
          onBackHome={() => handleNavigate('homepage')}
          onNavigate={handleNavigate}
        />
      )}
      {view === 'project' && !authLocked && (
        <ProjectPage onOpenFindocRecord={handleOpenFindocRecord} />
      )}
      {view === 'dashboard' && !authLocked && <DashboardPage />}
      {view === 'tools' && !authLocked && (
        <ToolsPage
          onOpenScrape={() => handleNavigate('scrape')}
          onOpenFindoc={() => handleNavigate('findoc')}
          onOpenTemplates={() => {
            setTemplateReturnView('tools')
            handleNavigate('findoc-templates')
          }}
          onOpenRagChat={() => handleNavigate('rag-chat')}
        />
      )}
      {view === 'rag-chat' && !authLocked && <RagChatPage />}
      {view === 'findoc' && !authLocked && (
        <FinDocPage
          pendingOpen={findocPendingOpen}
          onPendingOpenConsumed={() => setFindocPendingOpen(null)}
          onCreateTemplate={() => {
            setTemplateReturnView('findoc')
            handleNavigate('findoc-templates')
          }}
        />
      )}
      {view === 'findoc-templates' && !authLocked && (
        <FinDocTemplateSetupPage
          onBack={() => handleNavigate(templateReturnView)}
        />
      )}
      {view === 'scrape' && !authLocked && <ScarperApp />}
      {view === 'settings' && !authLocked && <SettingsPage />}
    </>
  )
}

function AppLayoutWithClerk() {
  const { isSignedIn, isLoaded } = useAuth()
  /** 未加载完或未登录：仅 Homepage（登录入口） */
  const authLocked = !isLoaded || !isSignedIn
  return <AppLayoutBody authLocked={authLocked} />
}

export function AppLayout() {
  if (!isClerkConfigured) {
    return <AppLayoutBody authLocked={false} />
  }
  return <AppLayoutWithClerk />
}
