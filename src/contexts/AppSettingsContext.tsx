import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_SCRAPE_SETTINGS,
  loadAppSettings,
  saveAppSettings,
  type ApiSettings,
  type AppSettings,
  type ScrapeSettings,
  type UiSettings,
} from '../storage/settingsStorage'
import type { CostCurrencyCode } from '../config/currency'
import type { OutputDetail } from '../types/outputDetail'
import type { OutputLanguage } from '../types/outputLanguage'

interface AppSettingsContextValue {
  settings: AppSettings
  setOutputLanguage: (value: OutputLanguage) => void
  setOutputDetail: (value: OutputDetail) => void
  setCostCurrency: (value: CostCurrencyCode) => void
  setProcessingPrompt: (value: string) => void
  patchUi: (patch: Partial<UiSettings>) => void
  patchApi: (patch: Partial<ApiSettings>) => void
  patchScrape: (patch: Partial<ScrapeSettings>) => void
  resetToDefaults: () => void
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null)

function persist(next: AppSettings) {
  saveAppSettings(next)
  return next
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings())

  useEffect(() => {
    document.documentElement.classList.toggle(
      'reduce-motion',
      settings.ui.reduceMotion,
    )
    document.documentElement.classList.toggle(
      'settings-compact',
      settings.ui.compactMode,
    )
  }, [settings.ui.reduceMotion, settings.ui.compactMode])

  useEffect(() => {
    const htmlLang =
      settings.outputLanguage === 'en'
        ? 'en'
        : settings.outputLanguage === 'zh'
          ? 'zh-CN'
          : 'en'
    document.documentElement.lang = htmlLang
  }, [settings.outputLanguage])

  const setOutputLanguage = useCallback((outputLanguage: OutputLanguage) => {
    setSettings((prev) => persist({ ...prev, outputLanguage }))
  }, [])

  const setOutputDetail = useCallback((outputDetail: OutputDetail) => {
    setSettings((prev) => persist({ ...prev, outputDetail }))
  }, [])

  const setCostCurrency = useCallback((costCurrency: CostCurrencyCode) => {
    setSettings((prev) => persist({ ...prev, costCurrency }))
  }, [])

  const setProcessingPrompt = useCallback((processingPrompt: string) => {
    setSettings((prev) => persist({ ...prev, processingPrompt }))
  }, [])

  const patchUi = useCallback((patch: Partial<UiSettings>) => {
    setSettings((prev) =>
      persist({ ...prev, ui: { ...prev.ui, ...patch } }),
    )
  }, [])

  const patchApi = useCallback((patch: Partial<ApiSettings>) => {
    setSettings((prev) =>
      persist({ ...prev, api: { ...prev.api, ...patch } }),
    )
  }, [])

  const patchScrape = useCallback((patch: Partial<ScrapeSettings>) => {
    setSettings((prev) =>
      persist({ ...prev, scrape: { ...prev.scrape, ...patch } }),
    )
  }, [])

  const resetToDefaults = useCallback(() => {
    setSettings(
      persist({
        ...DEFAULT_APP_SETTINGS,
        ui: { ...DEFAULT_APP_SETTINGS.ui },
        api: { ...DEFAULT_APP_SETTINGS.api },
        scrape: { ...DEFAULT_SCRAPE_SETTINGS },
      }),
    )
  }, [])

  const value = useMemo(
    () => ({
      settings,
      setOutputLanguage,
      setOutputDetail,
      setCostCurrency,
      setProcessingPrompt,
      patchUi,
      patchApi,
      patchScrape,
      resetToDefaults,
    }),
    [
      settings,
      setOutputLanguage,
      setOutputDetail,
      setCostCurrency,
      setProcessingPrompt,
      patchUi,
      patchApi,
      patchScrape,
      resetToDefaults,
    ],
  )

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  )
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext)
  if (!ctx) {
    throw new Error('useAppSettings must be used within AppSettingsProvider')
  }
  return ctx
}

export function useAppSettingsOptional() {
  return useContext(AppSettingsContext)
}
