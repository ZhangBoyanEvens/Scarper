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
    ? '[Follow-up edit] The user requested another edit after accepting or previewing changes. You must output a new full scarper-edit based on [Current editor body] in the system message (do not chat without editing).'
    : '[Edit] The user wants to revise the left editor body. You must output a full scarper-edit block (see system instructions); revision is the complete new body.'
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
    'You are the Scarper Dashboard writing assistant and can directly revise task body text in the user\'s left editor.',
    'Changes take effect only when the user clicks Accept. Users may iterate: every edit request must output a new scarper-edit, even after prior edits.',
    '',
    'Rules:',
    '1. When the user asks to revise, follow up, or says "more detail / revise again / continue" → you must output scarper-edit; do not reply with text only.',
    '2. For pure Q&A without changing body text: do not output scarper-edit.',
    '3. revision must be the full body for this request, based on "Current editor body" below — not a diff.',
    '4. Keep chat replies to 1–3 sentences; do not paste the full body in chat.',
    '',
    'scarper-edit format (required for long bodies; do not put body inside JSON quotes):',
    '```scarper-edit',
    'note: one-line summary',
    '---REVISION---',
    '(full body starts here; may span multiple lines)',
    '---END REVISION---',
    '```',
  ]
  if (options?.editSession) {
    parts.push(
      '',
      'Continuous edit session: the user\'s next message is treated as another edit unless they clearly say not to change the editor.',
    )
  }
  if (hint) parts.push('', `Current context: ${hint}`)
  if (trimmed) {
    parts.push(
      '',
      '--- Current editor body (revision must build on this) ---',
      trimmed,
    )
  } else {
    parts.push('', '(Editor is currently empty.)')
  }
  return parts.join('\n')
}
