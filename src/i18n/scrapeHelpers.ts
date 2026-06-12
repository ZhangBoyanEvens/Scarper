import type { TranslateParams } from './types'
import { MAX_URLS_PER_BATCH, parseUrlBatch, normalizeUrl } from '../utils/urlValidation'

type TranslateFn = (path: string, params?: TranslateParams) => string

export interface ExtractionStep {
  label: string
  durationMs: number
  hint?: string
}

export function getExtractionSteps(t: TranslateFn): readonly ExtractionStep[] {
  return [
    { label: t('scrape.extraction.validating'), durationMs: 1500 },
    {
      label: t('scrape.extraction.fetching'),
      durationMs: 10_000,
      hint: t('scrape.extraction.fetchingHint'),
    },
    {
      label: t('scrape.extraction.parsing'),
      durationMs: 8000,
      hint: t('scrape.extraction.parsingHint'),
    },
    {
      label: t('scrape.extraction.summarizing'),
      durationMs: Number.POSITIVE_INFINITY,
      hint: t('scrape.extraction.summarizingHint'),
    },
  ]
}

export function getExtractionDoneLabel(t: TranslateFn): string {
  return t('scrape.extraction.done')
}

export function urlValidationMessage(input: string, t: TranslateFn): string | null {
  const trimmed = input.trim()
  if (!trimmed) return t('scrape.validation.enterUrl')

  const rawParts = trimmed.split('???')
  if (rawParts.every((p) => !p.trim())) {
    return t('scrape.validation.enterUrl')
  }

  const invalidIndexes: number[] = []
  rawParts.forEach((part, index) => {
    if (!part.trim()) return
    if (!normalizeUrl(part)) invalidIndexes.push(index + 1)
  })

  if (invalidIndexes.length > 0) {
    return t('scrape.validation.invalidUrls', {
      indexes: invalidIndexes.join(', #'),
    })
  }

  const urls = parseUrlBatch(trimmed)
  if (urls.length === 0) return t('scrape.validation.invalidUrl')
  if (urls.length > MAX_URLS_PER_BATCH) {
    return t('scrape.validation.tooMany', { max: MAX_URLS_PER_BATCH })
  }

  return null
}

export function formatScrapeUploadStatus(
  t: TranslateFn,
  params: {
    includeBody: boolean
    ok: number
    total: number
    timeLabel: string
    storage: 'neon' | 'local'
  },
): string {
  return t('scrape.upload.savedStatus', {
    body: params.includeBody
      ? t('scrape.upload.withBody')
      : t('scrape.upload.summaryOnly'),
    ok: params.ok,
    total: params.total,
    time: params.timeLabel,
    store:
      params.storage === 'neon'
        ? t('scrape.upload.storageNeon')
        : t('scrape.upload.storageLocal'),
  })
}
