import type { OutputDetail } from '../types/outputDetail'
import type { OutputLanguage } from '../types/outputLanguage'

type TranslateFn = (path: string) => string

export function getLocalizedOutputLanguageOptions(t: TranslateFn) {
  const values: OutputLanguage[] = ['zh', 'original', 'en']
  return values.map((value) => ({
    value,
    label: t(`outputLanguage.${value}.label`),
    description: t(`outputLanguage.${value}.description`),
  }))
}

export function getLocalizedOutputDetailOptions(t: TranslateFn) {
  const values: OutputDetail[] = ['concise', 'detailed']
  return values.map((value) => ({
    value,
    label: t(`outputDetail.${value}.label`),
    description: t(`outputDetail.${value}.description`),
  }))
}

export function getLocalizedOutputLanguageLabel(
  t: TranslateFn,
  lang: OutputLanguage,
): string {
  return t(`outputLanguage.${lang}.label`)
}

export function getLocalizedOutputDetailLabel(
  t: TranslateFn,
  detail: OutputDetail,
): string {
  return t(`outputDetail.${detail}.label`)
}
