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
}
