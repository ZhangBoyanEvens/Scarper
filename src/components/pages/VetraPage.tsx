import { useState } from 'react'
import { VetraCompaniesIntroView } from '../vetra/VetraCompaniesIntroView'
import { VetraSideNavbar } from '../vetra/VetraSideNavbar'
import { VetraOutreachView } from '../vetra/VetraOutreachView'
import { VetraTemplatesView } from '../vetra/VetraTemplatesView'
import { VetraWorkspaceProvider } from '../vetra/VetraWorkspaceContext'
import type { VetraNavId } from '../vetra/vetraNav'
import './VetraPage.css'

function VetraPlaceholder({ title }: { title: string }) {
  return (
    <div className="vetra-main__placeholder">
      <p className="vetra-main__placeholder-title">{title}</p>
      <p className="vetra-main__placeholder-hint">Coming soon</p>
    </div>
  )
}

function VetraPageContent() {
  const [activeNav, setActiveNav] = useState<VetraNavId>('companies')

  return (
    <div className="vetra-shell">
      <VetraSideNavbar activeId={activeNav} onNavigate={setActiveNav} />
      <div className={`vetra-main${activeNav === 'outreach' ? ' vetra-main--outreach' : ''}`}>
        {activeNav === 'dashboard' && <VetraPlaceholder title="Dashboard" />}
        {activeNav === 'companies' && <VetraCompaniesIntroView />}
        {activeNav === 'outreach' && <VetraOutreachView />}
        {activeNav === 'templates' && <VetraTemplatesView />}
        {activeNav === 'reports' && <VetraPlaceholder title="Reports" />}
      </div>
    </div>
  )
}

export function VetraPage() {
  return (
    <main className="app-main vetra-page" aria-label="Vetra">
      <VetraWorkspaceProvider>
        <VetraPageContent />
      </VetraWorkspaceProvider>
    </main>
  )
}
