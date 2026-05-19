const STORAGE_KEY = 'scarper.prompt'

/** 读取本地已保存的 prompt */
export function loadSavedPrompt(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** 保存处理指令到本地；搜索时会与抓取结果一并送入 API */
export function savePromptToStorage(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, text)
  } catch {
    // 存储不可用时静默失败
  }
}

/** 供后续 API 接入时读取 */
export function getSavedPrompt(): string | null {
  return loadSavedPrompt()
}
