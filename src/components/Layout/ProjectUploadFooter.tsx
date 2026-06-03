import { useCallback, useEffect, useId, useState } from 'react'
import type { ResultsState } from '../Results/ResultsPanel'
import { useAppSettings } from '../../contexts/AppSettingsContext'
import { listProjects, touchProject } from '../../services/projectService'
import { uploadProjectResults } from '../../services/projectUpload'
import {
  getSelectedProjectId,
  setSelectedProjectId,
} from '../../storage/projectDatabaseStorage'
import { listProjectsLocal } from '../../storage/projectStorage'
import { isExtractSuccess } from '../../types/extraction'
import { prepareUploadResults } from '../../utils/uploadPayload'
import '../../styles/layout.css'
import '../../styles/panel.css'
import './OutputLanguageSelect.css'
import './TextInputSection.css'
import './ProjectUploadFooter.css'

interface ProjectUploadFooterProps {
  resultsState: ResultsState
}

export function ProjectUploadFooter({ resultsState }: ProjectUploadFooterProps) {
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
      const uploadedAt = new Date(entry.uploadedAt)
      const timeLabel = uploadedAt.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
      const bodyNote = includeBody ? 'with body' : 'summary only'
      const store = entry.storage === 'neon' ? 'Neon' : 'local'
      setStatus(
        `Saved to project · Scrape · ${bodyNote} · ${ok}/${total} items · ${timeLabel} · ${store}`,
      )
    } catch (err) {
      setStatus(
        err instanceof Error ? err.message : 'Upload failed — try again later',
      )
    } finally {
      setUploading(false)
    }
  }, [canUpload, projectId, resultsState, includeBody])

  const noProjects = projects.length === 0

  return (
    <footer className="scrape-page-footer" aria-label="Upload to project">
      <div className="panel-shell scrape-footer-bar">
        <div className="panel-inner scrape-footer-bar-inner">
          <span className="scrape-footer-field-label" id={`${selectId}-label`}>
            Select project:
          </span>
          <select
            id={selectId}
            className="lang-select-control scrape-footer-select"
            aria-labelledby={`${selectId}-label`}
            value={projectId}
            disabled={noProjects || uploading}
            onChange={(e) => handleProjectChange(e.target.value)}
          >
            {noProjects ? (
              <option value="">No projects</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))
            )}
          </select>

          <label className="scrape-footer-check" htmlFor={checkId}>
            <input
              id={checkId}
              type="checkbox"
              className="scrape-footer-check-input"
              checked={includeBody}
              disabled={uploading}
              onChange={(e) => {
                patchScrape({ uploadIncludeBody: e.target.checked })
                setStatus(null)
              }}
            />
            <span className="scrape-footer-check-text">Include full body text</span>
          </label>

          <button
            type="button"
            className="text-input-save scrape-footer-upload-btn"
            disabled={!canUpload || uploading}
            onClick={() => void handleUpload()}
          >
            {uploading ? 'Uploading…' : 'Upload to Project Database'}
          </button>
        </div>
      </div>
      {status && (
        <p
          className={`scrape-footer-message${
            status.toLowerCase().includes('fail')
              ? ' scrape-footer-message--error'
              : ' scrape-footer-message--ok'
          }`}
          role="status"
        >
          {status}
        </p>
      )}
    </footer>
  )
}
