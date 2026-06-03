import type { ExtractResponse } from '../types/extraction'
import { isExtractSuccess } from '../types/extraction'

/** 数据库已保存的正文优先，否则由抓取结果生成 */
export function resolveStoredEditorText(
  results: ExtractResponse[],
  editorText?: string | null,
): string {
  const saved = editorText?.trim()
  if (saved) return saved
  return resultsToEditorText(results)
}

/** 将上传批次转为可编辑纯文本 */
export function resultsToEditorText(results: ExtractResponse[]): string {
  const blocks: string[] = []
  for (const item of results) {
    if (isExtractSuccess(item)) {
      const parts: string[] = []
      if (item.title?.trim()) parts.push(`### 标题\n${item.title.trim()}`)
      if (item.summary?.trim()) parts.push(`### 摘要\n${item.summary.trim()}`)
      if (item.key_points?.length) {
        parts.push(
          `### 要点\n${item.key_points.map((p) => `• ${p}`).join('\n')}`,
        )
      }
      if (item.content?.trim()) parts.push(`### 正文\n${item.content.trim()}`)
      const body = parts.join('\n')
      blocks.push(`## ${item.url}\n${body}`)
    } else {
      blocks.push(`## ${item.url}\n[错误] ${item.error}`)
    }
  }
  return blocks.join('\n\n---\n\n')
}
