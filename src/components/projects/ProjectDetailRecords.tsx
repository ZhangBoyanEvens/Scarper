import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, List, Space, Spin, Tag, Typography, theme } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { formatLocaleDateTime } from '../../i18n/localeFormat'
import { useLoadingVisible } from '../../hooks/useLoadingVisible'
import {
  deleteProjectDataRecord,
  listProjectDataRecords,
  peekProjectRecords,
} from '../../services/projectRecordService'
import type { ProjectDataRecord } from '../../types/projectRecord'

const { Text } = Typography

interface ProjectDetailRecordsProps {
  projectId: string
  onOpenFindocRecord?: (projectId: string, recordId: string) => void
}

export function ProjectDetailRecords({
  projectId,
  onOpenFindocRecord,
}: ProjectDetailRecordsProps) {
  const { t, locale } = useI18n()
  const { token } = theme.useToken()
  const initial = peekProjectRecords(projectId)
  const [records, setRecords] = useState<ProjectDataRecord[]>(initial)
  const [loading, setLoading] = useState(initial.length === 0)
  const [error, setError] = useState<string | null>(null)
  const showLoading = useLoadingVisible(loading && records.length === 0)

  const uploadMethodLabel = (source: string): string => {
    if (source === 'scrape') return t('recordSource.scrape')
    if (source === 'findoc') return t('recordSource.findoc')
    return source
  }

  const recordSummary = (record: ProjectDataRecord): string => {
    if (record.source === 'findoc') {
      return t('recordSource.findocDoc')
    }
    const countKey =
      record.resultCount === 1 ? 'recordSource.item' : 'recordSource.items'
    const base = t(countKey, { count: record.resultCount })
    if (record.successCount >= 0) {
      return `${base} ${t('recordSource.succeeded', { count: record.successCount })}`
    }
    return base
  }

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
        setError(
          err instanceof Error ? err.message : t('project.records.loadFailed'),
        )
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, t])

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
    const date = formatLocaleDateTime(record.uploadedAt, locale)
    if (
      !window.confirm(
        t('project.records.deleteConfirm', {
          date,
          count: record.resultCount,
        }),
      )
    ) {
      return
    }
    try {
      await deleteProjectDataRecord(projectId, record.id)
      await load()
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : t('project.records.deleteFailed'),
      )
    }
  }

  return (
    <section className="project-records" aria-label={t('project.records.title')}>
      <div className="project-records__head">
        <Text strong>{t('project.records.title')}</Text>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void load()}
        >
          {t('project.records.refresh')}
        </Button>
      </div>

      {showLoading && (
        <div className="project-records__center">
          <Spin size="small" />
          <Text type="secondary">{t('project.records.loading')}</Text>
        </div>
      )}

      {error && !showLoading && (
        <Text type="danger" role="alert">
          {error}
        </Text>
      )}

      {!showLoading && !error && records.length === 0 && (
        <Text type="secondary">{t('project.records.empty')}</Text>
      )}

      {!showLoading && records.length > 0 && (
        <List
          className="project-records__list"
          dataSource={records}
          renderItem={(record, index) => (
            <List.Item
              className="project-records__item"
              style={{
                background: token.colorFillAlter,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusLG,
                marginBottom: 8,
                padding: '12px 16px',
              }}
              actions={[
                record.source === 'findoc' && onOpenFindocRecord ? (
                  <Button
                    key="open"
                    type="link"
                    size="small"
                    onClick={() => onOpenFindocRecord(projectId, record.id)}
                  >
                    {t('project.records.openInFindoc')}
                  </Button>
                ) : null,
                <Button
                  key="delete"
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={t('project.records.deleteRecord')}
                  onClick={() => void handleDelete(record)}
                />,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                avatar={
                  <Tag color="blue" style={{ margin: 0 }}>
                    {index + 1}
                  </Tag>
                }
                title={
                  <Text>
                    {t('project.records.updateRecord')} ·{' '}
                    {uploadMethodLabel(record.source)}
                    {record.bodyOnly
                      ? ` · ${t('project.records.withBody')}`
                      : ` · ${t('project.records.withoutBody')}`}
                  </Text>
                }
                description={
                  <Space direction="vertical" size={2}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {recordSummary(record)} ·{' '}
                      {record.storage === 'neon'
                        ? t('project.records.storageNeon')
                        : t('project.records.storageLocal')}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('project.records.uploaded', {
                        date: formatLocaleDateTime(record.uploadedAt, locale),
                      })}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </section>
  )
}
