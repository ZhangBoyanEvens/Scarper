export type OutputDetail = 'detailed' | 'concise'

export const OUTPUT_DETAIL_OPTIONS: {
  value: OutputDetail
  label: string
}[] = [
  { value: 'detailed', label: '详细' },
  { value: 'concise', label: '精简' },
]

export const DEFAULT_OUTPUT_DETAIL: OutputDetail = 'concise'
