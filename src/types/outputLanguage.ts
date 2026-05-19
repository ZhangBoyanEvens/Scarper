export type OutputLanguage = 'zh' | 'original' | 'en'

export const OUTPUT_LANGUAGE_OPTIONS: {
  value: OutputLanguage
  label: string
}[] = [
  { value: 'zh', label: '中文' },
  { value: 'original', label: '原文' },
  { value: 'en', label: '英文' },
]

export const DEFAULT_OUTPUT_LANGUAGE: OutputLanguage = 'zh'
