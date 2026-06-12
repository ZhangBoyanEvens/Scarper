import {
  DEFAULT_TASK_TIMEOUT_SEC,
  clampTaskTimeoutSec,
} from '../config/timeouts'
import {
  DEFAULT_COST_CURRENCY,
  isCostCurrencyCode,
  loadCostCurrency,
  saveCostCurrency,
  type CostCurrencyCode,
} from '../config/currency'
import { DEFAULT_OUTPUT_DETAIL, type OutputDetail } from '../types/outputDetail'
import {
  DEFAULT_OUTPUT_LANGUAGE,
  type OutputLanguage,
} from '../types/outputLanguage'
import type { UiLocale } from '../i18n/types'
import { loadSavedPrompt, savePromptToStorage } from './promptStorage'

const STORAGE_KEY = 'scarper.app.settings.v1'
const LEGACY_UPLOAD_BODY_KEY = 'scarper.scrape.uploadIncludeBody'

export interface UiSettings {
  /** Scarper UI display language (separate from AI output language) */
  locale: UiLocale
  compactMode: boolean
  showProgressHints: boolean
  reduceMotion: boolean
}

export interface ApiSettings {
  /** 留空则使用环境变量 / Vite 代理 */
  customBackendUrl: string
}

export interface ScrapeSettings {
  /** 单个链接抓取 + AI 的前端超时（秒） */
  taskTimeoutSec: number
  /** 多 URL 任务默认勾选 AI 整合 */
  defaultAiIntegrate: boolean
  /** 上传到 Project 时默认包含正文 */
  uploadIncludeBody: boolean
}

export interface AppSettings {
  outputLanguage: OutputLanguage
  outputDetail: OutputDetail
  costCurrency: CostCurrencyCode
  processingPrompt: string
  ui: UiSettings
  api: ApiSettings
  scrape: ScrapeSettings
}

export const DEFAULT_UI_SETTINGS: UiSettings = {
  locale: 'en',
  compactMode: false,
  showProgressHints: true,
  reduceMotion: false,
}

export const DEFAULT_API_SETTINGS: ApiSettings = {
  customBackendUrl: '',
}

export const DEFAULT_SCRAPE_SETTINGS: ScrapeSettings = {
  taskTimeoutSec: DEFAULT_TASK_TIMEOUT_SEC,
  defaultAiIntegrate: false,
  uploadIncludeBody: false,
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  outputLanguage: DEFAULT_OUTPUT_LANGUAGE,
  outputDetail: DEFAULT_OUTPUT_DETAIL,
  costCurrency: DEFAULT_COST_CURRENCY,
  processingPrompt: '',
  ui: DEFAULT_UI_SETTINGS,
  api: DEFAULT_API_SETTINGS,
  scrape: DEFAULT_SCRAPE_SETTINGS,
}

function loadLegacyUploadIncludeBody(): boolean {
  try {
    return localStorage.getItem(LEGACY_UPLOAD_BODY_KEY) === '1'
  } catch {
    return false
  }
}

function normalizeSettings(parsed: Partial<AppSettings>): AppSettings {
  const processingPrompt =
    typeof parsed.processingPrompt === 'string'
      ? parsed.processingPrompt
      : (loadSavedPrompt() ?? '')

  const costCurrency = isCostCurrencyCode(parsed.costCurrency)
    ? parsed.costCurrency
    : loadCostCurrency()

  return {
    outputLanguage: isOutputLanguage(parsed.outputLanguage)
      ? parsed.outputLanguage
      : DEFAULT_OUTPUT_LANGUAGE,
    outputDetail: isOutputDetail(parsed.outputDetail)
      ? parsed.outputDetail
      : DEFAULT_OUTPUT_DETAIL,
    costCurrency,
    processingPrompt,
    ui: {
      locale: isUiLocale(parsed.ui?.locale)
        ? parsed.ui.locale
        : DEFAULT_UI_SETTINGS.locale,
      compactMode: parsed.ui?.compactMode ?? DEFAULT_UI_SETTINGS.compactMode,
      showProgressHints:
        parsed.ui?.showProgressHints ?? DEFAULT_UI_SETTINGS.showProgressHints,
      reduceMotion: parsed.ui?.reduceMotion ?? DEFAULT_UI_SETTINGS.reduceMotion,
    },
    api: {
      customBackendUrl:
        typeof parsed.api?.customBackendUrl === 'string'
          ? parsed.api.customBackendUrl
          : '',
    },
    scrape: {
      taskTimeoutSec: clampTaskTimeoutSec(
        typeof parsed.scrape?.taskTimeoutSec === 'number'
          ? parsed.scrape.taskTimeoutSec
          : DEFAULT_TASK_TIMEOUT_SEC,
      ),
      defaultAiIntegrate:
        parsed.scrape?.defaultAiIntegrate ?? DEFAULT_SCRAPE_SETTINGS.defaultAiIntegrate,
      uploadIncludeBody:
        parsed.scrape?.uploadIncludeBody ?? loadLegacyUploadIncludeBody(),
    },
  }
}

function isOutputLanguage(v: unknown): v is OutputLanguage {
  return v === 'zh' || v === 'original' || v === 'en'
}

function isOutputDetail(v: unknown): v is OutputDetail {
  return v === 'detailed' || v === 'concise'
}

function isUiLocale(v: unknown): v is UiLocale {
  return v === 'en' || v === 'zh'
}

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return normalizeSettings({})
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return normalizeSettings(parsed)
  } catch {
    return normalizeSettings({})
  }
}

export function saveAppSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  saveCostCurrency(settings.costCurrency)
  savePromptToStorage(settings.processingPrompt)
  try {
    localStorage.setItem(
      LEGACY_UPLOAD_BODY_KEY,
      settings.scrape.uploadIncludeBody ? '1' : '0',
    )
  } catch {
    /* ignore */
  }
}
