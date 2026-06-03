import { useCallback, useEffect, useState } from 'react'
import { fetchNeonStatus, isNeonUploadPreferred } from '../../services/neonProjectApi'

export function DataStorageSection() {
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
      setError(e instanceof Error ? e.message : '无法获取存储状态')
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
              <span className="settings-list__label">Project 存储</span>
              <span className="settings-list__hint">
                抓取结果、FinDoc 文档与模板优先写入 Neon；未连接时回退浏览器
                localStorage
              </span>
            </div>
            <div className="settings-storage-badge-row">
              {loading ? (
                <span className="settings-storage-badge is-loading">检测中…</span>
              ) : connected ? (
                <span className="settings-storage-badge is-neon">Neon 已连接</span>
              ) : (
                <span className="settings-storage-badge is-local">本地模式</span>
              )}
              <button
                type="button"
                className="settings-btn settings-btn--ghost"
                disabled={loading}
                onClick={() => void refresh()}
              >
                刷新
              </button>
            </div>
            {error ? (
              <p className="settings-muted settings-storage-note" role="status">
                状态探测失败：{error}（不影响已缓存的本地数据）
              </p>
            ) : null}
          </div>
        </div>

        <div className="settings-callout settings-callout--info">
          <p className="settings-callout__title">各模块数据说明</p>
          <ul className="settings-data-list">
            <li>
              <strong>Scrape</strong> — 抓取结果可上传至 Project；处理指令保存在本地
            </li>
            <li>
              <strong>Dashboard</strong> — 编辑 Task 正文，保存至 Neon / 本地
            </li>
            <li>
              <strong>FinDoc</strong> — 模板存 Neon；左右栏草稿存 localStorage
            </li>
            <li>
              <strong>Project</strong> — 更新记录列表来自 Neon 或本地条目表
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
