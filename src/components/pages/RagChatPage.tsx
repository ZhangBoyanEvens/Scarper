import { useCallback, useEffect, useRef, useState } from 'react'
import { useLoadingVisible } from '../../hooks/useLoadingVisible'
import { DashboardChatDrawer } from '../dashboard/DashboardChatDrawer'
import { listProjects, peekProjects } from '../../services/projectService'
import {
  listProjectDataRecords,
  loadTaskDbResults,
  loadTaskEditorText,
  loadTaskStoredDocumentText,
  peekProjectRecords,
  peekTaskEditorText,
} from '../../services/projectRecordService'
import { buildRagCorpus, type DashboardRagCorpus } from '../../utils/dashboardRag'
import type { Project } from '../../types/project'
import type { ProjectDataRecord } from '../../types/projectRecord'
import '../Layout/OutputLanguageSelect.css'
import '../dashboard/DashboardEditor.css'
import '../pages/DashboardPage.css'
import '../../styles/scrollbar.css'
import './RagChatPage.css'

function formatTaskLabel(record: ProjectDataRecord, index: number): string {
  let when = record.uploadedAt
  try {
    when = new Date(record.uploadedAt).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    /* keep raw */
  }
  return `#${index + 1} ${when} · ${record.resultCount} items`
}

export function RagChatPage() {
  const initialProjects = peekProjects()
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [records, setRecords] = useState<ProjectDataRecord[]>([])
  const [projectId, setProjectId] = useState(initialProjects[0]?.id ?? '')
  const [taskId, setTaskId] = useState('')
  const [documentText, setDocumentText] = useState('')
  const [selectedText, setSelectedText] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(
    initialProjects.length === 0,
  )
  const [loadingTask, setLoadingTask] = useState(false)
  const [ragCorpus, setRagCorpus] = useState<DashboardRagCorpus | null>(null)
  const [ragLoading, setRagLoading] = useState(false)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  const showProjectsLoading = useLoadingVisible(
    loadingProjects && projects.length === 0,
  )
  const showTaskLoading = useLoadingVisible(
    loadingTask && !documentText && Boolean(taskId),
  )

  const refreshProjects = useCallback(async () => {
    const cached = peekProjects()
    if (cached.length > 0) {
      setProjects(cached)
      setLoadingProjects(false)
    } else {
      setLoadingProjects(true)
    }
    try {
      const list = await listProjects()
      setProjects(list)
      setProjectId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev
        return list[0]?.id ?? ''
      })
    } catch {
      setProjects([])
      setProjectId('')
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  useEffect(() => {
    void refreshProjects()
    const onChanged = () => void refreshProjects()
    window.addEventListener('scarper:projects-changed', onChanged)
    return () => window.removeEventListener('scarper:projects-changed', onChanged)
  }, [refreshProjects])

  useEffect(() => {
    if (!projectId) {
      setRecords([])
      setTaskId('')
      return
    }
    const stale = peekProjectRecords(projectId)
    if (stale.length > 0) {
      setRecords(stale)
      setTaskId((prev) => {
        if (prev && stale.some((r) => r.id === prev)) return prev
        return stale[0]?.id ?? ''
      })
    }
    let cancelled = false
    void (async () => {
      try {
        const list = await listProjectDataRecords(projectId)
        if (cancelled) return
        setRecords(list)
        setTaskId((prev) => {
          if (prev && list.some((r) => r.id === prev)) return prev
          return list[0]?.id ?? ''
        })
      } catch {
        if (!cancelled && stale.length === 0) {
          setRecords([])
          setTaskId('')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId || !taskId) {
      setDocumentText('')
      setSelectedText('')
      return
    }
    setSelectedText('')
    const preview = peekTaskEditorText(projectId, taskId)
    if (preview) {
      setDocumentText(preview)
      setLoadingTask(false)
    } else {
      setLoadingTask(true)
    }

    let cancelled = false
    void (async () => {
      try {
        const text = await loadTaskEditorText(projectId, taskId)
        if (cancelled) return
        setDocumentText(text)
      } catch {
        if (!cancelled && !preview) setDocumentText('')
      } finally {
        if (!cancelled) setLoadingTask(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, taskId])

  const projectName = projects.find((p) => p.id === projectId)?.name ?? ''
  const taskIndex = records.findIndex((r) => r.id === taskId)
  const chatContextHint =
    projectName && taskId
      ? `${projectName}${taskIndex >= 0 ? ` · ${formatTaskLabel(records[taskIndex], taskIndex)}` : ''}`
      : projectName || ''

  const refreshRagCorpus = useCallback(async () => {
    if (!projectId || !taskId) {
      setRagCorpus(null)
      return
    }
    const results = await loadTaskDbResults(projectId, taskId)
    const docText = await loadTaskStoredDocumentText(projectId, taskId)
    setRagCorpus(
      buildRagCorpus(
        results,
        chatContextHint || `Task ${taskId.slice(0, 8)}`,
        docText,
      ),
    )
  }, [projectId, taskId, chatContextHint])

  useEffect(() => {
    if (!projectId || !taskId) {
      setRagCorpus(null)
      setRagLoading(false)
      return
    }
    let cancelled = false
    setRagLoading(true)
    void (async () => {
      try {
        if (cancelled) return
        await refreshRagCorpus()
      } catch {
        if (!cancelled) setRagCorpus(null)
      } finally {
        if (!cancelled) setRagLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, taskId, refreshRagCorpus])

  const syncSelection = useCallback(() => {
    const root = contentRef.current
    const sel = window.getSelection()
    if (!root || !sel || sel.rangeCount === 0) {
      setSelectedText('')
      return
    }
    const range = sel.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) {
      setSelectedText('')
      return
    }
    setSelectedText(sel.toString().trim())
  }, [])

  const handleProjectChange = (id: string) => {
    setProjectId(id)
    setTaskId('')
    setSelectedText('')
  }

  return (
    <main className="app-main dashboard-page rag-chat-page">
      <div className="dashboard-shell">
        <div className="dashboard-panel__body">
          <div className="dashboard-main">
            <header className="dashboard-head">
              <h2 className="dashboard-head__title">RAG Chat</h2>
              <p className="rag-chat-head__desc">
                Select a Project and Task, highlight text, then ask AI — answers are grounded in your database
              </p>
            </header>

            <section className="dashboard-toolbar" aria-label="Project and task selection">
              <div className="dashboard-toolbar__fields">
                <label className="dashboard-field">
                  <span className="dashboard-field__label">Project</span>
                  <select
                    className="lang-select-control dashboard-select"
                    value={projectId}
                    disabled={loadingProjects || projects.length === 0}
                    onChange={(e) => handleProjectChange(e.target.value)}
                  >
                    {showProjectsLoading ? (
                      <option value="">Loading…</option>
                    ) : projects.length === 0 ? (
                      <option value="">No projects</option>
                    ) : (
                      projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="dashboard-field">
                  <span className="dashboard-field__label">Task</span>
                  <select
                    className="lang-select-control dashboard-select"
                    value={taskId}
                    disabled={!projectId || records.length === 0}
                    onChange={(e) => {
                      setTaskId(e.target.value)
                      setSelectedText('')
                    }}
                  >
                    {!projectId ? (
                      <option value="">Select a Project first</option>
                    ) : records.length === 0 ? (
                      <option value="">No records</option>
                    ) : (
                      records.map((r, i) => (
                        <option key={r.id} value={r.id}>
                          {formatTaskLabel(r, i)}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>
              {selectedText ? (
                <span className="rag-chat-selection-badge" role="status">
                  {selectedText.length} characters selected
                </span>
              ) : null}
            </section>

            <section className="rag-chat-content" aria-label="Task body">
              {showTaskLoading ? (
                <p className="dashboard-editor-placeholder">Loading task content…</p>
              ) : (
                <textarea
                  ref={contentRef}
                  className="rag-chat-content__textarea scarper-scrollbar scarper-scrollbar--editor"
                  readOnly
                  value={documentText}
                  placeholder={
                    taskId
                      ? 'This Task has no body yet — edit in Dashboard or upload from Scrape'
                      : 'Select a Project and Task'
                  }
                  onMouseUp={syncSelection}
                  onKeyUp={syncSelection}
                  onSelect={syncSelection}
                />
              )}
            </section>
          </div>

          <DashboardChatDrawer
            variant="rag"
            editorContext={documentText}
            contextHint={chatContextHint}
            ragCorpus={ragCorpus}
            ragLoading={ragLoading}
            selectionContext={selectedText}
          />
        </div>
      </div>
    </main>
  )
}
