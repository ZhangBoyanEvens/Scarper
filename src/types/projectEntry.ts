import type { ExtractResponse } from './extraction'

export interface ProjectDatabaseEntry {
  id: string
  projectId: string
  uploadedAt: string
  results: ExtractResponse[]
  /** 本次上传是否包含正文 */
  bodyOnly?: boolean
  source?: string
  uploadMethod?: string
  /** Dashboard 保存后的正文（本地模式） */
  editorText?: string
  /** Dashboard 手动新建时的记录名称 */
  title?: string
  /** FinDoc Save 时的 Proceed 条件，用于相同条件下直接加载 */
  findocContext?: {
    templateId: string
    taskIds: string[]
    adjustmentPrompt: string
  }
}
