import type { UiLocale } from './types'

export function localeDateTimeTag(locale: UiLocale): string {
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}

export function formatLocaleDateTime(iso: string, locale: UiLocale): string {
  try {
    return new Date(iso).toLocaleString(localeDateTimeTag(locale), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function formatLocaleShortDateTime(iso: string, locale: UiLocale): string {
  try {
    return new Date(iso).toLocaleString(localeDateTimeTag(locale), {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
