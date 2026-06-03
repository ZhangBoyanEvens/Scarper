import { FINDOC_TYPOGRAPHY_RULES } from './findocRichText'

const META_SECTION_HEADINGS = new Set(['结构说明', '格式说明'])

export interface TemplateSectionSpec {
  heading: string
  sample: string
}

/** 从 Template 文本解析 ### 分区（排除元说明节） */
export function parseTemplateSections(template: string): TemplateSectionSpec[] {
  const lines = template.split('\n')
  const sections: TemplateSectionSpec[] = []
  let currentHeading = ''
  let bodyLines: string[] = []

  const flush = () => {
    if (!currentHeading || META_SECTION_HEADINGS.has(currentHeading)) {
      currentHeading = ''
      bodyLines = []
      return
    }
    sections.push({
      heading: currentHeading,
      sample: bodyLines.join('\n').trim(),
    })
    currentHeading = ''
    bodyLines = []
  }

  for (const line of lines) {
    const match = line.match(/^###\s+(.+?)\s*$/)
    if (match) {
      flush()
      currentHeading = match[1].trim()
      continue
    }
    if (currentHeading) {
      bodyLines.push(line)
    }
  }
  flush()
  return sections
}

export function buildTemplateFormatInstruction(template: string): string {
  const sections = parseTemplateSections(template)
  if (sections.length === 0) {
    return `输出必须严格沿用以下 Template 的整体排版、标题层级与段落组织方式：\n${template.trim()}`
  }

  const lines = sections.map((section, index) => {
    const sample = section.sample.trim()
    const sampleHint = sample
      ? `（参考句式/长度/格式：${sample.slice(0, 280)}${sample.length > 280 ? '…' : ''}）`
      : '（该节需写完整段落）'
    return `${index + 1}. 必须有且仅有标题行 \`### ${section.heading}\`，紧接该节正文；${sampleHint}`
  })

  return [
    '【输出结构 — 必须严格遵守】',
    `- 按下列 ${sections.length} 个分区顺序输出，分区标题行必须与 Template 完全一致（含 ### 与名称）`,
    '- 禁止保留 Task 中的 ## URL、--- 分隔线、网页抓取痕迹',
    '- 多个 Task 合并为一份文档，不得按 URL 分块',
    '- 禁止输出「结构说明/格式说明」等元信息节',
    '',
    ...lines,
    '',
    FINDOC_TYPOGRAPHY_RULES,
    '',
    '【输出骨架示例 — 仅示意结构，内容必须来自 Task】',
    sections.map((s) => `### ${s.heading}\n（此处填入基于 Task 改写的正文）`).join('\n\n'),
  ].join('\n')
}

/** 去掉 Task 中容易让 AI 照搬的抓取格式痕迹 */
export function normalizeTaskInputForRewrite(text: string): string {
  return text
    .replace(/^##\s+https?:\/\/\S+\s*$/gm, '【来源网页】')
    .replace(/^---\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function looksLikeRawTaskDump(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/^##\s+https?:\/\//m.test(trimmed)) return true
  if (/\n---\n/.test(trimmed) && trimmed.includes('### 标题')) return true
  return false
}

export function outputMatchesTemplateHeadings(
  output: string,
  template: string,
): boolean {
  const expected = parseTemplateSections(template).map((s) => s.heading)
  if (expected.length === 0) return true

  const found = [...output.matchAll(/^###\s+(.+?)\s*$/gm)].map((m) => m[1].trim())
  if (found.length < expected.length) return false

  let cursor = 0
  for (const heading of expected) {
    const idx = found.indexOf(heading, cursor)
    if (idx === -1) return false
    cursor = idx + 1
  }
  return true
}

/** 去掉分区标题，只保留正文用于比对 */
export function stripSectionHeadings(text: string): string {
  return text.replace(/^###\s+.+$/gm, '').trim()
}

function normalizeSubstantive(text: string): string {
  return stripSectionHeadings(text)
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const PLACEHOLDER_HINTS = [
  '在此填写',
  '占位符',
  '占位',
  '示例',
  '报告期间、主体与核心结论概述',
  '对账月份、账户范围与总体差异说明',
]

/** 输出是否仍基本是 Template 里的示例/占位文字 */
export function isOutputCopiedFromTemplate(
  output: string,
  template: string,
): boolean {
  const out = normalizeSubstantive(output)
  const tpl = normalizeSubstantive(template)
  if (!out || !tpl) return false
  if (out === tpl) return true

  const tplLines = stripSectionHeadings(template)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 6)

  const exampleLines = tplLines.filter((line) =>
    PLACEHOLDER_HINTS.some((hint) => line.includes(hint)),
  )
  if (exampleLines.length > 0) {
    const copied = exampleLines.filter((line) => out.includes(line)).length
    if (copied >= Math.ceil(exampleLines.length * 0.5)) return true
  }

  if (tpl.length > 30 && out.length > 0 && out.length <= tpl.length * 1.05) {
    if (tpl.includes(out) || out.includes(tpl)) return true
  }

  return false
}

/** 输出是否包含 Task 中的实质信息（而非仅复制 Template 外壳） */
export function outputReflectsTaskContent(
  output: string,
  taskContent: string,
): boolean {
  const out = normalizeSubstantive(output).toLowerCase()
  const task = normalizeSubstantive(
    normalizeTaskInputForRewrite(taskContent),
  ).toLowerCase()
  if (!task) return false
  if (!out) return false

  const tokens =
    task.match(/[\u4e00-\u9fff]{2,}|[a-zA-Z0-9]{4,}/g) ?? []
  const unique = [...new Set(tokens)].filter((t) => t.length >= 2)
  if (unique.length === 0) {
    return out.length >= Math.min(task.length, 80)
  }

  let hit = 0
  for (const token of unique.slice(0, 400)) {
    if (out.includes(token)) hit++
  }
  return hit / Math.min(unique.length, 400) >= 0.04
}
