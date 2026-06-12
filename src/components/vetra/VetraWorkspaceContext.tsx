import { createContext, useContext, type ReactNode } from 'react'
import { useVetraCompanyWorkspace } from './useVetraCompanyWorkspace'
import { useVetraTemplateWorkspace } from './useVetraTemplateWorkspace'

type VetraWorkspaceContextValue = {
  companies: ReturnType<typeof useVetraCompanyWorkspace>
  templates: ReturnType<typeof useVetraTemplateWorkspace>
}

const VetraWorkspaceContext = createContext<VetraWorkspaceContextValue | null>(null)

export function VetraWorkspaceProvider({ children }: { children: ReactNode }) {
  const companies = useVetraCompanyWorkspace()
  const templates = useVetraTemplateWorkspace()

  return (
    <VetraWorkspaceContext.Provider value={{ companies, templates }}>
      {children}
    </VetraWorkspaceContext.Provider>
  )
}

function useVetraWorkspaceContext(): VetraWorkspaceContextValue {
  const workspace = useContext(VetraWorkspaceContext)
  if (!workspace) {
    throw new Error('useVetraWorkspace must be used within VetraWorkspaceProvider')
  }
  return workspace
}

export function useVetraCompanyWorkspaceContext() {
  return useVetraWorkspaceContext().companies
}

export function useVetraTemplateWorkspaceContext() {
  return useVetraWorkspaceContext().templates
}

