import { Progress, Typography, theme } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import {
  fetchNeonStorage,
  isNeonUploadPreferred,
} from '../../services/neonProjectApi'
import type { NeonStorageResponse } from '../../types/neon'
import { formatBytes } from '../../utils/formatBytes'

const { Text } = Typography
const REFRESH_DEBOUNCE_MS = 2500

export function ProjectStorageBar() {
  const { t } = useI18n()
  const { token } = theme.useToken()
  const [storage, setStorage] = useState<NeonStorageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [hidden, setHidden] = useState(false)
  const hasShownRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)

  const refresh = useCallback(async (force = false) => {
    if (!isNeonUploadPreferred()) {
      setHidden(true)
      setLoading(false)
      return
    }
    if (inFlightRef.current) return
    inFlightRef.current = true

    const isFirst = !hasShownRef.current
    if (isFirst) setLoading(true)

    try {
      const data = await fetchNeonStorage(force)
      if (!data) {
        if (!hasShownRef.current) setHidden(true)
        return
      }
      hasShownRef.current = true
      setHidden(false)
      setStorage(data)
    } catch {
      /* keep last usage */
    } finally {
      inFlightRef.current = false
      if (isFirst) setLoading(false)
    }
  }, [])

  const scheduleRefresh = useCallback(
    (force = false) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        void refresh(force)
      }, REFRESH_DEBOUNCE_MS)
    },
    [refresh],
  )

  useEffect(() => {
    void refresh(true)
    const onRecords = () => scheduleRefresh(true)
    const onProjects = () => scheduleRefresh(true)
    window.addEventListener('scarper:project-records-changed', onRecords)
    window.addEventListener('scarper:projects-changed', onProjects)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      window.removeEventListener('scarper:project-records-changed', onRecords)
      window.removeEventListener('scarper:projects-changed', onProjects)
    }
  }, [refresh, scheduleRefresh])

  if (hidden || (!loading && !storage && !hasShownRef.current)) return null

  const used = storage?.used_bytes ?? 0
  const quota = storage?.quota_bytes ?? 200 * 1024 * 1024
  const percent = storage?.used_percent ?? 0
  const nearFull = percent >= 90
  const showInitialLoading = loading && !hasShownRef.current

  return (
    <div
      className="project-storage"
      style={{
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorFillAlter,
      }}
      aria-label={t('project.storage.aria')}
      aria-busy={loading}
    >
      <div className="project-storage__labels">
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('project.storage.label')}
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {showInitialLoading
            ? t('project.storage.calculating')
            : `${formatBytes(used)} / ${formatBytes(quota)}`}
        </Text>
      </div>
      <Progress
        percent={showInitialLoading ? 0 : Math.min(100, percent)}
        showInfo={false}
        strokeColor={nearFull ? token.colorWarning : token.colorPrimary}
        trailColor={token.colorFillSecondary}
        size="small"
        aria-label={t('project.storage.aria')}
      />
      {!showInitialLoading && nearFull ? (
        <Text type="warning" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          {t('project.storage.almostFull')}
        </Text>
      ) : null}
    </div>
  )
}
