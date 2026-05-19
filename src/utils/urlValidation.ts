const BLOCKED_PROTOCOL = /^(javascript|data|file|blob|mailto|ftp):/i

/** 多个网址之间的分隔符 */
export const URL_BATCH_SEPARATOR = '???'

export const MAX_URLS_PER_BATCH = 10

/** 校验并规范化用户输入为 http(s) URL */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (BLOCKED_PROTOCOL.test(trimmed)) return null

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const url = new URL(withProtocol)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname) return null
    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return null
    }
    return url.href
  } catch {
    return null
  }
}

export function isValidUrl(input: string): boolean {
  return normalizeUrl(input) !== null
}

/** 按 ??? 拆分并规范化，去重、去空 */
export function parseUrlBatch(input: string): string[] {
  const parts = input.split(URL_BATCH_SEPARATOR)
  const seen = new Set<string>()
  const urls: string[] = []

  for (const part of parts) {
    const normalized = normalizeUrl(part)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      urls.push(normalized)
    }
  }

  return urls
}

export function urlValidationMessage(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return '请输入网址'

  const rawParts = trimmed.split(URL_BATCH_SEPARATOR)
  if (rawParts.every((p) => !p.trim())) {
    return '请输入网址'
  }

  const invalidIndexes: number[] = []
  rawParts.forEach((part, index) => {
    if (!part.trim()) return
    if (!normalizeUrl(part)) invalidIndexes.push(index + 1)
  })

  if (invalidIndexes.length > 0) {
    return `第 ${invalidIndexes.join('、')} 个网址无效，请使用 http/https 链接`
  }

  const urls = parseUrlBatch(trimmed)
  if (urls.length === 0) return '请输入有效的 http/https 网址'
  if (urls.length > MAX_URLS_PER_BATCH) {
    return `单次最多 ${MAX_URLS_PER_BATCH} 个网址，请减少后重试`
  }

  return null
}
