export interface VetraEmailTemplate {
  subject: string
  body: string
}

/** Yellow — AI fills {{slot_key}} */
export const AI_SLOT_PATTERN = /\{\{[^}]+\}\}/g

/** Red — preserved verbatim [[locked text]] */
export const LOCKED_TEXT_PATTERN = /\[\[[^\]]*\]\]/g

export const TEMPLATE_MARKER_PATTERN = /\[\[[^\]]*\]\]|\{\{[^}]+\}\}/g

export const DEFAULT_EMAIL_TEMPLATE: VetraEmailTemplate = {
  subject: 'Partnership with {{contact_name}}',
  body: [
    'Dear {{contact_name}},',
    '',
    '{{personalized_intro}}',
    '',
    'We would love to explore how we can collaborate with your team.',
    '',
    'Best regards,',
    '{{sender_name}}',
  ].join('\n'),
}

export function createEmptyEmailTemplate(): VetraEmailTemplate {
  return {
    subject: '',
    body: '',
  }
}

export const DEFAULT_COMPANY_INTRODUCTION = [
  '{{company_name}} is a {{industry}} company headquartered in {{location}}.',
  '',
  '{{company_overview}}',
  '',
  'Key highlights:',
  '- {{highlight_1}}',
  '- {{highlight_2}}',
].join('\n')

export function createEmptyCompanyIntroduction(): string {
  return ''
}

export type TemplateSegmentKind = 'plain' | 'ai_slot' | 'locked'

export interface EmailTemplateSegment {
  text: string
  kind: TemplateSegmentKind
  /** @deprecated use kind === 'ai_slot' */
  isAiSlot: boolean
}

export type OutreachFieldPrefix = 'subject' | 'body'

export interface OutreachTemplateSegment {
  id: string
  kind: TemplateSegmentKind
  raw: string
  /** Inner slot key, locked inner text, or plain text */
  content: string
}

export function parseEmailTemplateSegments(text: string): EmailTemplateSegment[] {
  if (!text) return []

  const parts: EmailTemplateSegment[] = []
  let lastIndex = 0
  const pattern = new RegExp(TEMPLATE_MARKER_PATTERN.source, 'g')
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        kind: 'plain',
        isAiSlot: false,
      })
    }
    const raw = match[0]
    const kind: TemplateSegmentKind = raw.startsWith('[[') ? 'locked' : 'ai_slot'
    parts.push({ text: raw, kind, isAiSlot: kind === 'ai_slot' })
    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      kind: 'plain',
      isAiSlot: false,
    })
  }

  return parts
}

export function parseOutreachTemplateSegments(
  text: string,
  field: OutreachFieldPrefix,
): OutreachTemplateSegment[] {
  if (!text) return []

  const segments: OutreachTemplateSegment[] = []
  let lastIndex = 0
  let plainCounter = 0
  const pattern = new RegExp(TEMPLATE_MARKER_PATTERN.source, 'g')
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const content = text.slice(lastIndex, match.index)
      segments.push({
        id: `p_${field}_${plainCounter}`,
        kind: 'plain',
        raw: content,
        content,
      })
      plainCounter += 1
    }

    const raw = match[0]
    if (raw.startsWith('[[')) {
      segments.push({
        id: `l_${field}_${segments.length}`,
        kind: 'locked',
        raw,
        content: raw.slice(2, -2),
      })
    } else {
      const key = raw.slice(2, -2).trim()
      segments.push({
        id: key,
        kind: 'ai_slot',
        raw,
        content: key,
      })
    }

    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) {
    segments.push({
      id: `p_${field}_${plainCounter}`,
      kind: 'plain',
      raw: text.slice(lastIndex),
      content: text.slice(lastIndex),
    })
  }

  return segments
}

export function assembleOutreachField(
  segments: OutreachTemplateSegment[],
  fills: Record<string, string>,
  plainAdaptations: Record<string, string>,
): string {
  return segments
    .map((segment) => {
      if (segment.kind === 'locked') {
        return segment.content
      }
      if (segment.kind === 'ai_slot') {
        return fills[segment.content] ?? segment.raw
      }
      return plainAdaptations[segment.id] ?? segment.content
    })
    .join('')
}

export function insertAtCursor(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  insert: string,
): { nextValue: string; cursorStart: number; cursorEnd: number } {
  const nextValue =
    value.slice(0, selectionStart) + insert + value.slice(selectionEnd)
  const cursorStart = selectionStart + insert.length
  return { nextValue, cursorStart, cursorEnd: cursorStart }
}

function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  wrapper: { open: string; close: string; defaultInner: string },
): { nextValue: string; cursorStart: number; cursorEnd: number } {
  const selected = value.slice(selectionStart, selectionEnd)
  const inner = selected.trim() || wrapper.defaultInner
  const wrapped = `${wrapper.open}${inner}${wrapper.close}`
  const nextValue =
    value.slice(0, selectionStart) + wrapped + value.slice(selectionEnd)

  if (selected.trim()) {
    return {
      nextValue,
      cursorStart: selectionStart + wrapped.length,
      cursorEnd: selectionStart + wrapped.length,
    }
  }

  const innerStart = selectionStart + wrapper.open.length
  return {
    nextValue,
    cursorStart: innerStart,
    cursorEnd: innerStart + wrapper.defaultInner.length,
  }
}

export function wrapSelectionAsAiSlot(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { nextValue: string; cursorStart: number; cursorEnd: number } {
  return wrapSelection(value, selectionStart, selectionEnd, {
    open: '{{',
    close: '}}',
    defaultInner: 'ai_slot',
  })
}

export function wrapSelectionAsLocked(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { nextValue: string; cursorStart: number; cursorEnd: number } {
  return wrapSelection(value, selectionStart, selectionEnd, {
    open: '[[',
    close: ']]',
    defaultInner: 'locked_text',
  })
}

interface MarkerMatch {
  start: number
  end: number
  inner: string
  raw: string
  openLen: number
}

function findMarkers(value: string, pattern: RegExp): MarkerMatch[] {
  const markers: MarkerMatch[] = []
  const re = new RegExp(pattern.source, 'g')
  let match: RegExpExecArray | null

  while ((match = re.exec(value)) !== null) {
    const raw = match[0]
    const openLen = 2
    markers.push({
      start: match.index,
      end: match.index + raw.length,
      inner: raw.slice(openLen, -openLen),
      raw,
      openLen,
    })
  }

  return markers
}

function adjustCursorAfterUnwrap(
  pos: number,
  marker: MarkerMatch,
  delta: number,
): number {
  if (pos <= marker.start) return pos
  if (pos >= marker.end) return pos + delta
  const innerOffset = Math.max(
    0,
    Math.min(pos - marker.start - marker.openLen, marker.inner.length),
  )
  return marker.start + innerOffset
}

function unwrapMarkersInRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  pattern: RegExp,
): { nextValue: string; cursorStart: number; cursorEnd: number } {
  const hasSelection = selectionStart !== selectionEnd
  const markers = findMarkers(value, pattern)

  const toUnwrap = markers.filter((marker) => {
    if (hasSelection) {
      return marker.start < selectionEnd && marker.end > selectionStart
    }
    return selectionStart >= marker.start && selectionStart <= marker.end
  })

  if (toUnwrap.length === 0) {
    return {
      nextValue: value,
      cursorStart: selectionStart,
      cursorEnd: selectionEnd,
    }
  }

  toUnwrap.sort((a, b) => b.start - a.start)

  let nextValue = value
  let cursorStart = selectionStart
  let cursorEnd = selectionEnd

  for (const marker of toUnwrap) {
    const delta = marker.inner.length - marker.raw.length
    nextValue =
      nextValue.slice(0, marker.start) + marker.inner + nextValue.slice(marker.end)
    cursorStart = adjustCursorAfterUnwrap(cursorStart, marker, delta)
    cursorEnd = adjustCursorAfterUnwrap(cursorEnd, marker, delta)
  }

  return { nextValue, cursorStart, cursorEnd }
}

/** Remove {{ }} wrappers from slots overlapping the selection, or from the slot at the cursor. */
export function unwrapAiSlotsInRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { nextValue: string; cursorStart: number; cursorEnd: number } {
  return unwrapMarkersInRange(value, selectionStart, selectionEnd, AI_SLOT_PATTERN)
}

/** Remove [[ ]] wrappers from locked regions overlapping the selection, or at the cursor. */
export function unwrapLockedInRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { nextValue: string; cursorStart: number; cursorEnd: number } {
  return unwrapMarkersInRange(value, selectionStart, selectionEnd, LOCKED_TEXT_PATTERN)
}
