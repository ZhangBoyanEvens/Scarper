export type OutputLanguage = 'zh' | 'original' | 'en'

export interface OutputLanguageOption {
  value: OutputLanguage
  label: string
  description: string
}

export const OUTPUT_LANGUAGE_OPTIONS: OutputLanguageOption[] = [
  {
    value: 'zh',
    label: 'Chinese',
    description: 'Summaries and body text in Chinese (other languages are translated)',
  },
  {
    value: 'original',
    label: 'Original',
    description: 'Keep the page’s original language; no translation',
  },
  {
    value: 'en',
    label: 'English',
    description: 'Summaries and body text in English',
  },
]

export const DEFAULT_OUTPUT_LANGUAGE: OutputLanguage = 'zh'

export function getOutputLanguageLabel(lang: OutputLanguage): string {
  return OUTPUT_LANGUAGE_OPTIONS.find((o) => o.value === lang)?.label ?? 'Chinese'
}

/** FinDoc / AI 系统提示中的语言要求 */
export function outputLanguageInstruction(lang: OutputLanguage): string {
  switch (lang) {
    case 'en':
      return 'English'
    case 'original':
      return '与素材原文语言一致（不翻译）'
    case 'zh':
    default:
      return '中文'
  }
}