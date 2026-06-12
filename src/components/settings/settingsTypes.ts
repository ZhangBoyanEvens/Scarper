export type SettingsSectionId =
  | 'account'
  | 'language'
  | 'workflow'
  | 'interface'
  | 'data'
  | 'api'
  | 'diagnostics'

export const SETTINGS_SECTIONS: { id: SettingsSectionId }[] = [
  { id: 'account' },
  { id: 'language' },
  { id: 'workflow' },
  { id: 'interface' },
  { id: 'data' },
  { id: 'api' },
  { id: 'diagnostics' },
]
