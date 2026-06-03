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
      title: `${title} (片段 ${part + 1})`,
      text: slice,
    })
    offset += MAX_CHUNK_CHARS
    part++
  }
  return out
}

function resultToChunks(item: ExtractResponse, index: number): RagChunk[] {
  if (!isExtractSuccess(item)) {
    const text = `[抓取失败] ${item.error}`
    return splitLongText(`err-${index}`, item.url, item.url, text)
  }
  const parts = [
    item.title?.trim() ? `标题: ${item.title.trim()}` : '',
    item.summary?.trim() ? `摘要: ${item.summary.trim()}` : '',
    ...(item.key_points?.length
      ? [`要点:\n${item.key_points.map((p) => `• ${p}`).join('\n')}`]
      : []),
    item.content?.trim() ? `正文:\n${item.content.trim()}` : '',
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
          title: taskLabel || '已保存文档',
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
      ? '\n\n（本项目数据库已加载；当前为改稿请求，以编辑器正文为准。问答时请仅依据数据库。）'
      : ''
  }

  if (!corpus || corpus.chunks.length === 0) {
    return [
      '',
      '--- 项目数据库（RAG）---',
      '当前任务在数据库中无可用记录。',
      '【问答硬性规则】用户若在提问，你必须回答：「当前文档/数据库未涉及该内容。」（或提示用户先选择已上传数据的 Task）。',
      '不得编造或使用模型常识作答。',
    ].join('\n')
  }

  const retrieved = pickRagChunksForQuery(corpus.chunks, userQuery, MAX_RETRIEVED)
  const excerpt = corpus.fullText.slice(0, MAX_FULL_EXCERPT)
  const truncated = corpus.fullText.length > MAX_FULL_EXCERPT

  const parts = [
    '',
    '--- 项目数据库（RAG 唯一事实来源）---',
    `任务：${corpus.taskLabel}`,
    `入库 ${corpus.chunkCount} 个片段，约 ${corpus.totalChars} 字。`,
    '',
    '【问答硬性规则 — 必须遵守】',
    '1. 仅可依据下方「检索片段」与「数据库全文摘录」中的文字作答。',
    '2. 若用户问题涉及的事实、数字、名称在摘录中找不到，必须明确回答：「当前文档/数据库未涉及该内容。」',
    '3. 禁止使用预训练常识、推测、外部知识或编造；不要引用摘录以外的信息。',
    '4. 可标注信息来源 URL（### 来源行）。',
    '',
    '【检索片段（与用户问题最相关）】',
  ]

  for (const c of retrieved) {
    parts.push(`\n### 来源: ${c.source}\n标题: ${c.title}\n${c.text}`)
  }

  parts.push(
    '',
    `【数据库全文摘录${truncated ? '（已截断）' : ''}】`,
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
  return `${userText}\n\n[问答] 请严格仅根据系统消息中的数据库 RAG 摘录回答；若无相关内容请回答「当前文档/数据库未涉及该内容」。`
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
          '【用户当前选中的文本 — 请优先依据此片段回答；若问题超出选区，再结合数据库摘录】',
          options.selectionContext.trim(),
        ].join('\n')
      : ''

    return [
      '你是 Scarper 的 RAG 文档问答助手。',
      '你的职责是根据项目数据库（下方 RAG 摘录）回答用户关于文档与数据的问题。',
      '你不得修改编辑器；本回合不要输出 scarper-edit。',
      selectionBlock,
      ragSection,
    ].join('\n')
  }

  return baseEditorPrompt + ragSection
}
