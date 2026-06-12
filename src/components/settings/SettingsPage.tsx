import { Button, Layout, Menu, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { envApiBase, resolveApiBase } from '../../config/api'
import { COST_CURRENCIES } from '../../config/currency'
import {
  MAX_TASK_TIMEOUT_SEC,
  MIN_TASK_TIMEOUT_SEC,
  clampTaskTimeoutSec,
} from '../../config/timeouts'
import { isClerkConfigured } from '../../config/clerk'
import { useAppSettings } from '../../contexts/AppSettingsContext'
import { useI18n } from '../../contexts/I18nContext'
import type { UiLocale } from '../../i18n/types'
import { AccountSection } from './AccountSection'
import { DataStorageSection } from './DataStorageSection'
import { DiagnosticsSection } from './DiagnosticsSection'
import { LanguagePresetSection } from './LanguagePresetSection'
import { SegmentedControl } from './SegmentedControl'
import { SETTINGS_SECTIONS, type SettingsSectionId } from './settingsTypes'
import { SettingsToggle } from './SettingsToggle'
import './SettingsPage.css'

export function SettingsPage() {
  const { t } = useI18n()
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

  const meta = useMemo(
    () => ({
      title: t(`settings.meta.${activeSection}.title`),
      description: t(`settings.meta.${activeSection}.description`),
    }),
    [activeSection, t],
  )

  const menuItems = useMemo(
    () =>
      SETTINGS_SECTIONS.map((s) => ({
        key: s.id,
        label: t(`settings.sections.${s.id}`),
      })),
    [t],
  )

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
        setHealthMessage(base || t('settings.api.viteProxy'))
      } else {
        throw new Error('Unexpected response')
      }
    } catch (e) {
      setHealthStatus('fail')
      setHealthMessage(e instanceof Error ? e.message : 'Connection failed')
    }
  }, [apiDraft, t])

  const savePrompt = useCallback(() => {
    setProcessingPrompt(promptDraft)
    setPromptSaved(true)
  }, [promptDraft, setProcessingPrompt])

  const effectiveBase =
    resolveApiBase() || t('settings.api.sameOrigin')

  return (
    <Layout
      className="settings-page"
      style={{ flex: 1, minHeight: 0, background: 'var(--sc-bg-layout)' }}
    >
      <Layout.Sider
        width={240}
        theme="light"
        style={{
          background: 'var(--sc-bg-container)',
          borderRight: '1px solid var(--sc-border)',
        }}
      >
        <div
          style={{
            padding: '16px 16px 8px',
            fontWeight: 500,
            fontSize: 14,
            color: 'var(--sc-text-muted)',
          }}
        >
          {t('settings.brand')}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeSection]}
          items={menuItems}
          onClick={({ key }) => setActiveSection(key as SettingsSectionId)}
          style={{ borderInlineEnd: 'none' }}
        />
        <div style={{ padding: 12, marginTop: 'auto' }}>
          <Button type="text" danger block onClick={resetToDefaults}>
            {t('settings.resetDefaults')}
          </Button>
        </div>
      </Layout.Sider>

      <Layout.Content
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
          background: 'var(--sc-bg-layout)',
        }}
      >
        <header
          style={{
            padding: '20px 28px 0',
            background: 'var(--sc-bg-container)',
            borderBottom: '1px solid var(--sc-border)',
          }}
        >
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            {meta.title}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
            {meta.description}
          </Typography.Paragraph>
        </header>

        <div className="settings-workspace__body">
          {activeSection === 'account' && (
            <section className="settings-panel">
              {isClerkConfigured ? (
                <AccountSection />
              ) : (
                <div className="settings-panel__inner settings-callout">
                  <p>{t('settings.account.clerkDisabled')}</p>
                  <p className="settings-muted">
                    {t('settings.account.clerkHint')}
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
                  label={t('settings.workflow.aiMerge')}
                  description={t('settings.workflow.aiMergeHint')}
                  checked={settings.scrape.defaultAiIntegrate}
                  onChange={(v) => patchScrape({ defaultAiIntegrate: v })}
                />
                <SettingsToggle
                  id="scrape-upload-body"
                  label={t('settings.workflow.uploadBody')}
                  description={t('settings.workflow.uploadBodyHint')}
                  checked={settings.scrape.uploadIncludeBody}
                  onChange={(v) => patchScrape({ uploadIncludeBody: v })}
                />
                <div className="settings-field-block">
                  <label
                    htmlFor="processing-prompt"
                    className="settings-field-block__label"
                  >
                    {t('settings.workflow.promptLabel')}
                  </label>
                  <p className="settings-muted">
                    {t('settings.workflow.promptHint')}
                  </p>
                  <textarea
                    id="processing-prompt"
                    className="settings-textarea scarper-scrollbar"
                    rows={5}
                    value={promptDraft}
                    placeholder={t('settings.workflow.promptPlaceholder')}
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
                      {promptSaved
                        ? t('common.saved')
                        : t('settings.workflow.savePrompt')}
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
                        {t('common.clear')}
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="settings-list__row settings-list__row--field">
                  <div className="settings-list__text">
                    <span className="settings-list__label">
                      {t('settings.workflow.timeout')}
                    </span>
                    <span className="settings-list__hint">
                      {t('settings.workflow.timeoutHint', {
                        min: MIN_TASK_TIMEOUT_SEC,
                        max: MAX_TASK_TIMEOUT_SEC,
                      })}
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
                    <span className="settings-timeout-field__unit">
                      {t('common.sec')}
                    </span>
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
                    {t('settings.api.backendUrl')}
                  </label>
                  <p className="settings-muted">
                    {t('settings.api.backendHint')}{' '}
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
                      {t('common.save')}
                    </button>
                    <button
                      type="button"
                      className="settings-btn settings-btn--primary"
                      disabled={healthStatus === 'checking'}
                      onClick={() => void testConnection()}
                    >
                      {healthStatus === 'checking'
                        ? t('common.checking')
                        : t('settings.api.testConnection')}
                    </button>
                  </div>
                  {healthStatus !== 'idle' && (
                    <p
                      className={`settings-health is-${healthStatus}`}
                      role="status"
                    >
                      {healthStatus === 'ok' &&
                        t('settings.api.connected', { msg: healthMessage })}
                      {healthStatus === 'fail' &&
                        t('settings.api.connectionFailed', {
                          msg: healthMessage,
                        })}
                    </p>
                  )}
                </div>
                <div className="settings-callout settings-callout--info">
                  <p className="settings-callout__title">
                    {t('settings.api.deepseekTitle')}
                  </p>
                  <p className="settings-muted">
                    {t('settings.api.deepseekHint')}
                  </p>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'diagnostics' && <DiagnosticsSection />}

          {activeSection === 'interface' && (
            <section className="settings-panel">
              <div className="settings-panel__inner settings-panel__inner--stack">
                <div className="settings-list__row settings-list__row--stack">
                  <div className="settings-list__text">
                    <span className="settings-list__label">
                      {t('settings.uiLocale.label')}
                    </span>
                    <span className="settings-list__hint">
                      {t('settings.uiLocale.hint')}
                    </span>
                  </div>
                  <SegmentedControl
                    ariaLabel={t('settings.uiLocale.label')}
                    value={settings.ui.locale}
                    options={[
                      { value: 'en', label: t('settings.uiLocale.en') },
                      { value: 'zh', label: t('settings.uiLocale.zh') },
                    ]}
                    onChange={(v) => patchUi({ locale: v as UiLocale })}
                  />
                </div>
                <div className="settings-list__row settings-list__row--field">
                  <div className="settings-list__text">
                    <span className="settings-list__label">
                      {t('settings.interface.currency')}
                    </span>
                    <span className="settings-list__hint">
                      {t('settings.interface.currencyHint')}
                    </span>
                  </div>
                  <select
                    className="settings-select"
                    aria-label={t('settings.interface.currency')}
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
                  label={t('settings.interface.compact')}
                  description={t('settings.interface.compactHint')}
                  checked={settings.ui.compactMode}
                  onChange={(v) => patchUi({ compactMode: v })}
                />
                <SettingsToggle
                  id="ui-hints"
                  label={t('settings.interface.hints')}
                  description={t('settings.interface.hintsDesc')}
                  checked={settings.ui.showProgressHints}
                  onChange={(v) => patchUi({ showProgressHints: v })}
                />
                <SettingsToggle
                  id="ui-motion"
                  label={t('settings.interface.motion')}
                  description={t('settings.interface.motionHint')}
                  checked={settings.ui.reduceMotion}
                  onChange={(v) => patchUi({ reduceMotion: v })}
                />
              </div>
            </section>
          )}
        </div>
      </Layout.Content>
    </Layout>
  )
}
