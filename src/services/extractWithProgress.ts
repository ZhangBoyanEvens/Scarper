import type { ExtractionStep } from '../i18n/scrapeHelpers'
import { extractUrl, type ExtractOptions } from './crawlerApi'
import type { ExtractResponse } from '../types/extraction'

export type ExtractProgressCallback = (
  stepLabel: string,
  urlProgress: number,
  stepHint?: string,
) => void

function progressForStep(index: number, stepCount: number): number {
  return Math.round(((index + 0.5) / stepCount) * 90)
}

export async function extractUrlWithProgress(
  url: string,
  options?: ExtractOptions & {
    onProgress?: ExtractProgressCallback
    steps?: readonly ExtractionStep[]
    doneLabel?: string
  },
): Promise<ExtractResponse> {
  const { onProgress, steps = [], doneLabel = 'Done', ...extractOptions } =
    options ?? {}
  const extractionSteps = steps.length > 0 ? steps : []
  let stepIndex = 0
  const timers: number[] = []

  const emit = (index: number) => {
    const step: ExtractionStep =
      extractionSteps[index] ?? extractionSteps.at(-1)!
    if (!step) return
    onProgress?.(step.label, progressForStep(index, extractionSteps.length), step.hint)
  }

  const scheduleNext = () => {
    if (stepIndex >= extractionSteps.length - 1) return
    const step = extractionSteps[stepIndex]
    if (!Number.isFinite(step.durationMs)) return
    const id = window.setTimeout(() => {
      stepIndex += 1
      emit(stepIndex)
      scheduleNext()
    }, step.durationMs)
    timers.push(id)
  }

  if (extractionSteps.length > 0) {
    emit(0)
    scheduleNext()
  }

  try {
    const result = await extractUrl(url, extractOptions)
    onProgress?.(doneLabel, 100, undefined)
    return result
  } finally {
    for (const id of timers) {
      window.clearTimeout(id)
    }
  }
}
