import { useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { VetraCompaniesIntroView } from '../vetra/VetraCompaniesIntroView'
import { VetraSideNavbar } from '../vetra/VetraSideNavbar'
import { VetraOutreachView } from '../vetra/VetraOutreachView'
import { VetraTemplatesView } from '../vetra/VetraTemplatesView'
import { VetraWorkspaceProvider } from '../vetra/VetraWorkspaceContext'
import type { VetraNavId } from '../vetra/vetraNav'
import './VetraPage.css'

function VetraPageContent() {
  const { t } = useI18n()
  const [activeNav, setActiveNav] = useState<VetraNavId>('companies')

  const workspaceAria =
    activeNav === 'companies'
      ? t('vetra.workspace.companiesAria')
      : activeNav === 'templates'
        ? t('vetra.workspace.templatesAria')
        : t('vetra.workspace.outreachAria')

  return (
    <div className="vetra-shell">
      <VetraSideNavbar activeId={activeNav} onNavigate={setActiveNav} />
      <div
        className={`vetra-main${activeNav === 'outreach' ? ' vetra-main--outreach' : ''}`}
        aria-label={workspaceAria}
      >
        {activeNav === 'companies' && <VetraCompaniesIntroView />}
        {activeNav === 'outreach' && <VetraOutreachView />}
        {activeNav === 'templates' && <VetraTemplatesView />}
      </div>
    </div>
  )
}

export function VetraPage() {
  const { t } = useI18n()

  return (
    <main className="app-main vetra-page" aria-label={t('vetra.title')}>
      <VetraWorkspaceProvider>
        <VetraPageContent />
      </VetraWorkspaceProvider>
    </main>
  )
}
