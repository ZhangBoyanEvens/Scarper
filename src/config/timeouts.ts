/** 略大于后端 EXTRACT_TIMEOUT_SEC，避免前端先断而后端仍返回 */
export const DEFAULT_TASK_TIMEOUT_SEC = 100
export const MIN_TASK_TIMEOUT_SEC = 30
export const MAX_TASK_TIMEOUT_SEC = 600

/** @deprecated 使用 taskTimeoutMs(settings) */
export const EXTRACT_REQUEST_TIMEOUT_MS = DEFAULT_TASK_TIMEOUT_SEC * 1000

export function clampTaskTimeoutSec(sec: number): number {
  if (!Number.isFinite(sec)) return DEFAULT_TASK_TIMEOUT_SEC
  return Math.min(
    MAX_TASK_TIMEOUT_SEC,
    Math.max(MIN_TASK_TIMEOUT_SEC, Math.round(sec)),
  )
}

export function taskTimeoutMs(sec: number): number {
  return clampTaskTimeoutSec(sec) * 1000
}
