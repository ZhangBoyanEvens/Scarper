import {
  EXTRACTION_DONE_LABEL,
  EXTRACTION_STEPS,
  type ExtractionStep,
} from '../constants/extractionSteps'
import { extractUrl, type ExtractOptions } from './crawlerApi'
import type { ExtractResponse } from '../types/extraction'

export type ExtractProgressCallback = (
  stepLabel: string,
  urlProgress: number,
  stepHint?: string,
) => void

function progressForStep(index: number): number {
  const total = EXTRACTION_STEPS.length
  return Math.round(((index + 0.5) / total) * 90)
}

export async function extractUrlWithProgress(
  url: string,
  options?: ExtractOptions & { onProgress?: ExtractProgressCallback },
): Promise<ExtractResponse> {
  const { onProgress, ...extractOptions } = options ?? {}
  let stepIndex = 0
  const timers: number[] = []

  const emit = (index: number) => {
    const step: ExtractionStep = EXTRACTION_STEPS[index] ?? EXTRACTION_STEPS.at(-1)!
    onProgress?.(step.label, progressForStep(index), step.hint)
  }

  const scheduleNext = () => {
    if (stepIndex >= EXTRACTION_STEPS.length - 1) return
    const step = EXTRACTION_STEPS[stepIndex]
    if (!Number.isFinite(step.durationMs)) return
    const id = window.setTimeout(() => {
      stepIndex += 1
      emit(stepIndex)
      scheduleNext()
    }, step.durationMs)
    timers.push(id)
  }

  emit(0)
  scheduleNext()

  try {
    const result = await extractUrl(url, extractOptions)
    onProgress?.(EXTRACTION_DONE_LABEL, 100, undefined)
    return result
  } finally {
    for (const id of timers) {
      window.clearTimeout(id)
    }
  }
}
