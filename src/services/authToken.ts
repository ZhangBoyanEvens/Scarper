/** 由 Clerk 注册，供 API 请求附带 Bearer Token */
let tokenGetter: (() => Promise<string | null>) | null = null

export function registerAuthTokenGetter(
  getter: () => Promise<string | null>,
): void {
  tokenGetter = getter
}

export function clearAuthTokenGetter(): void {
  tokenGetter = null
}

export async function buildAuthHeaders(
  base: HeadersInit = {},
): Promise<HeadersInit> {
  const headers = new Headers(base)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (tokenGetter) {
    const token = await tokenGetter()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}
