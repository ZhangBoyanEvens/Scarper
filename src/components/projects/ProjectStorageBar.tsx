import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchNeonStorage,
  isNeonUploadPreferred,
} from '../../services/neonProjectApi'
import type { NeonStorageResponse } from '../../types/neon'
import { formatBytes } from '../../utils/formatBytes'

const REFRESH_DEBOUNCE_MS = 2500

export function ProjectStorageBar() {
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
      /* 保留上次用量，避免闪烁 */
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
      className={[
        'project-storage',
        loading && hasShownRef.current ? 'project-storage--refreshing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Neon 云存储用量"
      aria-busy={loading}
    >
      <div className="project-storage__labels">
        <span className="project-storage__title">云存储</span>
        <span className="project-storage__nums">
          {showInitialLoading
            ? '统计中…'
            : `${formatBytes(used)} / ${formatBytes(quota)}`}
        </span>
      </div>
      <div
        className="project-storage__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={quota}
        aria-valuenow={showInitialLoading ? undefined : used}
        aria-valuetext={
          showInitialLoading ? undefined : `已用 ${percent.toFixed(1)}%`
        }
      >
        <div
          className={[
            'project-storage__fill',
            nearFull ? 'project-storage__fill--warn' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            width: showInitialLoading ? '0%' : `${Math.min(100, percent)}%`,
          }}
        />
      </div>
      {!showInitialLoading && nearFull ? (
        <p className="project-storage__hint">存储即将用尽，请删除旧记录或精简正文</p>
      ) : null}
    </div>
  )
}
