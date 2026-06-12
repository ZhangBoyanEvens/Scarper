import type { ExtractResponse } from '../types/extraction'
import { isExtractSuccess } from '../types/extraction'

export interface RagChunk {
  id: string
  source: string
  title: string
  text: string
}

export interface DashboardRagCorpus {
  taskLabel: string
  chunks: RagChunk[]
  fullText: string
  chunkCount: number
  totalChars: number
}

const MAX_CHUNK_CHARS = 2_400
const MAX_FULL_EXCERPT = 18_000
const MAX_RETRIEVED = 8

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>()
  const lower = text.toLowerCase()
  for (const w of lower.split(/[\s,，。；;、]+/)) {
    const t = w.trim()
    if (t.length >= 2) tokens.add(t)
    if (t.length === 1 && /[\u4e00-\u9fff]/.test(t)) tokens.add(t)
  }
  const cjk = text.replace(/[^\u4e00-\u9fff]/g, '')
  for (let i = 0; i < cjk.length; i++) {
    tokens.add(cjk[i])
    if (i + 1 < cjk.length) tokens.add(cjk.slice(i, i + 2))
  }
  return tokens
}

function scoreChunk(chunk: RagChunk, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) return 0
  const hay = tokenize(`${chunk.title} ${chunk.source} ${chunk.text}`)
  let score = 0
  for (const t of queryTokens) {
    if (hay.has(t)) score += t.length >= 2 ? 2 : 1
  }
  return score
}

function splitLongText(
  id: string,
  source: string,
  title: string,
  text: string,
): RagChunk[] {
  if (text.length <= MAX_CHUNK_CHARS) {
    return [{ id, source, title, text }]
  }
  const out: RagChunk[] = []
  let offset = 0
  let part = 0
  while (offset < text.length) {
    const slice = text.slice(offset, offset + MAX_CHUNK_CHARS)
    out.push({
      id: `${id}#${part}`,
      source,
      title: `${title} (part ${part + 1})`,
      text: slice,
    })
    offset += MAX_CHUNK_CHARS
    part++
  }
  return out
}

function resultToChunks(item: ExtractResponse, index: number): RagChunk[] {
  if (!isExtractSuccess(item)) {
    const text = `[Scrape failed] ${item.error}`
    return splitLongText(`err-${index}`, item.url, item.url, text)
  }
  const parts = [
    item.title?.trim() ? `Title: ${item.title.trim()}` : '',
    item.summary?.trim() ? `Summary: ${item.summary.trim()}` : '',
    ...(item.key_points?.length
      ? [`Key points:\n${item.key_points.map((p) => `• ${p}`).join('\n')}`]
      : []),
    item.content?.trim() ? `Body:\n${item.content.trim()}` : '',
  ].filter(Boolean)

  const body = parts.join('\n\n')
  const title = item.title?.trim() || item.url
  return splitLongText(`ok-${index}`, item.url, title, body)
}

export function mergeRagCorpora(
  corpora: DashboardRagCorpus[],
  combinedLabel: string,
): DashboardRagCorpus | null {
  if (corpora.length === 0) return null
  const chunks = corpora.flatMap((corpus, corpusIndex) =>
    corpus.chunks.map((chunk) => ({
      ...chunk,
      id: `${corpusIndex}-${chunk.id}`,
      title: `[${corpus.taskLabel}] ${chunk.title}`,
    })),
  )
  const fullText = corpora
    .map((corpus) => `## ${corpus.taskLabel}\n${corpus.fullText}`)
    .join('\n\n---\n\n')
  return {
    taskLabel: combinedLabel,
    chunks,
    fullText,
    chunkCount: chunks.length,
    totalChars: fullText.length,
  }
}

export function buildRagCorpus(
  results: ExtractResponse[],
  taskLabel: string,
  savedDocumentText?: string | null,
): DashboardRagCorpus {
  const saved = savedDocumentText?.trim()
  if (saved) {
    return {
      taskLabel,
      chunks: [
        {
          id: 'saved-doc',
          source: 'database',
          title: taskLabel || 'Saved document',
          text: saved,
        },
      ],
      fullText: saved,
      chunkCount: 1,
      totalChars: saved.length,
    }
  }

  const chunks = results.flatMap((r, i) => resultToChunks(r, i))
  const fullText = chunks
    .map((c) => `### ${c.source}\n${c.title}\n${c.text}`)
    .join('\n\n---\n\n')
  return {
    taskLabel,
    chunks,
    fullText,
    chunkCount: chunks.length,
    totalChars: fullText.length,
  }
}

export function pickRagChunksForQuery(
  chunks: RagChunk[],
  query: string,
  topK = MAX_RETRIEVED,
): RagChunk[] {
  if (chunks.length === 0) return []
  const queryTokens = tokenize(query)
  const ranked = [...chunks]
    .map((c) => ({ c, score: scoreChunk(c, queryTokens) }))
    .sort((a, b) => b.score - a.score)
  const hits = ranked.filter((x) => x.score > 0).map((x) => x.c)
  if (hits.length > 0) return hits.slice(0, topK)
  return ranked.slice(0, topK).map((x) => x.c)
}

/** 用户是否在问文档/数据（非改稿） */
export function userWantsDocumentQa(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const qaPatterns = [
    /[？?]/,
    /什么|哪些|多少|是否|有没有|为何|为什么|怎么|如何|谁|何时|哪里/,
    /介绍|说明|解释|查询|查一下|告诉我|列出|对比|总结|数据|指标|金额|收入|利润|项目|公司|业务/,
    /根据|依据|文档里|数据库|记录里|原文|来源/,
    /what|which|how many|who|when|where|explain|tell me|according/i,
  ]
  return qaPatterns.some((p) => p.test(t))
}

export function buildRagGroundingSection(
  corpus: DashboardRagCorpus | null,
  userQuery: string,
  active: boolean,
): string {
  if (!active) {
    return corpus
      ? '\n\n(Project database loaded; this turn is an edit request — use the editor body. For Q&A, ground answers in the database only.)'
      : ''
  }

  if (!corpus || corpus.chunks.length === 0) {
    return [
      '',
      '--- Project database (RAG) ---',
      'No usable records for this task in the database.',
      '[Q&A hard rule] If the user asks a question, you must answer: "This is not covered in the current document/database." (Or ask them to select a Task with uploaded data.)',
      'Do not invent facts or use general model knowledge.',
    ].join('\n')
  }

  const retrieved = pickRagChunksForQuery(corpus.chunks, userQuery, MAX_RETRIEVED)
  const excerpt = corpus.fullText.slice(0, MAX_FULL_EXCERPT)
  const truncated = corpus.fullText.length > MAX_FULL_EXCERPT

  const parts = [
    '',
    '--- Project database (RAG — sole source of truth) ---',
    `Task: ${corpus.taskLabel}`,
    `Indexed ${corpus.chunkCount} chunks, ~${corpus.totalChars} characters.`,
    '',
    '[Q&A hard rules — mandatory]',
    '1. Answer only from the retrieved chunks and full excerpt below.',
    '2. If facts, figures, or names are missing from the excerpt, answer clearly: "This is not covered in the current document/database."',
    '3. No pretrained knowledge, guesses, external facts, or fabrication; cite only the excerpt.',
    '4. You may note source URLs (### Source lines).',
    '',
    '[Retrieved chunks (most relevant to the question)]',
  ]

  for (const c of retrieved) {
    parts.push(`\n### Source: ${c.source}\nTitle: ${c.title}\n${c.text}`)
  }

  parts.push(
    '',
    `[Full database excerpt${truncated ? ' (truncated)' : ''}]`,
    excerpt,
  )

  return parts.join('\n')
}

export interface DashboardSystemPromptOptions {
  editorContext: string
  contextHint: string
  editSession?: boolean
  ragCorpus: DashboardRagCorpus | null
  userQuery: string
  qaMode: boolean
  /** 用户划选的文本片段，问答时优先依据 */
  selectionContext?: string
}

export function augmentUserMessageForQa(userText: string): string {
  return `${userText}\n\n[Q&A] Answer strictly from the RAG excerpt in the system message; if not covered, say "This is not covered in the current document/database."`
}

export function buildDashboardSystemPrompt(
  baseEditorPrompt: string,
  options: DashboardSystemPromptOptions,
): string {
  const ragSection = buildRagGroundingSection(
    options.ragCorpus,
    options.userQuery,
    options.qaMode,
  )

  if (options.qaMode) {
    const selectionBlock = options.selectionContext?.trim()
      ? [
          '',
          '[User selection — prioritize this excerpt; if the question is broader, also use database excerpts]',
          options.selectionContext.trim(),
        ].join('\n')
      : ''

    return [
      'You are Scarper\'s RAG document Q&A assistant.',
      'Answer questions about documents and data using the project database (RAG excerpt below).',
      'Do not edit the editor; do not output scarper-edit this turn.',
      selectionBlock,
      ragSection,
    ].join('\n')
  }

  return baseEditorPrompt + ragSection
}
