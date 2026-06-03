export type SettingsSectionId =
  | 'account'
  | 'language'
  | 'workflow'
  | 'interface'
  | 'data'
  | 'api'
  | 'diagnostics'

export const SETTINGS_SECTIONS: { id: SettingsSectionId; label: string }[] = [
  { id: 'account', label: '账号' },
  { id: 'language', label: '语言' },
  { id: 'workflow', label: '工作流' },
  { id: 'interface', label: '界面' },
  { id: 'data', label: '数据' },
  { id: 'api', label: 'API' },
  { id: 'diagnostics', label: '测试' },
]
