import { useCallback, useEffect, useState } from 'react'
import { useLoadingVisible } from '../../hooks/useLoadingVisible'
import {
  deleteProjectDataRecord,
  listProjectDataRecords,
  peekProjectRecords,
} from '../../services/projectRecordService'
import type { ProjectDataRecord } from '../../types/projectRecord'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function uploadMethodLabel(source: string): string {
  if (source === 'scrape') return 'Scrape'
  if (source === 'findoc') return 'FinDoc'
  return source
}

function recordSummary(record: ProjectDataRecord): string {
  if (record.source === 'findoc') {
    return 'FinDoc 文档 · 含正文'
  }
  return `${record.resultCount} 条${
    record.successCount >= 0 ? `（成功 ${record.successCount}）` : ''
  }`
}

interface ProjectDetailRecordsProps {
  projectId: string
  onOpenFindocRecord?: (projectId: string, recordId: string) => void
}

export function ProjectDetailRecords({
  projectId,
  onOpenFindocRecord,
}: ProjectDetailRecordsProps) {
  const initial = peekProjectRecords(projectId)
  const [records, setRecords] = useState<ProjectDataRecord[]>(initial)
  const [loading, setLoading] = useState(initial.length === 0)
  const [error, setError] = useState<string | null>(null)
  const showLoading = useLoadingVisible(loading && records.length === 0)

  const load = useCallback(async () => {
    const stale = peekProjectRecords(projectId)
    if (stale.length > 0) {
      setRecords(stale)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const list = await listProjectDataRecords(projectId)
      setRecords(list)
    } catch (err) {
      if (stale.length === 0) {
        setRecords([])
        setError(err instanceof Error ? err.message : '加载记录失败')
      }
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
    const onChanged = () => void load()
    window.addEventListener('scarper:project-records-changed', onChanged)
    window.addEventListener('scarper:projects-changed', onChanged)
    return () => {
      window.removeEventListener('scarper:project-records-changed', onChanged)
      window.removeEventListener('scarper:projects-changed', onChanged)
    }
  }, [load])

  const handleDelete = async (record: ProjectDataRecord) => {
    if (
      !window.confirm(
        `确定删除这条数据记录？\n${formatDate(record.uploadedAt)} · ${record.resultCount} 条`,
      )
    ) {
      return
    }
    try {
      await deleteProjectDataRecord(projectId, record.id)
      await load()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  return (
    <section className="project-records" aria-label="数据插入记录">
      <div className="project-records__head">
        <h4 className="project-records__title">更新记录</h4>
        <button
          type="button"
          className="project-records__refresh"
          disabled={loading}
          onClick={() => void load()}
        >
          刷新
        </button>
      </div>

      {showLoading && <p className="project-records__hint">加载中…</p>}
      {error && !showLoading && (
        <p className="project-records__error" role="alert">
          {error}
        </p>
      )}
      {!showLoading && !error && records.length === 0 && (
        <p className="project-records__hint">
          暂无记录。在 Scrape 页上传抓取结果，或在 FinDoc 页 Save 保存文档至此。
        </p>
      )}

      {!showLoading && records.length > 0 && (
        <ul className="project-records__list">
          {records.map((record, index) => (
            <li key={record.id} className="project-records__item">
              <div className="project-records__main">
                <span className="project-records__index">{index + 1}</span>
                <div className="project-records__content">
                  <span className="project-records__type">
                    更新记录 · {uploadMethodLabel(record.source)}
                    {record.bodyOnly ? ' · 含正文' : ' · 不含正文'}
                  </span>
                  <span className="project-records__stats">
                    {recordSummary(record)}
                    {' · '}
                    {record.storage === 'neon' ? 'Neon' : '本地'}
                  </span>
                  <span className="project-records__time">
                    上传于 {formatDate(record.uploadedAt)}
                  </span>
                </div>
              </div>
              <div className="project-records__actions">
                {record.source === 'findoc' && onOpenFindocRecord ? (
                  <button
                    type="button"
                    className="project-records__open"
                    onClick={() => onOpenFindocRecord(projectId, record.id)}
                  >
                    在 FinDoc 打开
                  </button>
                ) : null}
                <button
                  type="button"
                  className="project-records__delete"
                  aria-label="删除记录"
                  onClick={() => void handleDelete(record)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
