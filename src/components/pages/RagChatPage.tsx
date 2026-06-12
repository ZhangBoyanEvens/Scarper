import { FileSearchOutlined } from '@ant-design/icons'
import { Flex, Input, Select, Spin, Tag, theme } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { formatLocaleShortDateTime } from '../../i18n/localeFormat'
import { ScarperToolbarField } from '../common/ScarperToolbarField'
import { scarperSelectProps } from '../common/scarperForm'
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
import '../dashboard/DashboardEditor.css'
import '../pages/DashboardPage.css'
import '../../styles/scrollbar.css'
import './RagChatPage.css'

function formatTaskLabel(
  record: ProjectDataRecord,
  index: number,
  t: (path: string, params?: Record<string, string | number>) => string,
  locale: 'en' | 'zh',
): string {
  const when = formatLocaleShortDateTime(record.uploadedAt, locale)
  return `#${index + 1} ${when} · ${t('ragChat.taskItems', { count: record.resultCount })}`
}

export function RagChatPage() {
  const { t, locale } = useI18n()
  const { token } = theme.useToken()
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
  const contentRef = useRef<TextAreaRef>(null)

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
      ? `${projectName}${taskIndex >= 0 ? ` · ${formatTaskLabel(records[taskIndex], taskIndex, t, locale)}` : ''}`
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
    const root =
      contentRef.current?.resizableTextArea?.textArea ?? null
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
            <section className="dashboard-toolbar" aria-label="Project and task selection">
              <Flex wrap="wrap" gap={12} align="center" className="dashboard-toolbar__fields">
                <ScarperToolbarField label={t('fields.project')}>
                  <Select
                    {...scarperSelectProps()}
                    value={projectId || undefined}
                    placeholder={
                      showProjectsLoading
                        ? t('ragChat.loadingProjects')
                        : projects.length === 0
                          ? t('ragChat.noProjects')
                          : t('ragChat.selectProject')
                    }
                    disabled={loadingProjects || projects.length === 0}
                    options={projects.map((p) => ({ value: p.id, label: p.name }))}
                    onChange={handleProjectChange}
                  />
                </ScarperToolbarField>

                <ScarperToolbarField label={t('fields.task')}>
                  <Select
                    {...scarperSelectProps({ minWidth: 200, maxWidth: 320 })}
                    value={taskId || undefined}
                    placeholder={
                      !projectId
                        ? t('ragChat.selectProjectFirst')
                        : records.length === 0
                          ? t('ragChat.noRecords')
                          : t('ragChat.selectTask')
                    }
                    disabled={!projectId || records.length === 0}
                    options={records.map((r, i) => ({
                      value: r.id,
                      label: formatTaskLabel(r, i, t, locale),
                    }))}
                    onChange={(id) => {
                      setTaskId(id)
                      setSelectedText('')
                    }}
                  />
                </ScarperToolbarField>

                {selectedText ? (
                  <Tag icon={<FileSearchOutlined />} color="processing">
                    {selectedText.length} characters selected
                  </Tag>
                ) : null}
              </Flex>
            </section>

            <section className="rag-chat-content" aria-label="Task body">
              {showTaskLoading ? (
                <Flex align="center" justify="center" style={{ flex: 1, minHeight: 200 }}>
                  <Spin tip={t('ragChat.loadingTask')} />
                </Flex>
              ) : (
                <Input.TextArea
                  ref={contentRef}
                  className="rag-chat-content__textarea scarper-scrollbar scarper-scrollbar--editor"
                  readOnly
                  value={documentText}
                  placeholder={
                    taskId
                      ? t('ragChat.noBody')
                      : t('ragChat.selectProjectTask')
                  }
                  onMouseUp={syncSelection}
                  onKeyUp={syncSelection}
                  onSelect={syncSelection}
                  style={{
                    flex: 1,
                    minHeight: 200,
                    resize: 'none',
                    background: token.colorBgContainer,
                    color: token.colorText,
                    borderColor: token.colorBorder,
                  }}
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
