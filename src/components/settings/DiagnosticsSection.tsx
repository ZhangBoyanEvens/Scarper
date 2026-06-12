import { useAuth } from '@clerk/clerk-react'
import { useCallback, useMemo, useState } from 'react'
import { envApiBase, resolveApiBase } from '../../config/api'
import { clerkPublishableKey, isClerkConfigured } from '../../config/clerk'
import { useI18n } from '../../contexts/I18nContext'
import {
  fetchDiagnostics,
  pingBackendHealth,
} from '../../services/diagnosticsApi'
import { fetchCurrentUser } from '../../services/userApi'
import type {
  DiagnosticCheck,
  DiagnosticCheckStatus,
  DiagnosticsResponse,
} from '../../types/diagnostics'
import type { TranslateParams } from '../../i18n/types'

type TranslateFn = (path: string, params?: TranslateParams) => string

function statusIconClass(status: DiagnosticCheckStatus): string {
  return `settings-diag-dot is-${status}`
}

function checksFromDiagnostics(
  health: { ok: boolean; via: string; error?: string },
  data: DiagnosticsResponse | null,
  clerkSignedIn: boolean,
  userMeOk: boolean | null,
  t: TranslateFn,
): DiagnosticCheck[] {
  const rows: DiagnosticCheck[] = []
  const c = (key: string, params?: TranslateParams) =>
    t(`settings.diagnostics.checks.${key}`, params)

  rows.push({
    id: 'backend',
    label: c('backend.label'),
    status: health.ok ? 'ok' : 'fail',
    message: health.ok
      ? c('backend.running', { via: health.via })
      : c('backend.fail', {
          error: health.error ?? 'Cannot reach /api/health',
        }),
    detail: data
      ? c('backend.detail', {
          version: data.python_version,
          apiVersion: data.app_version,
        })
      : undefined,
  })

  const apiBase = resolveApiBase()
  rows.push({
    id: 'api-base',
    label: c('apiBase.label'),
    status: health.ok ? 'ok' : 'warn',
    message:
      apiBase || envApiBase || c('apiBase.sameOrigin'),
    detail: envApiBase
      ? c('apiBase.detailEnv', { url: envApiBase })
      : c('apiBase.detailProxy'),
  })

  rows.push({
    id: 'clerk-frontend',
    label: c('clerkFrontend.label'),
    status: isClerkConfigured ? 'ok' : 'warn',
    message: isClerkConfigured
      ? c('clerkFrontend.configured', {
          key: (clerkPublishableKey ?? '').slice(0, 12),
        })
      : c('clerkFrontend.notConfigured'),
    detail: clerkSignedIn
      ? c('clerkFrontend.signedIn')
      : c('clerkFrontend.notSignedIn'),
  })

  if (!data) {
    rows.push({
      id: 'diagnostics-api',
      label: c('diagnosticsApi.label'),
      status: 'fail',
      message: health.ok
        ? c('diagnosticsApi.proxyFail')
        : c('diagnosticsApi.backendDown'),
    })
    return rows
  }

  const clerk = data.clerk
  if (!clerk.enabled) {
    rows.push({
      id: 'clerk-backend',
      label: c('clerkBackend.label'),
      status: 'skip',
      message: c('clerkBackend.disabled'),
    })
  } else {
    const jwksOk = clerk.jwks_reachable === true
    const jwksFail = clerk.jwks_reachable === false
    rows.push({
      id: 'clerk-backend',
      label: c('clerkBackend.label'),
      status: jwksOk ? 'ok' : jwksFail ? 'fail' : 'warn',
      message: [
        c('clerkBackend.jwtEnabled'),
        clerk.require_auth
          ? c('clerkBackend.requireAuth')
          : c('clerkBackend.allowAnonymous'),
      ].join(' '),
      detail: jwksFail
        ? c('clerkBackend.jwksFail', {
            error: clerk.jwks_error ?? 'unknown',
          })
        : clerk.issuer_configured
          ? c('clerkBackend.issuerOk')
          : c('clerkBackend.issuerMissing'),
    })
  }

  const auth = data.auth
  if (!clerk.enabled) {
    rows.push({
      id: 'auth-token',
      label: c('authToken.label'),
      status: 'skip',
      message: c('authToken.backendDisabled'),
    })
  } else if (!isClerkConfigured) {
    rows.push({
      id: 'auth-token',
      label: c('authToken.label'),
      status: 'warn',
      message: c('authToken.frontendDisabled'),
    })
  } else if (!clerkSignedIn) {
    rows.push({
      id: 'auth-token',
      label: c('authToken.label'),
      status: 'warn',
      message: c('authToken.notSignedIn'),
    })
  } else if (!auth.token_present) {
    rows.push({
      id: 'auth-token',
      label: c('authToken.label'),
      status: 'fail',
      message: c('authToken.missingHeader'),
    })
  } else if (auth.token_valid === false) {
    rows.push({
      id: 'auth-token',
      label: c('authToken.label'),
      status: 'fail',
      message: auth.error ?? 'JWT verification failed',
    })
  } else if (auth.token_valid === true) {
    rows.push({
      id: 'auth-token',
      label: c('authToken.label'),
      status: 'ok',
      message: c('authToken.jwtValid', { userId: auth.user_id ?? '—' }),
      detail: auth.email ?? undefined,
    })
  } else {
    rows.push({
      id: 'auth-token',
      label: c('authToken.label'),
      status: 'warn',
      message: c('authToken.unknown'),
    })
  }

  rows.push({
    id: 'user-me',
    label: c('userMe.label'),
    status:
      userMeOk === true ? 'ok' : userMeOk === false ? 'fail' : 'skip',
    message:
      userMeOk === true
        ? c('userMe.ok')
        : userMeOk === false
          ? c('userMe.fail')
          : c('userMe.skip'),
  })

  const neon = data.neon
  if (!neon.enabled) {
    rows.push({
      id: 'neon',
      label: c('neon.label'),
      status: 'skip',
      message: c('neon.disabled'),
    })
  } else if (!neon.configured) {
    rows.push({
      id: 'neon',
      label: c('neon.label'),
      status: 'warn',
      message: c('neon.notConfigured'),
    })
  } else {
    rows.push({
      id: 'neon',
      label: c('neon.label'),
      status: neon.connected ? 'ok' : 'fail',
      message: neon.connected
        ? c('neon.connected', { mode: neon.mode })
        : c('neon.pingFail'),
    })
  }

  const ds = data.deepseek
  rows.push({
    id: 'deepseek',
    label: c('deepseek.label'),
    status: ds.configured ? 'ok' : 'fail',
    message: ds.configured
      ? c('deepseek.configured', { model: ds.model })
      : c('deepseek.notConfigured'),
    detail: ds.api_base,
  })

  const pw = data.playwright
  if (!pw.enabled) {
    rows.push({
      id: 'playwright',
      label: c('playwright.label'),
      status: 'skip',
      message: c('playwright.disabled'),
    })
  } else if (!pw.import_ok) {
    rows.push({
      id: 'playwright',
      label: c('playwright.label'),
      status: 'fail',
      message: c('playwright.notInstalled'),
    })
  } else {
    rows.push({
      id: 'playwright',
      label: c('playwright.label'),
      status: pw.browser_connected ? 'ok' : 'warn',
      message: pw.browser_connected
        ? c('playwright.connected')
        : c('playwright.idle'),
    })
  }

  const cr = data.crawler
  rows.push({
    id: 'crawler',
    label: c('crawler.label'),
    status: 'ok',
    message: c('crawler.message', {
      fetch: cr.fetch_timeout_sec,
      extract: cr.extract_timeout_sec,
    }),
    detail: c('crawler.detail', {
      ttl: cr.cache_ttl_sec,
      pw: cr.playwright_enabled
        ? c('crawler.pwOn')
        : c('crawler.pwOff'),
    }),
  })

  rows.push({
    id: 'overall',
    label: c('overall.label'),
    status: data.status === 'ok' ? 'ok' : 'warn',
    message:
      data.status === 'ok' ? c('overall.ok') : c('overall.degraded'),
    detail: data.checked_at
      ? t('settings.diagnostics.checkedAt', {
          time: new Date(data.checked_at).toLocaleString(),
        })
      : undefined,
  })

  return rows
}

function DiagnosticsSectionBody({ clerkSignedIn }: { clerkSignedIn: boolean }) {
  const { t, locale } = useI18n()
  const [running, setRunning] = useState(false)
  const [checks, setChecks] = useState<DiagnosticCheck[]>([])
  const [lastRun, setLastRun] = useState<string | null>(null)

  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US'

  const summary = useMemo(() => {
    if (checks.length === 0) return null
    const fail = checks.filter((c) => c.status === 'fail').length
    const warn = checks.filter((c) => c.status === 'warn').length
    const ok = checks.filter((c) => c.status === 'ok').length
    return { fail, warn, ok }
  }, [checks])

  const statusLabel = (status: DiagnosticCheckStatus) => {
    switch (status) {
      case 'ok':
        return t('settings.diagnostics.statusOk')
      case 'warn':
        return t('settings.diagnostics.statusWarn')
      case 'fail':
        return t('settings.diagnostics.statusFail')
      case 'skip':
        return t('settings.diagnostics.statusSkip')
      case 'checking':
        return t('settings.diagnostics.statusChecking')
      default:
        return t('settings.diagnostics.statusIdle')
    }
  }

  const runDiagnostics = useCallback(async () => {
    setRunning(true)
    setChecks([
      {
        id: 'backend',
        label: t('settings.diagnostics.checks.backend.label'),
        status: 'checking',
        message: t('common.checking'),
      },
    ])

    const health = await pingBackendHealth()
    let data: DiagnosticsResponse | null = null
    let diagnosticsError: string | undefined
    if (health.ok) {
      try {
        data = await fetchDiagnostics()
      } catch (e) {
        data = null
        diagnosticsError =
          e instanceof Error ? e.message : 'Cannot fetch /api/diagnostics'
      }
    }

    let userMeOk: boolean | null = null
    if (health.ok && isClerkConfigured && clerkSignedIn) {
      try {
        const profile = await fetchCurrentUser()
        userMeOk = profile !== null
      } catch {
        userMeOk = false
      }
    }

    const next = checksFromDiagnostics(
      health,
      data,
      clerkSignedIn,
      userMeOk,
      t,
    )
    if (diagnosticsError && health.ok) {
      const idx = next.findIndex((c) => c.id === 'diagnostics-api')
      if (idx >= 0) {
        next[idx] = {
          ...next[idx],
          status: 'fail',
          message: diagnosticsError,
        }
      }
    }
    setChecks(next)
    setLastRun(new Date().toLocaleString(dateLocale))
    setRunning(false)
  }, [clerkSignedIn, dateLocale, t])

  return (
    <section className="settings-panel">
      <div className="settings-panel__inner settings-panel__inner--stack">
        <div className="settings-diag-toolbar">
          <button
            type="button"
            className="settings-btn settings-btn--primary"
            disabled={running}
            onClick={() => void runDiagnostics()}
          >
            {running ? t('common.checking') : t('settings.diagnostics.runAll')}
          </button>
          {summary && (
            <p className="settings-diag-summary" role="status">
              <span className="settings-diag-summary__ok">
                {t('settings.diagnostics.summaryPassed', {
                  count: summary.ok,
                })}
              </span>
              {summary.warn > 0 && (
                <span className="settings-diag-summary__warn">
                  {' '}
                  ·{' '}
                  {t('settings.diagnostics.summaryWarnings', {
                    count: summary.warn,
                  })}
                </span>
              )}
              {summary.fail > 0 && (
                <span className="settings-diag-summary__fail">
                  {' '}
                  ·{' '}
                  {t('settings.diagnostics.summaryFailed', {
                    count: summary.fail,
                  })}
                </span>
              )}
              {lastRun && (
                <span className="settings-muted"> · {lastRun}</span>
              )}
            </p>
          )}
        </div>

        <p className="settings-muted settings-diag-intro">
          {t('settings.diagnostics.intro')}
        </p>

        {checks.length === 0 ? (
          <div className="settings-callout">
            <p>{t('settings.diagnostics.empty')}</p>
          </div>
        ) : (
          <ul className="settings-diag-list">
            {checks.map((check) => (
              <li key={check.id} className="settings-diag-row">
                <span
                  className={statusIconClass(check.status)}
                  aria-hidden
                />
                <div className="settings-diag-row__body">
                  <div className="settings-diag-row__head">
                    <span className="settings-diag-row__label">
                      {check.label}
                    </span>
                    <span
                      className={`settings-diag-row__badge is-${check.status}`}
                    >
                      {statusLabel(check.status)}
                    </span>
                  </div>
                  <p className="settings-diag-row__message">{check.message}</p>
                  {check.detail && (
                    <p className="settings-diag-row__detail">{check.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function DiagnosticsSectionWithClerk() {
  const { isSignedIn } = useAuth()
  return (
    <DiagnosticsSectionBody clerkSignedIn={Boolean(isSignedIn)} />
  )
}

export function DiagnosticsSection() {
  if (isClerkConfigured) {
    return <DiagnosticsSectionWithClerk />
  }
  return <DiagnosticsSectionBody clerkSignedIn={false} />
}