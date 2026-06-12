import { Layout } from 'antd'
import { useAuth } from '@clerk/clerk-react'
import { useEffect, useMemo, useState } from 'react'
import { useScrapeSessionOptional } from './contexts/ScrapeSessionContext'
import { isClerkConfigured } from './config/clerk'
import { listProjects } from './services/projectService'
import { AppNavbar } from './components/Layout/AppNavbar'
import { FinDocPage } from './components/pages/FinDocPage'
import { FinDocTemplateSetupPage } from './components/pages/FinDocTemplateSetupPage'
import { HomepagePage } from './components/pages/HomepagePage'
import { TutorialPage } from './components/pages/TutorialPage'
import { ProjectPage } from './components/pages/ProjectPage'
import { SettingsPage } from './components/settings/SettingsPage'
import { ScarperApp } from './ScarperApp'
import { RagChatPage } from './components/pages/RagChatPage'
import { ToolsPage } from './components/pages/ToolsPage'
import { VetraPage } from './components/pages/VetraPage'
import type { FindocOpenRequest } from './types/findoc'
import {
  APP_NAV_ITEMS,
  DEFAULT_APP_VIEW,
  type AppView,
} from './types/appView'

const { Content } = Layout

interface AppLayoutBodyProps {
  authLocked: boolean
}

function AppLayoutBody({ authLocked }: AppLayoutBodyProps) {
  const [view, setView] = useState<AppView>(DEFAULT_APP_VIEW)
  const [findocPendingOpen, setFindocPendingOpen] =
    useState<FindocOpenRequest | null>(null)
  const scrapeSession = useScrapeSessionOptional()
  const scrapeRunning = scrapeSession?.isRunning ?? false

  const navItems = useMemo(
    () =>
      authLocked
        ? APP_NAV_ITEMS.filter((id) => id === 'homepage')
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
    <Layout style={{ minHeight: '100svh' }}>
      <AppNavbar
        activeView={view}
        scrapeRunning={scrapeRunning}
        navItems={navItems}
        onNavigate={handleNavigate}
      />
      <Content
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: view === 'homepage' ? '#141414' : '#f5f5f5',
        }}
      >
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
        {view === 'tools' && !authLocked && (
          <ToolsPage
            onOpenScrape={() => handleNavigate('scrape')}
            onOpenFindoc={() => handleNavigate('findoc')}
            onOpenTemplates={() => handleNavigate('findoc-templates')}
            onOpenRagChat={() => handleNavigate('rag-chat')}
            onOpenVetra={() => handleNavigate('vetra')}
          />
        )}
        {view === 'rag-chat' && !authLocked && <RagChatPage />}
        {view === 'vetra' && !authLocked && <VetraPage />}
        {view === 'findoc' && !authLocked && (
          <FinDocPage
            pendingOpen={findocPendingOpen}
            onPendingOpenConsumed={() => setFindocPendingOpen(null)}
            onCreateTemplate={() => handleNavigate('findoc-templates')}
          />
        )}
        {view === 'findoc-templates' && !authLocked && (
          <FinDocTemplateSetupPage />
        )}
        {view === 'scrape' && !authLocked && <ScarperApp />}
        {view === 'settings' && !authLocked && <SettingsPage />}
      </Content>
    </Layout>
  )
}

function AppLayoutWithClerk() {
  const { isSignedIn, isLoaded } = useAuth()
  const authLocked = !isLoaded || !isSignedIn
  return <AppLayoutBody authLocked={authLocked} />
}

export function AppLayout() {
  if (!isClerkConfigured) {
    return <AppLayoutBody authLocked={false} />
  }
  return <AppLayoutWithClerk />
}
