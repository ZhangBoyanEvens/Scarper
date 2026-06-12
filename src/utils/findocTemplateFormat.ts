import { FINDOC_TYPOGRAPHY_RULES } from './findocRichText'

const META_SECTION_HEADINGS = new Set([
  '结构说明',
  '格式说明',
  'Structure notes',
  'Format notes',
])

export interface TemplateSectionSpec {
  heading: string
  sample: string
}

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
    return `Output must follow this Template layout, heading levels, and paragraph structure:\n${template.trim()}`
  }

  const lines = sections.map((section, index) => {
    const sample = section.sample.trim()
    const sampleHint = sample
      ? `(reference tone/length/format: ${sample.slice(0, 280)}${sample.length > 280 ? '…' : ''})`
      : '(write a complete section)'
    return `${index + 1}. Include exactly one heading line \`### ${section.heading}\` followed by section body; ${sampleHint}`
  })

  return [
    '[Output structure — mandatory]',
    `- Output these ${sections.length} sections in order; heading lines must match the Template exactly (including ### and name)`,
    '- Do not keep Task ## URL blocks, --- dividers, or scrape formatting',
    '- Merge multiple Tasks into one document; do not split by URL',
    '- Do not output meta sections such as Structure notes / Format notes',
    '',
    ...lines,
    '',
    FINDOC_TYPOGRAPHY_RULES,
    '',
    '[Output skeleton — structure only; body must come from Task]',
    sections
      .map((s) => `### ${s.heading}\n(Rewrite this section from Task content)`)
      .join('\n\n'),
  ].join('\n')
}

export function normalizeTaskInputForRewrite(text: string): string {
  return text
    .replace(/^##\s+https?:\/\/\S+\s*$/gm, '[Source page]')
    .replace(/^---\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function looksLikeRawTaskDump(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/^##\s+https?:\/\//m.test(trimmed)) return true
  if (
    /\n---\n/.test(trimmed) &&
    (trimmed.includes('### Title') || trimmed.includes('### 标题'))
  ) {
    return true
  }
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
  'Add detailed',
  'fill in',
  'placeholder',
  'example',
  'Reporting period',
  'Reconciliation month',
]

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
