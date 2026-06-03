const EDIT_BLOCK_RE = /```scarper-edit\s*([\s\S]*?)```/i
const REVISION_START = '---REVISION---'
const REVISION_END = '---END REVISION---'

export interface ScarperEditPayload {
  revision: string
  note?: string
}

/** 用户是否在要求改正文（含续改、追问） */
export function userWantsEditorChange(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const patterns = [
    /改|修改|润色|优化|重写|翻译|扩写|缩写|删减|精简|合并|详细|简略/,
    /editor|正文|文档|全文|段落|第二|第三|再.+点|更.+点/,
    /apply|revise|rewrite|translate|expand|shorten/i,
    /帮我|请|把.+改/,
  ]
  return patterns.some((p) => p.test(t))
}

function parseNoteFromHeader(header: string): string | undefined {
  const line = header.match(/^\s*note:\s*(.+)$/im)?.[1]?.trim()
  if (line) return line
  try {
    const json = JSON.parse(
      header.trim().startsWith('{') ? header.trim() : `{${header.trim()}}`,
    ) as { note?: string }
    if (typeof json.note === 'string' && json.note.trim()) {
      return json.note.trim()
    }
  } catch {
    const m = header.match(/"note"\s*:\s*"((?:\\.|[^"\\])*)"/)
    if (m) {
      return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim()
    }
  }
  return undefined
}

function parseDelimiterFormat(body: string): ScarperEditPayload | null {
  const start = body.indexOf(REVISION_START)
  const end = body.indexOf(REVISION_END)
  if (start < 0 || end <= start) return null

  const revision = body.slice(start + REVISION_START.length, end).trim()
  if (!revision) return null

  const header = body.slice(0, start).trim()
  return {
    revision,
    note: parseNoteFromHeader(header),
  }
}

function parseJsonFormat(body: string): ScarperEditPayload | null {
  const trimmed = body.trim()
  try {
    const raw = JSON.parse(trimmed) as { revision?: string; note?: string }
    const revision = typeof raw.revision === 'string' ? raw.revision : ''
    if (!revision.trim()) return null
    return {
      revision,
      note: typeof raw.note === 'string' ? raw.note.trim() : undefined,
    }
  } catch {
    return null
  }
}

/** 宽松解析：长正文含引号换行时 JSON 常失败 */
function parseLooseJsonRevision(body: string): ScarperEditPayload | null {
  const revKey = body.match(/"revision"\s*:\s*"/i)
  if (!revKey || revKey.index === undefined) return null

  const start = revKey.index + revKey[0].length
  let i = start
  let revision = ''
  let escaped = false

  while (i < body.length) {
    const ch = body[i]
    if (escaped) {
      if (ch === 'n') revision += '\n'
      else if (ch === '"') revision += '"'
      else if (ch === '\\') revision += '\\'
      else revision += ch
      escaped = false
      i++
      continue
    }
    if (ch === '\\') {
      escaped = true
      i++
      continue
    }
    if (ch === '"') {
      const tail = body.slice(i + 1).trimStart()
      if (tail.startsWith(',') || tail.startsWith('}')) break
    }
    revision += ch
    i++
  }

  if (!revision.trim()) return null

  const noteMatch = body.match(/"note"\s*:\s*"((?:\\.|[^"\\])*)"/i)
  const note = noteMatch
    ? noteMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim()
    : undefined

  return { revision, note }
}

export function extractEditProposal(
  assistantText: string,
): ScarperEditPayload | null {
  const match = EDIT_BLOCK_RE.exec(assistantText)
  if (!match) return null

  const body = match[1].trim()
  return (
    parseDelimiterFormat(body) ||
    parseJsonFormat(body) ||
    parseLooseJsonRevision(body)
  )
}

export function stripEditBlockForChat(assistantText: string): string {
  return assistantText.replace(EDIT_BLOCK_RE, '').trim()
}

export function augmentUserMessageForEdit(
  userText: string,
  options: { continuing?: boolean },
): string {
  if (!userWantsEditorChange(userText) && !options.continuing) {
    return userText
  }
  const extra = options.continuing
    ? '[续改] 用户在已采纳/预览过修改后再次提出编辑要求。你必须基于系统消息里【当前编辑器正文】输出新的完整 scarper-edit（不可只聊天不改）。'
    : '[编辑] 用户要求修改左侧编辑器正文。你必须输出完整 scarper-edit 块（见系统说明），revision 为整篇新正文。'
  return `${userText}\n\n${extra}`
}

export function buildEditorSystemPrompt(
  editorContext: string,
  contextHint: string,
  options?: { editSession?: boolean },
): string {
  const trimmed = editorContext.trim().slice(0, 12_000)
  const hint = contextHint.trim()
  const parts = [
    '你是 Scarper Dashboard 的写作助手，可直接修改用户左侧编辑器中的任务正文。',
    '修改需用户点击「采纳」才生效。用户可多次迭代：每次编辑请求都必须重新输出 scarper-edit，即使之前已改过。',
    '',
    '规则：',
    '1. 用户要求改稿、续改、追问「再详细/再改/继续」等 → 必须输出 scarper-edit，不能只回复文字说明。',
    '2. 纯问答、不改正文时：不要输出 scarper-edit。',
    '3. revision 必须是【当前请求的完整正文】，基于下方「当前编辑器正文」修改，不是 diff。',
    '4. 聊天里 1～3 句说明即可，不要把全文贴在聊天里。',
    '',
    'scarper-edit 格式（正文很长时必须用此格式，勿把正文塞进 JSON 引号）：',
    '```scarper-edit',
    'note: 一句话摘要',
    '---REVISION---',
    '（此处开始为完整正文，可多行）',
    '---END REVISION---',
    '```',
  ]
  if (options?.editSession) {
    parts.push(
      '',
      '当前处于连续改稿会话：用户的下一条追问默认也是改稿，除非明确说不用改编辑器。',
    )
  }
  if (hint) parts.push('', `当前上下文：${hint}`)
  if (trimmed) {
    parts.push(
      '',
      '--- 当前编辑器正文（本次 revision 必须在此基础上修改）---',
      trimmed,
    )
  } else {
    parts.push('', '（编辑器当前为空。）')
  }
  return parts.join('\n')
}
