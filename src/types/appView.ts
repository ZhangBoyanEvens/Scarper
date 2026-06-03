export type AppView =
  | 'homepage'
  | 'tutorial'
  | 'project'
  | 'dashboard'
  | 'tools'
  | 'findoc'
  | 'findoc-templates'
  | 'rag-chat'
  | 'scrape'
  | 'settings'

export interface NavItem {
  id: AppView
  label: string
}

export const APP_NAV_ITEMS: NavItem[] = [
  { id: 'homepage', label: 'Homepage' },
  { id: 'project', label: 'Project' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'tools', label: 'Tools' },
  { id: 'settings', label: 'Setting' },
]

export const DEFAULT_APP_VIEW: AppView = 'homepage'

const TOOLS_FAMILY: ReadonlySet<AppView> = new Set([
  'tools',
  'scrape',
  'findoc',
  'findoc-templates',
  'rag-chat',
])

export function isToolsFamilyView(view: AppView): boolean {
  return TOOLS_FAMILY.has(view)
}
