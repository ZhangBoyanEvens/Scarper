function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatInline(text: string): string {
  let html = escapeHtml(text)
  html = html.replace(
    /\*\*(.+?)\*\*/g,
    '<strong class="findoc-styled-doc__emphasis">$1</strong>',
  )
  html = html.replace(
    /\*(.+?)\*/g,
    '<em class="findoc-styled-doc__em">$1</em>',
  )
  return html
}

function formatInlineWord(text: string): string {
  let html = escapeHtml(text)
  html = html.replace(
    /\*\*(.+?)\*\*/g,
    '<strong style="font-size:12pt;font-weight:bold;">$1</strong>',
  )
  html = html.replace(
    /\*(.+?)\*/g,
    '<em style="font-style:italic;">$1</em>',
  )
  return html
}

type Block =
  | { type: 'display'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'section'; text: string }
  | { type: 'sub'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

/** 将 FinDoc 轻量 markup 解析为块结构 */
export function parseFindocRichText(text: string): Block[] {
  const lines = text.split(/\r?\n/)
  const blocks: Block[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length === 0) return
    blocks.push({ type: 'list', items: [...listItems] })
    listItems = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }

    if (/^####\s+/.test(trimmed)) {
      flushList()
      blocks.push({ type: 'sub', text: trimmed.replace(/^####\s+/, '') })
      continue
    }
    if (/^###\s+/.test(trimmed)) {
      flushList()
      blocks.push({ type: 'section', text: trimmed.replace(/^###\s+/, '') })
      continue
    }
    if (/^##\s+/.test(trimmed)) {
      flushList()
      blocks.push({ type: 'heading', text: trimmed.replace(/^##\s+/, '') })
      continue
    }
    if (/^#\s+(?!#)/.test(trimmed)) {
      flushList()
      blocks.push({ type: 'display', text: trimmed.replace(/^#\s+/, '') })
      continue
    }
    if (/^[•\-*]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[•\-*]\s+/, ''))
      continue
    }

    flushList()
    blocks.push({ type: 'paragraph', text: trimmed })
  }

  flushList()
  return blocks
}

export function renderFindocRichTextToHtml(text: string): string {
  const blocks = parseFindocRichText(text)
  if (blocks.length === 0) return ''

  const htmlParts: string[] = []

  for (const block of blocks) {
    switch (block.type) {
      case 'display':
        htmlParts.push(
          `<h1 class="findoc-styled-doc__display">${formatInline(block.text)}</h1>`,
        )
        break
      case 'heading':
        htmlParts.push(
          `<h2 class="findoc-styled-doc__heading">${formatInline(block.text)}</h2>`,
        )
        break
      case 'section':
        htmlParts.push(
          `<h3 class="findoc-styled-doc__section">${formatInline(block.text)}</h3>`,
        )
        break
      case 'sub':
        htmlParts.push(
          `<h4 class="findoc-styled-doc__sub">${formatInline(block.text)}</h4>`,
        )
        break
      case 'paragraph':
        htmlParts.push(
          `<p class="findoc-styled-doc__p">${formatInline(block.text)}</p>`,
        )
        break
      case 'list':
        htmlParts.push(
          `<ul class="findoc-styled-doc__list">${block.items
            .map(
              (item) =>
                `<li class="findoc-styled-doc__li">${formatInline(item)}</li>`,
            )
            .join('')}</ul>`,
        )
        break
      default:
        break
    }
  }

  return `<article class="findoc-styled-doc">${htmlParts.join('')}</article>`
}

/** Word 导出用 HTML（带字号） */
export function renderFindocRichTextToWordHtml(text: string): string {
  const blocks = parseFindocRichText(text)
  const parts: string[] = []

  for (const block of blocks) {
    switch (block.type) {
      case 'display':
        parts.push(
          `<p style="margin:0 0 14pt 0;font-family:Calibri,sans-serif;font-size:22pt;font-weight:bold;line-height:1.35;">${formatInlineWord(block.text)}</p>`,
        )
        break
      case 'heading':
        parts.push(
          `<p style="margin:12pt 0 8pt 0;font-family:Calibri,sans-serif;font-size:16pt;font-weight:bold;line-height:1.4;">${formatInlineWord(block.text)}</p>`,
        )
        break
      case 'section':
        parts.push(
          `<p style="margin:14pt 0 6pt 0;font-family:Calibri,sans-serif;font-size:14pt;font-weight:bold;line-height:1.4;">${formatInlineWord(block.text)}</p>`,
        )
        break
      case 'sub':
        parts.push(
          `<p style="margin:10pt 0 4pt 0;font-family:Calibri,sans-serif;font-size:12pt;font-weight:bold;line-height:1.45;">${formatInlineWord(block.text)}</p>`,
        )
        break
      case 'paragraph':
        parts.push(
          `<p style="margin:0 0 8pt 0;font-family:Calibri,sans-serif;font-size:11pt;line-height:1.55;">${formatInlineWord(block.text)}</p>`,
        )
        break
      case 'list':
        for (const item of block.items) {
          parts.push(
            `<p style="margin:0 0 4pt 0;padding-left:14pt;font-family:Calibri,sans-serif;font-size:11pt;line-height:1.5;text-indent:-10pt;">• ${formatInlineWord(item)}</p>`,
          )
        }
        break
      default:
        break
    }
  }

  return parts.join('')
}

export const FINDOC_TYPOGRAPHY_RULES = `【排版与字号 — 输出必须包含】
- 文档最上方用一行 \`# 主标题\`（最大字号，写文档题目）
- 各分区仍用 Template 要求的 \`### 分区名\` 作为节标题（大字号）
- 关键结论、重要数字、核心短语用 \`**...**\` 包裹（加粗+略大）
- 普通正文正常字号；段与段之间空一行
- 要点用 \`•\` 或 \`-\` 开头，每条独占一行
- 禁止输出 HTML；只用上述 Markdown 式标记`

/** 从 FinDoc 正文提取显示标题 */
export function extractFindocDocumentTitle(content: string): string {
  const trimmed = content.trim()
  if (!trimmed) return 'FinDoc 文档'

  const display = trimmed.match(/^#\s+(.+)$/m)
  if (display?.[1]?.trim()) return display[1].trim()

  const lines = trimmed.split('\n')
  const titleIdx = lines.findIndex((line) => /^###\s+标题\s*$/.test(line.trim()))
  if (titleIdx >= 0) {
    for (let i = titleIdx + 1; i < lines.length; i++) {
      const next = lines[i].trim()
      if (!next) continue
      if (/^#{1,4}\s/.test(next)) break
      return next.slice(0, 120)
    }
  }

  const firstLine = lines.find((line) => line.trim() && !/^#{1,4}\s/.test(line.trim()))
  if (firstLine?.trim()) return firstLine.trim().slice(0, 80)

  return 'FinDoc 文档'
}
