export type AppView =
  | 'homepage'
  | 'tutorial'
  | 'project'
  | 'tools'
  | 'findoc'
  | 'findoc-templates'
  | 'rag-chat'
  | 'vetra'
  | 'scrape'
  | 'settings'

export const APP_NAV_ITEMS: AppView[] = [
  'homepage',
  'project',
  'tools',
  'settings',
]

export const DEFAULT_APP_VIEW: AppView = 'homepage'

const TOOLS_FAMILY: ReadonlySet<AppView> = new Set([
  'tools',
  'scrape',
  'findoc',
  'findoc-templates',
  'rag-chat',
  'vetra',
])

export function isToolsFamilyView(view: AppView): boolean {
  return TOOLS_FAMILY.has(view)
}
