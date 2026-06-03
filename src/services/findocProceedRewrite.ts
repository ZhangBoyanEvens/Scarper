import type { OutputLanguage } from '../types/outputLanguage'
import { outputLanguageInstruction } from '../types/outputLanguage'
import { streamChatCompletion } from './deepseekClient'
import {
  buildTemplateFormatInstruction,
  isOutputCopiedFromTemplate,
  looksLikeRawTaskDump,
  normalizeTaskInputForRewrite,
  outputMatchesTemplateHeadings,
  outputReflectsTaskContent,
} from '../utils/findocTemplateFormat'
import { FINDOC_TYPOGRAPHY_RULES } from '../utils/findocRichText'

const MAX_TASK_INPUT_CHARS = 80_000
const TASK_SNIPPET_CHARS = 600

function buildSystemPrompt(
  outputLanguage: OutputLanguage,
  hasAdjustmentPrompt: boolean,
): string {
  const langRule = outputLanguageInstruction(outputLanguage)
  const adjustmentRule = hasAdjustmentPrompt
    ? '- 用户会提供额外改写指令：在不破坏 Template 分区标题与顺序的前提下，优先落实这些要求\n'
    : ''
  return `你是 FinDoc 文档格式化与改写专家。

你会收到：Template（格式样板）和 Task（真实素材）。

步骤：
1. 阅读 Task，提取事实、数字、名称、结论
2. 按 Template 的分区标题与顺序，用 Task 的信息重写每一节
3. Template 里的示例句、占位符、[方括号] 内容必须全部替换，不能保留

输出要求：
- 分区标题行与 Template 一致（### 标题 等）
- 正文必须来自 Task，不得留 Template 示例原文
- 去掉 Task 的 URL 分块与抓取格式
- 只输出成品文档，不要解释
- 输出语言：${langRule}，不要用代码块包裹
${adjustmentRule}
${FINDOC_TYPOGRAPHY_RULES}`
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

function truncateTaskInput(text: string): string {
  if (text.length <= MAX_TASK_INPUT_CHARS) return text
  return `${text.slice(0, MAX_TASK_INPUT_CHARS)}\n\n[内容过长，已截断]`
}

function taskSnippet(taskContent: string): string {
  const normalized = normalizeTaskInputForRewrite(taskContent)
  if (normalized.length <= TASK_SNIPPET_CHARS) return normalized
  return `${normalized.slice(0, TASK_SNIPPET_CHARS)}…`
}

function buildUserPrompt(
  template: string,
  taskContent: string,
  retryNote?: string,
  adjustmentPrompt?: string,
): string {
  const formatSpec = buildTemplateFormatInstruction(template)
  const tasks = truncateTaskInput(normalizeTaskInputForRewrite(taskContent))
  const adjustment = adjustmentPrompt?.trim()
  const adjustmentBlock = adjustment
    ? `

【用户改写指令 — 在满足 Template 结构与 Task 事实的前提下务必遵守】
${adjustment}`
    : ''

  return `${formatSpec}

【Task 素材 — 输出正文必须体现以下信息（可改写，不可忽略）】
${tasks}

【Task 关键片段（务必在输出中体现）】
${taskSnippet(taskContent)}

【Template — 只学格式，不要复制下面示例文字】
${template.trim()}${retryNote ?? ''}${adjustmentBlock}`
}

function validateRewriteResult(
  result: string,
  template: string,
  taskContent: string,
): string | null {
  if (looksLikeRawTaskDump(result)) {
    return '仍保留网页 URL 分块，请按 Template 合并成一份文档'
  }
  if (!outputMatchesTemplateHeadings(result, template)) {
    return '缺少 Template 要求的分区标题'
  }
  if (
    isOutputCopiedFromTemplate(result, template) &&
    !outputReflectsTaskContent(result, taskContent)
  ) {
    return '正文仍是 Template 示例文字，未写入 Task 内容'
  }
  if (!outputReflectsTaskContent(result, taskContent)) {
    return '输出与 Task 素材关联度太低，请确认 Task 中有可读正文'
  }
  return null
}

function buildRetryNote(issue: string, taskContent: string): string {
  return `

【上次生成不合格：${issue}】
请重新生成：保留 Template 分区标题，但每一节正文必须改写为 Task 中的实质内容。
Task 关键片段：${taskSnippet(taskContent)}`
}

async function callRewriteStream(
  template: string,
  taskContent: string,
  onDelta: (chunk: string) => void,
  retryNote: string | undefined,
  outputLanguage: OutputLanguage,
  adjustmentPrompt: string | undefined,
  signal?: AbortSignal,
): Promise<string> {
  const trimmedAdjustment = adjustmentPrompt?.trim() ?? ''
  let accumulated = ''
  await streamChatCompletion(
    {
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(
            outputLanguage,
            Boolean(trimmedAdjustment),
          ),
        },
        {
          role: 'user',
          content: buildUserPrompt(
            template,
            taskContent,
            retryNote,
            trimmedAdjustment || undefined,
          ),
        },
      ],
      temperature: retryNote ? 0.25 : 0.35,
    },
    (chunk) => {
      accumulated += chunk
      onDelta(chunk)
    },
    signal,
  )

  const result = stripCodeFence(accumulated)
  if (!result.trim()) {
    throw new Error('AI returned no usable result')
  }
  return result
}

export interface FindocRewriteHandlers {
  onDelta: (chunk: string) => void
  /** 校验失败重试前调用，用于清空流式缓冲区 */
  onRetry?: () => void
}

export async function rewriteTasksWithTemplate(
  template: string,
  taskContent: string,
  handlers: FindocRewriteHandlers,
  signal?: AbortSignal,
  outputLanguage: OutputLanguage = 'zh',
  adjustmentPrompt?: string,
): Promise<string> {
  const { onDelta, onRetry } = handlers
  const trimmedTemplate = template.trim()
  const trimmedTasks = taskContent.trim()
  const trimmedAdjustment = adjustmentPrompt?.trim() ?? ''
  if (!trimmedTemplate) {
    throw new Error('Template is empty')
  }
  if (!trimmedTasks) {
    throw new Error('Selected Tasks have no usable content')
  }

  let streamed = ''
  const pushDelta = (chunk: string) => {
    streamed += chunk
    onDelta(chunk)
  }

  let result = await callRewriteStream(
    trimmedTemplate,
    trimmedTasks,
    pushDelta,
    undefined,
    outputLanguage,
    trimmedAdjustment || undefined,
    signal,
  )
  let issue = validateRewriteResult(result, trimmedTemplate, trimmedTasks)

  if (issue) {
    streamed = ''
    onRetry?.()
    result = await callRewriteStream(
      trimmedTemplate,
      trimmedTasks,
      (chunk) => {
        streamed += chunk
        onDelta(chunk)
      },
      buildRetryNote(issue, trimmedTasks),
      outputLanguage,
      trimmedAdjustment || undefined,
      signal,
    )
    issue = validateRewriteResult(result, trimmedTemplate, trimmedTasks)
    if (issue) {
      throw new Error(
        `Rewrite incomplete: ${issue}. Ensure Tasks have substantive body text in Dashboard, or try another Template`,
      )
    }
  }

  return stripCodeFence(result)
}
