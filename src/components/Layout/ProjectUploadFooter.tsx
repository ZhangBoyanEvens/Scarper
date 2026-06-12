import { UploadOutlined } from '@ant-design/icons'
import { Button, Card, Checkbox, Flex, Select, Typography } from 'antd'
import { useCallback, useEffect, useId, useState } from 'react'
import type { ResultsState } from '../Results/ResultsPanel'
import { useAppSettings } from '../../contexts/AppSettingsContext'
import { useI18n } from '../../contexts/I18nContext'
import { formatScrapeUploadStatus } from '../../i18n/scrapeHelpers'
import { formatLocaleShortDateTime } from '../../i18n/localeFormat'
import { listProjects, touchProject } from '../../services/projectService'
import { uploadProjectResults } from '../../services/projectUpload'
import {
  getSelectedProjectId,
  setSelectedProjectId,
} from '../../storage/projectDatabaseStorage'
import { listProjectsLocal } from '../../storage/projectStorage'
import { isExtractSuccess } from '../../types/extraction'
import { prepareUploadResults } from '../../utils/uploadPayload'
import { ScarperToolbarField } from '../common/ScarperToolbarField'
import { scarperSelectProps } from '../common/scarperForm'
import './ProjectUploadFooter.css'

const { Text } = Typography

interface ProjectUploadFooterProps {
  resultsState: ResultsState
}

export function ProjectUploadFooter({ resultsState }: ProjectUploadFooterProps) {
  const { t, locale } = useI18n()
  const { settings, patchScrape } = useAppSettings()
  const selectId = useId()
  const checkId = useId()
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof listProjects>>>([])
  const [projectId, setProjectId] = useState<string>(() => {
    const saved = getSelectedProjectId()
    const all = listProjectsLocal()
    if (saved && all.some((p) => p.id === saved)) return saved
    return all[0]?.id ?? ''
  })
  const includeBody = settings.scrape.uploadIncludeBody
  const [status, setStatus] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const refresh = () => {
      void (async () => {
        const all = await listProjects()
        setProjects(all)
        setProjectId((prev) => {
          if (prev && all.some((p) => p.id === prev)) return prev
          const saved = getSelectedProjectId()
          if (saved && all.some((p) => p.id === saved)) return saved
          return all[0]?.id ?? ''
        })
      })()
    }
    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener('scarper:projects-changed', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('scarper:projects-changed', refresh)
    }
  }, [])

  useEffect(() => {
    setStatus(null)
  }, [resultsState])

  const handleProjectChange = (id: string) => {
    setProjectId(id)
    setSelectedProjectId(id || null)
    setStatus(null)
  }

  const hasDoneResults =
    resultsState.kind === 'done' && resultsState.results.length > 0

  const hasBodyContent =
    resultsState.kind === 'done' &&
    resultsState.results.some(
      (r) => isExtractSuccess(r) && r.content.trim().length > 0,
    )

  const canUpload =
    hasDoneResults &&
    Boolean(projectId) &&
    projects.length > 0 &&
    (!includeBody || hasBodyContent)

  const handleUpload = useCallback(async () => {
    if (!canUpload || resultsState.kind !== 'done') return

    setUploading(true)
    setStatus(null)
    try {
      const payload = prepareUploadResults(resultsState.results, includeBody)
      const entry = await uploadProjectResults(projectId, payload, {
        includeBody,
        uploadMethod: 'scrape',
      })
      await touchProject(projectId)
      window.dispatchEvent(new Event('scarper:project-records-changed'))
      window.dispatchEvent(new Event('scarper:projects-changed'))
      const ok = payload.filter(isExtractSuccess).length
      const total = payload.length
      const timeLabel = formatLocaleShortDateTime(entry.uploadedAt, locale)
      setStatus(
        formatScrapeUploadStatus(t, {
          includeBody,
          ok,
          total,
          timeLabel,
          storage: entry.storage === 'neon' ? 'neon' : 'local',
        }),
      )
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : t('scrape.upload.uploadFailed'),
      )
    } finally {
      setUploading(false)
    }
  }, [canUpload, projectId, resultsState, includeBody, t, locale])

  const noProjects = projects.length === 0
  const statusIsError = status?.toLowerCase().includes('fail') ?? false

  return (
    <footer className="scrape-page__upload" aria-label={t('scrape.upload.aria')}>
      <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
        <Flex wrap="wrap" gap={12} align="center">
          <ScarperToolbarField label={t('fields.project')}>
            <Select
              id={selectId}
              {...scarperSelectProps({ minWidth: 180, maxWidth: 260 })}
              aria-labelledby={`${selectId}-label`}
              value={projectId || undefined}
              placeholder={
                noProjects ? t('scrape.upload.noProjects') : t('scrape.upload.selectProject')
              }
              disabled={noProjects || uploading}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              onChange={handleProjectChange}
            />
          </ScarperToolbarField>

          <Checkbox
            id={checkId}
            checked={includeBody}
            disabled={uploading}
            onChange={(e) => {
              patchScrape({ uploadIncludeBody: e.target.checked })
              setStatus(null)
            }}
          >
            {t('scrape.upload.includeBody')}
          </Checkbox>

          <Button
            type="primary"
            icon={<UploadOutlined />}
            disabled={!canUpload || uploading}
            loading={uploading}
            style={{ marginLeft: 'auto' }}
            onClick={() => void handleUpload()}
          >
            {t('scrape.upload.uploadToProject')}
          </Button>
        </Flex>
      </Card>
      {status ? (
        <Text
          type={statusIsError ? 'danger' : 'success'}
          style={{ display: 'block', marginTop: 8, fontSize: 12 }}
          role="status"
        >
          {status}
        </Text>
      ) : null}
    </footer>
  )
}
