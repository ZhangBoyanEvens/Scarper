import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { fetchNeonStatus, isNeonUploadPreferred } from '../../services/neonProjectApi'

export function DataStorageSection() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchNeonStatus(true)
      setConnected(Boolean(data.connected && data.mode === 'neon'))
    } catch (e) {
      setConnected(null)
      setError(e instanceof Error ? e.message : 'Unable to fetch storage status')
      if (!isNeonUploadPreferred()) {
        setConnected(false)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <section className="settings-panel">
      <div className="settings-panel__inner settings-panel__inner--stack">
        <div className="settings-list">
          <div className="settings-list__row settings-list__row--stack">
            <div className="settings-list__text">
              <span className="settings-list__label">
                {t('settings.data.storage')}
              </span>
              <span className="settings-list__hint">
                {t('settings.data.storageHint')}
              </span>
            </div>
            <div className="settings-storage-badge-row">
              {loading ? (
                <span className="settings-storage-badge is-loading">
                  {t('settings.data.checking')}
                </span>
              ) : connected ? (
                <span className="settings-storage-badge is-neon">
                  {t('settings.data.neonConnected')}
                </span>
              ) : (
                <span className="settings-storage-badge is-local">
                  {t('settings.data.localMode')}
                </span>
              )}
              <button
                type="button"
                className="settings-btn settings-btn--ghost"
                disabled={loading}
                onClick={() => void refresh()}
              >
                {t('common.refresh')}
              </button>
            </div>
            {error ? (
              <p className="settings-muted settings-storage-note" role="status">
                {t('settings.data.probeFailed', { error })}
              </p>
            ) : null}
          </div>
        </div>

        <div className="settings-callout settings-callout--info">
          <p className="settings-callout__title">
            {t('settings.data.modulesTitle')}
          </p>
          <ul className="settings-data-list">
            <li>
              <strong>Scrape</strong> — {t('settings.data.modulesScrape')}
            </li>
            <li>
              <strong>FinDoc</strong> — {t('settings.data.modulesFindoc')}
            </li>
            <li>
              <strong>Project</strong> — {t('settings.data.modulesProject')}
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
