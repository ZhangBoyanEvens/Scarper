export const VETRA_NAV_ITEMS = [

  { id: 'companies', labelKey: 'vetra.nav.companies' },

  { id: 'outreach', labelKey: 'vetra.nav.outreach' },

  { id: 'templates', labelKey: 'vetra.nav.templates' },

] as const



export type VetraNavId = (typeof VETRA_NAV_ITEMS)[number]['id']

