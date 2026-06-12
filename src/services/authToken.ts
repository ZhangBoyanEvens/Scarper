/** 由 Clerk 注册，供 API 请求附带 Bearer Token */
let tokenGetter: (() => Promise<string | null>) | null = null

export function registerAuthTokenGetter(
  getter: () => Promise<string | null>,
): void {
  tokenGetter = getter
  cachedToken = null
}

export function clearAuthTokenGetter(): void {
  tokenGetter = null
  cachedToken = null
}

const TOKEN_TIMEOUT_MS = 15_000
const TOKEN_CACHE_MS = 45_000

let cachedToken: { value: string | null; expiresAt: number } | null = null

async function fetchTokenOnce(): Promise<string | null> {
  if (!tokenGetter) return null
  try {
    return await Promise.race([
      tokenGetter(),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), TOKEN_TIMEOUT_MS)
      }),
    ])
  } catch {
    return null
  }
}

/** 获取 Clerk JWT；失败时短暂重试（避免 Neon 请求在 token 未就绪时拿到空值） */
export async function resolveAuthToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value
  }

  if (!tokenGetter) return null

  let token = await fetchTokenOnce()
  if (!token) {
    await new Promise((r) => window.setTimeout(r, 150))
    token = await fetchTokenOnce()
  }
  if (!token) {
    await new Promise((r) => window.setTimeout(r, 400))
    token = await fetchTokenOnce()
  }

  if (token) {
    cachedToken = {
      value: token,
      expiresAt: Date.now() + TOKEN_CACHE_MS,
    }
  } else {
    cachedToken = null
  }

  return token
}

export async function buildAuthHeaders(
  base: HeadersInit = {},
): Promise<HeadersInit> {
  const headers = new Headers(base)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = await resolveAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

