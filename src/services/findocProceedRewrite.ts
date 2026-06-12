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
    ? '- The user may provide extra rewrite instructions: honor them without breaking Template section headings or order\n'
    : ''
  return `You are a FinDoc document formatting and rewrite expert.

You receive a Template (format sample) and Task (source material).

Steps:
1. Read the Task and extract facts, figures, names, and conclusions
2. Rewrite each section using Task content, following Template headings and order
3. Replace all sample sentences, placeholders, and [bracketed] text from the Template

Output rules:
- Section heading lines must match the Template (e.g. ### Title)
- Body text must come from the Task, not Template examples
- Remove URL blocks and scrape formatting from the Task
- Output the finished document only; no commentary
- Output language: ${langRule}; do not wrap in code fences
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
  return `${text.slice(0, MAX_TASK_INPUT_CHARS)}\n\n[Content truncated — too long]`
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

[User rewrite instructions — follow while preserving Template structure and Task facts]
${adjustment}`
    : ''

  return `${formatSpec}

[Task material — output must reflect this content (rewrite allowed, do not omit)]
${tasks}

[Task key excerpt — must appear in output]
${taskSnippet(taskContent)}

[Template — learn format only; do not copy sample text below]
${template.trim()}${retryNote ?? ''}${adjustmentBlock}`
}

function validateRewriteResult(
  result: string,
  template: string,
  taskContent: string,
): string | null {
  if (looksLikeRawTaskDump(result)) {
    return 'Output still contains raw URL blocks; merge into one document per Template'
  }
  if (!outputMatchesTemplateHeadings(result, template)) {
    return 'Missing required Template section headings'
  }
  if (
    isOutputCopiedFromTemplate(result, template) &&
    !outputReflectsTaskContent(result, taskContent)
  ) {
    return 'Body still matches Template examples; Task content was not written in'
  }
  if (!outputReflectsTaskContent(result, taskContent)) {
    return 'Output does not reflect Task material; ensure Task has readable body text'
  }
  return null
}

function buildRetryNote(issue: string, taskContent: string): string {
  return `

[Previous output failed: ${issue}]
Regenerate: keep Template section headings, but rewrite every section body from Task content.
Task key excerpt: ${taskSnippet(taskContent)}`
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
  outputLanguage: OutputLanguage = 'en',
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

  let result = await callRewriteStream(
    trimmedTemplate,
    trimmedTasks,
    onDelta,
    undefined,
    outputLanguage,
    trimmedAdjustment || undefined,
    signal,
  )
  let issue = validateRewriteResult(result, trimmedTemplate, trimmedTasks)

  if (issue) {
    onRetry?.()
    result = await callRewriteStream(
      trimmedTemplate,
      trimmedTasks,
      onDelta,
      buildRetryNote(issue, trimmedTasks),
      outputLanguage,
      trimmedAdjustment || undefined,
      signal,
    )
    issue = validateRewriteResult(result, trimmedTemplate, trimmedTasks)
    if (issue) {
      throw new Error(
        `Rewrite incomplete: ${issue}. Ensure Tasks have substantive body text from Scrape uploads, or try another Template`,
      )
    }
  }

  return stripCodeFence(result)
}
