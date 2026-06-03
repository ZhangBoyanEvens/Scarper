import type { NeonStatusResponse } from './neon'

export type DiagnosticsStatus = 'ok' | 'degraded'

export interface ClerkBackendDiagnostic {
  enabled: boolean
  issuer_configured: boolean
  require_auth: boolean
  jwks_reachable: boolean | null
  jwks_error: string | null
}

export interface AuthDiagnostic {
  token_present: boolean
  token_valid: boolean | null
  user_id: string | null
  email: string | null
  error: string | null
}

export interface DeepseekDiagnostic {
  configured: boolean
  model: string
  api_base: string
}

export interface PlaywrightDiagnostic {
  enabled: boolean
  import_ok: boolean
  browser_connected: boolean
}

export interface CrawlerDiagnostic {
  fetch_timeout_sec: number
  extract_timeout_sec: number
  playwright_enabled: boolean
  cache_ttl_sec: number
}

export interface DiagnosticsResponse {
  status: DiagnosticsStatus
  checked_at: string
  python_version: string
  app_version: string
  clerk: ClerkBackendDiagnostic
  auth: AuthDiagnostic
  deepseek: DeepseekDiagnostic
  neon: NeonStatusResponse
  playwright: PlaywrightDiagnostic
  crawler: CrawlerDiagnostic
}

export type DiagnosticCheckStatus =
  | 'idle'
  | 'checking'
  | 'ok'
  | 'warn'
  | 'fail'
  | 'skip'

export interface DiagnosticCheck {
  id: string
  label: string
  status: DiagnosticCheckStatus
  message: string
  detail?: string
}
