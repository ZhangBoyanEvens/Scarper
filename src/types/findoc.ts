export interface FindocOpenRequest {
  projectId: string
  recordId: string
}

/** Proceed 时的匹配条件：Template + Tasks 顺序 + Prompt */
export interface FindocProceedContext {
  templateId: string
  taskIds: string[]
  adjustmentPrompt: string
}
