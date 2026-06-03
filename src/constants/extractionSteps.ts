/** Frontend progress steps (roughly aligned with backend; durations are estimates). */

export interface ExtractionStep {
  label: string
  /** Display duration before advancing; last step runs until the request finishes */
  durationMs: number
  hint?: string
}

export const EXTRACTION_STEPS: readonly ExtractionStep[] = [
  { label: 'Validating URL…', durationMs: 1500 },
  {
    label: 'Fetching page…',
    durationMs: 10_000,
    hint: 'Dynamic sites may use browser rendering and take longer',
  },
  {
    label: 'Parsing content…',
    durationMs: 8000,
    hint: 'Complex pages may trigger AI-assisted parsing',
  },
  {
    label: 'Generating AI summary…',
    durationMs: Number.POSITIVE_INFINITY,
    hint: 'Calling DeepSeek; long pages or Detailed mode may take up to ~55s',
  },
] as const

export const EXTRACTION_DONE_LABEL = 'Done'

/** @deprecated Use each step’s durationMs in EXTRACTION_STEPS */
export const EXTRACTION_STEP_LABELS = EXTRACTION_STEPS.map((s) => s.label)

export const EXTRACTION_STEP_INTERVAL_MS = 2200
