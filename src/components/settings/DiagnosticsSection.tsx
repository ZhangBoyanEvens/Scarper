import { useAuth } from '@clerk/clerk-react'
import { useCallback, useMemo, useState } from 'react'
import { envApiBase, resolveApiBase } from '../../config/api'
import { clerkPublishableKey, isClerkConfigured } from '../../config/clerk'
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

function statusIconClass(status: DiagnosticCheckStatus): string {
  return `settings-diag-dot is-${status}`
}

function checksFromDiagnostics(
  health: { ok: boolean; via: string; error?: string },
  data: DiagnosticsResponse | null,
  clerkSignedIn: boolean,
  userMeOk: boolean | null,
): DiagnosticCheck[] {
  const rows: DiagnosticCheck[] = []

  rows.push({
    id: 'backend',
    label: 'Python 后端',
    status: health.ok ? 'ok' : 'fail',
    message: health.ok
      ? `运行中 · ${health.via}`
      : `未连接 · ${health.error ?? '无法访问 /api/health'}`,
    detail: data
      ? `Python ${data.python_version} · API v${data.app_version}`
      : undefined,
  })

  const apiBase = resolveApiBase()
  rows.push({
    id: 'api-base',
    label: 'API 地址',
    status: health.ok ? 'ok' : 'warn',
    message: apiBase || envApiBase || '（同源 / Vite 代理）',
    detail: envApiBase
      ? `环境变量 VITE_BACKEND_URL=${envApiBase}`
      : '未设置 VITE_BACKEND_URL，依赖开发代理',
  })

  rows.push({
    id: 'clerk-frontend',
    label: 'Clerk 前端',
    status: isClerkConfigured ? 'ok' : 'warn',
    message: isClerkConfigured
      ? `已配置 · ${(clerkPublishableKey ?? '').slice(0, 12)}…`
      : '未配置 VITE_CLERK_PUBLISHABLE_KEY',
    detail: clerkSignedIn ? '当前已登录' : '当前未登录',
  })

  if (!data) {
    rows.push({
      id: 'diagnostics-api',
      label: '诊断接口',
      status: 'fail',
      message: health.ok
        ? 'GET /api/diagnostics 失败（常见：Vite 未代理该路径，需重启 npm run dev）'
        : '无法拉取 /api/diagnostics（请先确保 Python 后端已启动）',
    })
    return rows
  }

  const c = data.clerk
  if (!c.enabled) {
    rows.push({
      id: 'clerk-backend',
      label: 'Clerk 后端',
      status: 'skip',
      message: '未配置 CLERK_SECRET_KEY / CLERK_JWT_ISSUER（匿名模式）',
    })
  } else {
    const jwksOk = c.jwks_reachable === true
    const jwksFail = c.jwks_reachable === false
    rows.push({
      id: 'clerk-backend',
      label: 'Clerk 后端',
      status: jwksOk ? 'ok' : jwksFail ? 'fail' : 'warn',
      message: [
        'JWT 校验已启用',
        c.require_auth ? '· 抓取须登录' : '· 抓取可匿名',
      ].join(' '),
      detail: jwksFail
        ? `JWKS 不可达：${c.jwks_error ?? '未知'}`
        : c.issuer_configured
          ? 'Issuer 已配置'
          : '缺少 CLERK_JWT_ISSUER',
    })
  }

  const auth = data.auth
  if (!c.enabled) {
    rows.push({
      id: 'auth-token',
      label: '登录令牌',
      status: 'skip',
      message: '后端未启用 Clerk，跳过令牌校验',
    })
  } else if (!isClerkConfigured) {
    rows.push({
      id: 'auth-token',
      label: '登录令牌',
      status: 'warn',
      message: '前端未配置 Clerk，无法获取 Bearer Token',
    })
  } else if (!clerkSignedIn) {
    rows.push({
      id: 'auth-token',
      label: '登录令牌',
      status: 'warn',
      message: '未登录，请在账号页登录后重试',
    })
  } else if (!auth.token_present) {
    rows.push({
      id: 'auth-token',
      label: '登录令牌',
      status: 'fail',
      message: '已登录但未向后端发送 Authorization 头',
    })
  } else if (auth.token_valid === false) {
    rows.push({
      id: 'auth-token',
      label: '登录令牌',
      status: 'fail',
      message: auth.error ?? 'JWT 校验失败',
    })
  } else if (auth.token_valid === true) {
    rows.push({
      id: 'auth-token',
      label: '登录令牌',
      status: 'ok',
      message: `JWT 有效 · ${auth.user_id ?? '—'}`,
      detail: auth.email ?? undefined,
    })
  } else {
    rows.push({
      id: 'auth-token',
      label: '登录令牌',
      status: 'warn',
      message: '令牌状态未知',
    })
  }

  rows.push({
    id: 'user-me',
    label: '用户 API',
    status:
      userMeOk === true ? 'ok' : userMeOk === false ? 'fail' : 'skip',
    message:
      userMeOk === true
        ? 'GET /api/user/me 正常'
        : userMeOk === false
          ? 'GET /api/user/me 失败（401 或未配置 Clerk）'
          : '跳过（未登录或后端未启用 Clerk）',
  })

  const neon = data.neon
  if (!neon.enabled) {
    rows.push({
      id: 'neon',
      label: 'Neon 数据库',
      status: 'skip',
      message: 'NEON_ENABLED=false，使用浏览器 localStorage',
    })
  } else if (!neon.configured) {
    rows.push({
      id: 'neon',
      label: 'Neon 数据库',
      status: 'warn',
      message: '已启用但未配置 NEON_DATABASE_URL',
    })
  } else {
    rows.push({
      id: 'neon',
      label: 'Neon 数据库',
      status: neon.connected ? 'ok' : 'fail',
      message: neon.connected
        ? `已连接 · 模式 ${neon.mode}`
        : '已配置但 ping 失败',
    })
  }

  const ds = data.deepseek
  rows.push({
    id: 'deepseek',
    label: 'DeepSeek AI',
    status: ds.configured ? 'ok' : 'fail',
    message: ds.configured
      ? `已配置 · ${ds.model}`
      : '未配置 DEEPSEEK_API_KEY（无法摘要）',
    detail: ds.api_base,
  })

  const pw = data.playwright
  if (!pw.enabled) {
    rows.push({
      id: 'playwright',
      label: 'Playwright 爬虫',
      status: 'skip',
      message: 'PLAYWRIGHT_ENABLED=false，仅 HTTP 抓取',
    })
  } else if (!pw.import_ok) {
    rows.push({
      id: 'playwright',
      label: 'Playwright 爬虫',
      status: 'fail',
      message: '已启用但未安装 playwright 包',
    })
  } else {
    rows.push({
      id: 'playwright',
      label: 'Playwright 爬虫',
      status: pw.browser_connected ? 'ok' : 'warn',
      message: pw.browser_connected
        ? 'Chromium 已连接（池已预热）'
        : '包已安装，浏览器尚未启动（首次抓取时会启动）',
    })
  }

  const cr = data.crawler
  rows.push({
    id: 'crawler',
    label: '抓取流水线',
    status: 'ok',
    message: `HTTP ${cr.fetch_timeout_sec}s · 全流程 ${cr.extract_timeout_sec}s`,
    detail: `缓存 TTL ${cr.cache_ttl_sec}s · Playwright ${cr.playwright_enabled ? '开' : '关'}`,
  })

  rows.push({
    id: 'overall',
    label: '综合状态',
    status: data.status === 'ok' ? 'ok' : 'warn',
    message:
      data.status === 'ok'
        ? '关键服务正常'
        : '部分服务降级（见上方失败/警告项）',
    detail: data.checked_at
      ? `检测时间 ${new Date(data.checked_at).toLocaleString('zh-CN')}`
      : undefined,
  })

  return rows
}

function DiagnosticsSectionBody({ clerkSignedIn }: { clerkSignedIn: boolean }) {
  const [running, setRunning] = useState(false)
  const [checks, setChecks] = useState<DiagnosticCheck[]>([])
  const [lastRun, setLastRun] = useState<string | null>(null)

  const summary = useMemo(() => {
    if (checks.length === 0) return null
    const fail = checks.filter((c) => c.status === 'fail').length
    const warn = checks.filter((c) => c.status === 'warn').length
    const ok = checks.filter((c) => c.status === 'ok').length
    return { fail, warn, ok }
  }, [checks])

  const runDiagnostics = useCallback(async () => {
    setRunning(true)
    setChecks([
      {
        id: 'backend',
        label: 'Python 后端',
        status: 'checking',
        message: '检测中…',
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
          e instanceof Error ? e.message : '无法拉取 /api/diagnostics'
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

    const next = checksFromDiagnostics(health, data, clerkSignedIn, userMeOk)
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
    setLastRun(new Date().toLocaleString('zh-CN'))
    setRunning(false)
  }, [clerkSignedIn])

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
            {running ? '检测中…' : '运行全部检测'}
          </button>
          {summary && (
            <p className="settings-diag-summary" role="status">
              <span className="settings-diag-summary__ok">{summary.ok} 通过</span>
              {summary.warn > 0 && (
                <span className="settings-diag-summary__warn">
                  {' '}
                  · {summary.warn} 警告
                </span>
              )}
              {summary.fail > 0 && (
                <span className="settings-diag-summary__fail">
                  {' '}
                  · {summary.fail} 失败
                </span>
              )}
              {lastRun && (
                <span className="settings-muted"> · {lastRun}</span>
              )}
            </p>
          )}
        </div>

        <p className="settings-muted settings-diag-intro">
          检测 Python 后端、Vite 代理、Clerk 登录、Neon 数据库、DeepSeek 与
          Playwright 爬虫等连接状态。修改 .env 后需重启后端再检测。
        </p>

        {checks.length === 0 ? (
          <div className="settings-callout">
            <p>尚未运行检测。点击上方按钮开始。</p>
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
                      {check.status === 'ok' && '正常'}
                      {check.status === 'warn' && '警告'}
                      {check.status === 'fail' && '失败'}
                      {check.status === 'skip' && '跳过'}
                      {check.status === 'checking' && '…'}
                      {check.status === 'idle' && '—'}
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
