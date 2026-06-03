export type OutputDetail = 'detailed' | 'concise'

export interface OutputDetailOption {
  value: OutputDetail
  label: string
  description: string
}

export const OUTPUT_DETAIL_OPTIONS: OutputDetailOption[] = [
  {
    value: 'concise',
    label: 'Concise',
    description: 'Shorter summaries; faster extraction',
  },
  {
    value: 'detailed',
    label: 'Detailed',
    description: 'More key points and structure; better for long articles',
  },
]

export const DEFAULT_OUTPUT_DETAIL: OutputDetail = 'concise'

export function getOutputDetailLabel(detail: OutputDetail): string {
  return OUTPUT_DETAIL_OPTIONS.find((o) => o.value === detail)?.label ?? 'Concise'
}