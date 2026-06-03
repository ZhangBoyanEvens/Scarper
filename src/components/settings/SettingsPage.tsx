import { useCallback, useEffect, useState } from 'react'
import { envApiBase, resolveApiBase } from '../../config/api'
import { COST_CURRENCIES } from '../../config/currency'
import {
  MAX_TASK_TIMEOUT_SEC,
  MIN_TASK_TIMEOUT_SEC,
  clampTaskTimeoutSec,
} from '../../config/timeouts'
import { isClerkConfigured } from '../../config/clerk'
import { useAppSettings } from '../../contexts/AppSettingsContext'
import { AccountSection } from './AccountSection'
import { DataStorageSection } from './DataStorageSection'
import { DiagnosticsSection } from './DiagnosticsSection'
import { LanguagePresetSection } from './LanguagePresetSection'
import { SECTION_META } from './settingsMeta'
import { SETTINGS_SECTIONS, type SettingsSectionId } from './settingsTypes'
import { SettingsToggle } from './SettingsToggle'
import './SettingsPage.css'

export function SettingsPage() {
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>('account')
  const [apiDraft, setApiDraft] = useState('')
  const [healthStatus, setHealthStatus] = useState<
    'idle' | 'checking' | 'ok' | 'fail'
  >('idle')
  const [healthMessage, setHealthMessage] = useState('')

  const {
    settings,
    setCostCurrency,
    setProcessingPrompt,
    patchUi,
    patchApi,
    patchScrape,
    resetToDefaults,
  } = useAppSettings()

  const [promptDraft, setPromptDraft] = useState(settings.processingPrompt)
  const [promptSaved, setPromptSaved] = useState(true)

  useEffect(() => {
    setPromptDraft(settings.processingPrompt)
    setPromptSaved(true)
  }, [settings.processingPrompt])

  const meta = SECTION_META[activeSection]

  useEffect(() => {
    setApiDraft(settings.api.customBackendUrl)
  }, [settings.api.customBackendUrl])

  const saveApiUrl = useCallback(() => {
    patchApi({ customBackendUrl: apiDraft.trim() })
  }, [apiDraft, patchApi])

  const testConnection = useCallback(async () => {
    setHealthStatus('checking')
    setHealthMessage('')
    const base = apiDraft.trim()
      ? apiDraft.trim().replace(/\/$/, '')
      : resolveApiBase()
    const url = base ? `${base}/api/health` : '/api/health'
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { status?: string }
      if (data.status === 'ok') {
        setHealthStatus('ok')
        setHealthMessage(base || 'Vite 代理（本地默认）')
      } else {
        throw new Error('响应异常')
      }
    } catch (e) {
      setHealthStatus('fail')
      setHealthMessage(e instanceof Error ? e.message : '连接失败')
    }
  }, [apiDraft])

  const savePrompt = useCallback(() => {
    setProcessingPrompt(promptDraft)
    setPromptSaved(true)
  }, [promptDraft, setProcessingPrompt])

  const effectiveBase = resolveApiBase() || '（同源 / Vite 代理）'

  return (
    <main className="app-main settings-page">
      <aside className="settings-rail" aria-label="设置分类">
        <div className="settings-rail__brand">Scarper</div>
        <nav className="settings-rail__nav">
          {SETTINGS_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`settings-rail__link${activeSection === s.id ? ' is-active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-rail__foot">
          <button
            type="button"
            className="settings-rail__reset"
            onClick={resetToDefaults}
          >
            恢复默认
          </button>
        </div>
      </aside>

      <div className="settings-workspace">
        <header className="settings-workspace__head">
          <h1 className="settings-workspace__title">{meta.title}</h1>
          <p className="settings-workspace__desc">{meta.description}</p>
        </header>

        <div className="settings-workspace__body">
          {activeSection === 'account' && (
            <section className="settings-panel">
              {isClerkConfigured ? (
                <AccountSection />
              ) : (
                <div className="settings-panel__inner settings-callout">
                  <p>当前未启用 Clerk 登录，以匿名方式使用抓取服务。</p>
                  <p className="settings-muted">
                    在 .env 中配置 VITE_CLERK_PUBLISHABLE_KEY 与
                    CLERK_SECRET_KEY 以启用账号体系。
                  </p>
                </div>
              )}
            </section>
          )}

          {activeSection === 'language' && <LanguagePresetSection />}

          {activeSection === 'workflow' && (
            <section className="settings-panel">
              <div className="settings-panel__inner settings-panel__inner--stack">
                <SettingsToggle
                  id="scrape-ai-integrate"
                  label="默认开启 AI 整合"
                  description="Scrape 页添加 2 个及以上链接时，默认勾选「AI整合」合并为一条结果"
                  checked={settings.scrape.defaultAiIntegrate}
                  onChange={(v) => patchScrape({ defaultAiIntegrate: v })}
                />
                <SettingsToggle
                  id="scrape-upload-body"
                  label="上传 Project 时包含正文"
                  description="Scrape 结果上传至 Project 时，默认勾选「含正文」"
                  checked={settings.scrape.uploadIncludeBody}
                  onChange={(v) => patchScrape({ uploadIncludeBody: v })}
                />
                <div className="settings-field-block">
                  <label htmlFor="processing-prompt" className="settings-field-block__label">
                    处理指令（Prompt）
                  </label>
                  <p className="settings-muted">
                    抓取时附加的 AI 指令，与 Scrape 页顶部工具栏同步；留空则使用默认摘要逻辑
                  </p>
                  <textarea
                    id="processing-prompt"
                    className="settings-textarea scarper-scrollbar"
                    rows={5}
                    value={promptDraft}
                    placeholder="例如：提取核心观点并列出行动建议…"
                    spellCheck={false}
                    onChange={(e) => {
                      setPromptDraft(e.target.value)
                      setPromptSaved(e.target.value === settings.processingPrompt)
                    }}
                  />
                  <div className="settings-field-block__actions">
                    <button
                      type="button"
                      className="settings-btn settings-btn--primary"
                      disabled={promptSaved}
                      onClick={savePrompt}
                    >
                      {promptSaved ? '已保存' : '保存指令'}
                    </button>
                    {promptDraft.trim() ? (
                      <button
                        type="button"
                        className="settings-btn settings-btn--ghost"
                        onClick={() => {
                          setPromptDraft('')
                          setProcessingPrompt('')
                          setPromptSaved(true)
                        }}
                      >
                        清空
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="settings-list__row settings-list__row--field">
                  <div className="settings-list__text">
                    <span className="settings-list__label">单任务超时</span>
                    <span className="settings-list__hint">
                      每个链接抓取 + AI 的最长等待（{MIN_TASK_TIMEOUT_SEC}–
                      {MAX_TASK_TIMEOUT_SEC} 秒）。切换页面不会中断任务。
                    </span>
                  </div>
                  <div className="settings-timeout-field">
                    <input
                      id="scrape-timeout"
                      type="number"
                      className="settings-input settings-input--narrow"
                      min={MIN_TASK_TIMEOUT_SEC}
                      max={MAX_TASK_TIMEOUT_SEC}
                      step={10}
                      value={settings.scrape.taskTimeoutSec}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10)
                        if (Number.isFinite(n)) {
                          patchScrape({
                            taskTimeoutSec: clampTaskTimeoutSec(n),
                          })
                        }
                      }}
                    />
                    <span className="settings-timeout-field__unit">秒</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'data' && <DataStorageSection />}

          {activeSection === 'api' && (
            <section className="settings-panel">
              <div className="settings-panel__inner">
                <div className="settings-field-block">
                  <label htmlFor="api-base" className="settings-field-block__label">
                    后端地址
                  </label>
                  <p className="settings-muted">
                    留空使用环境变量或本地代理。当前生效：
                    <code className="settings-code">{effectiveBase}</code>
                  </p>
                  <div className="settings-field-block__actions">
                    <input
                      id="api-base"
                      type="url"
                      className="settings-input"
                      placeholder={envApiBase || 'http://127.0.0.1:8000'}
                      value={apiDraft}
                      spellCheck={false}
                      onChange={(e) => setApiDraft(e.target.value)}
                      onBlur={saveApiUrl}
                    />
                    <button
                      type="button"
                      className="settings-btn settings-btn--ghost"
                      onClick={saveApiUrl}
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn--primary"
                      disabled={healthStatus === 'checking'}
                      onClick={() => void testConnection()}
                    >
                      {healthStatus === 'checking' ? '检测中…' : '测试连接'}
                    </button>
                  </div>
                  {healthStatus !== 'idle' && (
                    <p
                      className={`settings-health is-${healthStatus}`}
                      role="status"
                    >
                      {healthStatus === 'ok' && `已连接 · ${healthMessage}`}
                      {healthStatus === 'fail' &&
                        `连接失败 · ${healthMessage}`}
                    </p>
                  )}
                </div>
                <div className="settings-callout settings-callout--info">
                  <p className="settings-callout__title">DeepSeek API</p>
                  <p className="settings-muted">
                    模型密钥仅保存在服务端{' '}
                    <code className="settings-code">.env</code> 的
                    DEEPSEEK_API_KEY，不会写入浏览器。
                  </p>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'diagnostics' && <DiagnosticsSection />}

          {activeSection === 'interface' && (
            <section className="settings-panel">
              <div className="settings-panel__inner settings-panel__inner--stack">
                <div className="settings-list__row settings-list__row--field">
                  <div className="settings-list__text">
                    <span className="settings-list__label">费用显示货币</span>
                    <span className="settings-list__hint">
                      Token 用量栏与费用估算的显示单位（按固定汇率换算）
                    </span>
                  </div>
                  <select
                    className="settings-select"
                    aria-label="费用显示货币"
                    value={settings.costCurrency}
                    onChange={(e) =>
                      setCostCurrency(e.target.value as typeof settings.costCurrency)
                    }
                  >
                    {COST_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <SettingsToggle
                  id="ui-compact"
                  label="紧凑布局"
                  description="缩小 Scrape 页间距，适合小屏或并排窗口"
                  checked={settings.ui.compactMode}
                  onChange={(v) => patchUi({ compactMode: v })}
                />
                <SettingsToggle
                  id="ui-hints"
                  label="显示进度提示"
                  description="抓取时展示各阶段说明文字"
                  checked={settings.ui.showProgressHints}
                  onChange={(v) => patchUi({ showProgressHints: v })}
                />
                <SettingsToggle
                  id="ui-motion"
                  label="减少动效"
                  description="关闭过渡动画，降低视觉干扰"
                  checked={settings.ui.reduceMotion}
                  onChange={(v) => patchUi({ reduceMotion: v })}
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
