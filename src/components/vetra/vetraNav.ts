export const VETRA_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'companies', label: 'Companies' },
  { id: 'outreach', label: 'Outreach' },
  { id: 'templates', label: 'Templates' },
  { id: 'reports', label: 'Reports' },
] as const

export type VetraNavId = (typeof VETRA_NAV_ITEMS)[number]['id']
