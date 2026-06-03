/** 在正文中查找所有匹配起始下标（不重叠） */
export function findMatchIndices(
  text: string,
  query: string,
  caseSensitive = false,
): number[] {
  const q = query.trim()
  if (!q) return []

  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? q : q.toLowerCase()
  const out: number[] = []
  let from = 0

  while (from <= hay.length - needle.length) {
    const idx = hay.indexOf(needle, from)
    if (idx === -1) break
    out.push(idx)
    from = idx + needle.length
  }

  return out
}

export function scrollTextareaToIndex(
  textarea: HTMLTextAreaElement,
  start: number,
  length: number,
): void {
  const end = start + length
  textarea.focus({ preventScroll: true })
  textarea.setSelectionRange(start, end)

  const style = getComputedStyle(textarea)
  const lineHeight =
    Number.parseFloat(style.lineHeight) ||
    Number.parseFloat(style.fontSize) * 1.6 ||
    22

  const before = textarea.value.slice(0, start)
  const line = before.split('\n').length - 1
  const targetTop = line * lineHeight - textarea.clientHeight * 0.35
  textarea.scrollTop = Math.max(0, targetTop)
}
