export interface TaskTextPart {
  label: string
  text: string
}

const TASK_SECTION_SPLIT = /\n\n---\n\n/

export function buildMultiTaskEditorText(parts: TaskTextPart[]): string {
  return parts
    .map(({ label, text }) => `=== ${label} ===\n\n${text.trim()}`)
    .join('\n\n---\n\n')
}

/** 按合并格式拆回各 Task 正文；顺序与 parts 一致，失败返回 null */
export function parseMultiTaskEditorText(
  merged: string,
  parts: TaskTextPart[],
): string[] | null {
  if (parts.length === 0) return []
  if (parts.length === 1) return [merged.trim()]

  const chunks = merged.split(TASK_SECTION_SPLIT)
  if (chunks.length !== parts.length) return null

  const texts: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const chunk = chunks[i].trim()
    const expectedHeader = `=== ${parts[i].label} ===`
    if (!chunk.startsWith(expectedHeader)) return null
    texts.push(chunk.slice(expectedHeader.length).trimStart())
  }
  return texts
}

export interface DashboardArticle {
  id: string
  url: string | null
  title: string
  summary: string
  keyPoints: string[]
  body: string
}

const SECTION_HEADING =
  /^###\s*(标题|摘要|要点|正文)\s*$/i

function parseSectionedBody(
  lines: string[],
  url: string | null,
  index: number,
): DashboardArticle {
  const article: DashboardArticle = {
    id: String(index),
    url,
    title: '',
    summary: '',
    keyPoints: [],
    body: '',
  }

  let section: 'title' | 'summary' | 'points' | 'body' | null = null
  const buffers: Record<string, string[]> = {
    title: [],
    summary: [],
    points: [],
    body: [],
  }

  const flush = () => {
    if (!section) return
    const joined = buffers[section].join('\n').trim()
    if (section === 'title') article.title = joined
    else if (section === 'summary') article.summary = joined
    else if (section === 'body') article.body = joined
    buffers[section] = []
  }

  for (const line of lines) {
    const m = line.match(SECTION_HEADING)
    if (m) {
      flush()
      const label = m[1]
      if (label === '标题') section = 'title'
      else if (label === '摘要') section = 'summary'
      else if (label === '要点') section = 'points'
      else section = 'body'
      continue
    }
    if (section === 'points') {
      if (/^[•\-*]\s+/.test(line)) {
        article.keyPoints.push(line.replace(/^[•\-*]\s+/, '').trim())
      } else if (line.trim()) {
        article.keyPoints.push(line.trim())
      }
      continue
    }
    if (section) buffers[section].push(line)
  }
  flush()
  return article
}

function parseLegacyBody(
  lines: string[],
  url: string | null,
  index: number,
): DashboardArticle {
  const keyPoints: string[] = []
  const prose: string[] = []

  for (const line of lines) {
    if (/^[•\-*]\s+/.test(line)) {
      keyPoints.push(line.replace(/^[•\-*]\s+/, '').trim())
    } else {
      prose.push(line)
    }
  }

  let title = ''
  let summary = ''
  let body = ''

  if (prose.length === 1) {
    body = prose[0]
  } else if (prose.length === 2) {
    title = prose[0]
    summary = prose[1]
  } else if (prose.length > 2) {
    title = prose[0]
    summary = prose[1]
    body = prose.slice(2).join('\n')
  }

  return {
    id: String(index),
    url,
    title,
    summary,
    keyPoints,
    body,
  }
}

function parseSegment(seg: string, index: number): DashboardArticle {
  const lines = seg.split('\n')
  let url: string | null = null
  let start = 0

  if (lines[0]?.startsWith('## ')) {
    url = lines[0].slice(3).trim()
    start = 1
  }

  const bodyLines = lines.slice(start)
  const hasSections = bodyLines.some((l) => SECTION_HEADING.test(l))

  if (hasSections) {
    return parseSectionedBody(bodyLines, url, index)
  }
  return parseLegacyBody(bodyLines, url, index)
}

export function parseDashboardDocument(text: string): DashboardArticle[] {
  const trimmed = text.trim()
  if (!trimmed) {
    return [
      {
        id: '0',
        url: null,
        title: '',
        summary: '',
        keyPoints: [],
        body: '',
      },
    ]
  }

  if (!trimmed.includes('\n## ') && !trimmed.startsWith('## ')) {
    return [
      {
        id: '0',
        url: null,
        title: '',
        summary: '',
        keyPoints: [],
        body: trimmed,
      },
    ]
  }

  const segments = trimmed.split(/\n\n---\n\n/)
  return segments.map((seg, i) => parseSegment(seg.trim(), i))
}

function serializeArticle(a: DashboardArticle, labeled: boolean): string {
  if (!a.url) {
    return [a.title, a.summary, ...a.keyPoints.map((p) => `• ${p}`), a.body]
      .filter(Boolean)
      .join('\n')
  }

  const parts: string[] = [`## ${a.url}`]

  if (labeled) {
    if (a.title.trim()) parts.push(`### 标题\n${a.title.trim()}`)
    if (a.summary.trim()) parts.push(`### 摘要\n${a.summary.trim()}`)
    if (a.keyPoints.length > 0) {
      parts.push(
        `### 要点\n${a.keyPoints.map((p) => `• ${p}`).join('\n')}`,
      )
    }
    if (a.body.trim()) parts.push(`### 正文\n${a.body.trim()}`)
  } else {
    if (a.title.trim()) parts.push(a.title.trim())
    if (a.summary.trim()) parts.push(a.summary.trim())
    a.keyPoints.forEach((p) => parts.push(`• ${p}`))
    if (a.body.trim()) parts.push(a.body.trim())
  }

  return parts.join('\n')
}

export function serializeDashboardDocument(
  articles: DashboardArticle[],
  options?: { labeled?: boolean },
): string {
  const labeled = options?.labeled ?? true
  const blocks = articles
    .map((a) => serializeArticle(a, labeled))
    .filter((b) => b.trim())

  if (blocks.length === 0) return ''
  if (blocks.length === 1 && !articles[0]?.url) return blocks[0]
  return blocks.join('\n\n---\n\n')
}
