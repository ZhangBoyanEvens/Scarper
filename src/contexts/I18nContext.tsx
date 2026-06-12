import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { createTranslator } from '../i18n/translator'
import type { TranslateParams, UiLocale } from '../i18n/types'
import { useAppSettings } from './AppSettingsContext'

type TranslateFn = (path: string, params?: TranslateParams) => string

interface I18nContextValue {
  locale: UiLocale
  t: TranslateFn
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings } = useAppSettings()
  const locale = settings.ui.locale

  const value = useMemo<I18nContextValue>(() => {
    const t = createTranslator(locale)
    return { locale, t }
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return ctx
}

