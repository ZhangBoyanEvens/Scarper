import { PlusOutlined } from '@ant-design/icons'
import { Button, Flex, Select, Typography, theme } from 'antd'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { formatLocaleShortDateTime } from '../../i18n/localeFormat'
import { ScarperToolbarField } from '../common/ScarperToolbarField'
import { scarperSelectProps } from '../common/scarperForm'
import { DashboardTaskSelect } from '../dashboard/DashboardTaskSelect'
import { useAppSettings } from '../../contexts/AppSettingsContext'
import { useLoadingVisible } from '../../hooks/useLoadingVisible'
import {
  getFindocTemplateContent,
  listFindocTemplates,
  peekFindocTemplates,
} from '../../services/findocTemplateService'
import {
  listProjectDataRecords,
  loadTaskContentForFinDoc,
  peekProjectRecords,
} from '../../services/projectRecordService'
import { saveFindocOutputToProject, lookupSavedFindocOutput } from '../../services/findocProjectSave'
import type { FindocProceedContext } from '../../types/findoc'
import { rewriteTasksWithTemplate } from '../../services/findocProceedRewrite'
import type { FindocOpenRequest } from '../../types/findoc'
import { listProjects, peekProjects } from '../../services/projectService'
import type { FindocTemplate } from '../../types/findocTemplate'
import type { Project } from '../../types/project'
import type { ProjectDataRecord } from '../../types/projectRecord'
import {
  FinDocOutputPanel,
  type FinDocOutputViewMode,
} from '../findoc/FinDocOutputPanel'
import { exportTextAsWordDocument } from '../../utils/exportWordDocument'
import '../Layout/TextInputSection.css'
import '../projects/ProjectPage.css'
import '../../styles/scrollbar.css'
import './FinDocPage.css'

const FINDOC_SPLIT_DEFAULT_PCT = 40
/** 左栏最窄（分割线向左） */
const FINDOC_SPLIT_MIN_PCT = 20
/** 左栏最宽（分割线向右）≈ 截图 1 */
const FINDOC_SPLIT_MAX_PCT = 78

function clampFindocSplitPct(pct: number): number {
  return Math.min(FINDOC_SPLIT_MAX_PCT, Math.max(FINDOC_SPLIT_MIN_PCT, pct))
}

function formatFindocTaskLabel(
  record: ProjectDataRecord,
  index: number,
  t: (path: string) => string,
  locale: 'en' | 'zh',
): string {
  const when = formatLocaleShortDateTime(record.uploadedAt, locale)
  const kind =
    record.source === 'findoc'
      ? t('recordSource.findoc')
      : t('recordSource.scrape')
  return `#${index + 1} ${when} · ${kind}`
}

export interface FinDocPageProps {
  onCreateTemplate?: () => void
  pendingOpen?: FindocOpenRequest | null
  onPendingOpenConsumed?: () => void
}

export function FinDocPage({
  onCreateTemplate,
  pendingOpen,
  onPendingOpenConsumed,
}: FinDocPageProps) {
  const { t, locale } = useI18n()
  const { token } = theme.useToken()
  const { Text } = Typography
  const {
    settings: { outputLanguage },
  } = useAppSettings()
  const initialProjects = peekProjects()
  const initialTemplates = peekFindocTemplates()
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [templates, setTemplates] = useState<FindocTemplate[]>(initialTemplates)
  const [projectId, setProjectId] = useState(initialProjects[0]?.id ?? '')
  const [templateId, setTemplateId] = useState(initialTemplates[0]?.id ?? '')
  const [adjustmentPrompt, setAdjustmentPrompt] = useState('')
  const [outputText, setOutputText] = useState('')
  const [outputRecordId, setOutputRecordId] = useState<string | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(
    initialProjects.length === 0,
  )
  const [loadingTemplates, setLoadingTemplates] = useState(
    initialTemplates.length === 0,
  )
  const [saving, setSaving] = useState(false)
  const [savingOutput, setSavingOutput] = useState(false)
  const [exportingWord, setExportingWord] = useState(false)
  const [proceeding, setProceeding] = useState(false)
  const [outputViewMode, setOutputViewMode] = useState<FinDocOutputViewMode>('preview')
  const [status, setStatus] = useState<string | null>(null)
  const [outputStatus, setOutputStatus] = useState<string | null>(null)
  const [records, setRecords] = useState<ProjectDataRecord[]>([])
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [leftPanePct, setLeftPanePct] = useState(FINDOC_SPLIT_DEFAULT_PCT)
  const [splitDragging, setSplitDragging] = useState(false)
  const workspaceRef = useRef<HTMLElement>(null)
  const splitDragRef = useRef(false)
  const proceedAbortRef = useRef<AbortController | null>(null)
  const streamingOutputRef = useRef('')
  const promptDraftsRef = useRef<Map<string, string>>(new Map())
  const outputDraftsRef = useRef<Map<string, string>>(new Map())

  const getSelectedTemplateContent = useCallback((): string => {
    if (!templateId) return ''
    return getFindocTemplateContent(templateId).trim()
  }, [templateId])

  const loadPromptDraftForProject = useCallback((id: string): string | undefined => {
    if (promptDraftsRef.current.has(id)) {
      return promptDraftsRef.current.get(id)
    }
    try {
      const stored = localStorage.getItem(`scarper.findoc.draft.${id}`)
      if (stored !== null) {
        promptDraftsRef.current.set(id, stored)
        return stored
      }
    } catch {
      /* ignore */
    }
    return undefined
  }, [])

  const loadOutputForProject = useCallback((id: string): string => {
    if (outputDraftsRef.current.has(id)) {
      return outputDraftsRef.current.get(id) ?? ''
    }
    try {
      const stored = localStorage.getItem(`scarper.findoc.output.${id}`)
      if (stored !== null) {
        outputDraftsRef.current.set(id, stored)
        return stored
      }
    } catch {
      /* ignore */
    }
    return ''
  }, [])

  const showProjectsLoading = useLoadingVisible(
    loadingProjects && projects.length === 0,
  )
  const showTemplatesLoading = useLoadingVisible(
    loadingTemplates && templates.length === 0,
  )

  const selectedTemplateName =
    templates.find((t) => t.id === templateId)?.name?.trim() ?? ''

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
        const next =
          prev && list.some((p) => p.id === prev) ? prev : (list[0]?.id ?? '')
        if (next && next !== prev) {
          const draft = loadPromptDraftForProject(next)
          setAdjustmentPrompt(draft ?? '')
        }
        return next
      })
    } catch {
      setProjects([])
      setProjectId('')
      setAdjustmentPrompt('')
    } finally {
      setLoadingProjects(false)
    }
  }, [loadPromptDraftForProject])

  const refreshTemplates = useCallback(async () => {
    const cached = peekFindocTemplates()
    if (cached.length > 0) {
      setTemplates(cached)
      setLoadingTemplates(false)
    } else {
      setLoadingTemplates(true)
    }
    try {
      const list = await listFindocTemplates()
      setTemplates(list)
      setTemplateId((prev) => {
        const next =
          prev && list.some((t) => t.id === prev) ? prev : (list[0]?.id ?? '')
        return next
      })
    } catch {
      setTemplates([])
      setTemplateId('')
    } finally {
      setLoadingTemplates(false)
    }
  }, [])

  useEffect(() => {
    void refreshProjects()
    void refreshTemplates()
    const onProjectsChanged = () => void refreshProjects()
    const onTemplatesChanged = () => void refreshTemplates()
    window.addEventListener('scarper:projects-changed', onProjectsChanged)
    window.addEventListener('scarper:findoc-templates-changed', onTemplatesChanged)
    return () => {
      window.removeEventListener('scarper:projects-changed', onProjectsChanged)
      window.removeEventListener(
        'scarper:findoc-templates-changed',
        onTemplatesChanged,
      )
    }
  }, [refreshProjects, refreshTemplates])

  useEffect(() => {
    if (!projectId) {
      setRecords([])
      setSelectedTaskIds([])
      return
    }
    const stale = peekProjectRecords(projectId)
    if (stale.length > 0) {
      setRecords(stale)
      setSelectedTaskIds(stale.map((r) => r.id))
    }
    let cancelled = false
    void (async () => {
      try {
        const list = await listProjectDataRecords(projectId)
        if (cancelled) return
        setRecords(list)
        setSelectedTaskIds(list.map((r) => r.id))
      } catch {
        if (!cancelled && stale.length === 0) {
          setRecords([])
          setSelectedTaskIds([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    const refreshRecords = () => {
      void (async () => {
        try {
          const list = await listProjectDataRecords(projectId)
          setRecords(list)
          setSelectedTaskIds((prev) => {
            const valid = prev.filter((id) => list.some((r) => r.id === id))
            if (valid.length > 0) return valid
            return list.map((r) => r.id)
          })
        } catch {
          /* keep current */
        }
      })()
    }
    window.addEventListener('scarper:project-records-changed', refreshRecords)
    return () =>
      window.removeEventListener(
        'scarper:project-records-changed',
        refreshRecords,
      )
  }, [projectId])

  const applyProjectContext = useCallback(
    (id: string) => {
      if (projectId && projectId !== id) {
        promptDraftsRef.current.set(projectId, adjustmentPrompt)
        outputDraftsRef.current.set(projectId, outputText)
      }
      setProjectId(id)
      if (!id) {
        setAdjustmentPrompt('')
        setOutputText('')
        setOutputRecordId(null)
        return
      }
      const draft = loadPromptDraftForProject(id)
      setAdjustmentPrompt(draft ?? '')
      setOutputText(loadOutputForProject(id))
      setOutputRecordId(null)
    },
    [
      adjustmentPrompt,
      loadPromptDraftForProject,
      loadOutputForProject,
      outputText,
      projectId,
    ],
  )

  const handleProjectChange = (id: string) => {
    applyProjectContext(id)
  }

  const handleTemplateChange = (id: string) => {
    setTemplateId(id)
    setStatus(null)
  }

  const handlePromptChange = (value: string) => {
    setAdjustmentPrompt(value)
    if (projectId) {
      promptDraftsRef.current.set(projectId, value)
    }
    setStatus(null)
  }

  const handleOutputChange = (value: string) => {
    setOutputText(value)
    if (projectId) {
      outputDraftsRef.current.set(projectId, value)
    }
    setOutputStatus(null)
  }

  const handleSave = () => {
    if (!projectId) return
    setSaving(true)
    setStatus(null)
    promptDraftsRef.current.set(projectId, adjustmentPrompt)
    try {
      localStorage.setItem(
        `scarper.findoc.draft.${projectId}`,
        adjustmentPrompt,
      )
      setStatus(t('findoc.promptSaved'))
    } catch {
      setStatus(t('findoc.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!pendingOpen) return
    const { projectId: targetProjectId, recordId } = pendingOpen
    let cancelled = false

    void (async () => {
      try {
        setOutputStatus(t('findoc.loadingFromProject'))
        if (targetProjectId !== projectId) {
          applyProjectContext(targetProjectId)
        }
        const text = await loadTaskContentForFinDoc(targetProjectId, recordId)
        if (cancelled) return
        if (!text.trim()) {
          setOutputStatus(t('findoc.recordNoBody'))
          return
        }
        setOutputText(text)
        streamingOutputRef.current = text
        setOutputRecordId(recordId)
        outputDraftsRef.current.set(targetProjectId, text)
        setOutputViewMode('preview')
        setOutputStatus(t('findoc.loadedFromProject'))
      } catch (err) {
        if (!cancelled) {
          setOutputStatus(err instanceof Error ? err.message : t('findoc.loadFailed'))
        }
      } finally {
        if (!cancelled) onPendingOpenConsumed?.()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pendingOpen, projectId, applyProjectContext, onPendingOpenConsumed])

  const handleProceed = async () => {
    if (!projectId) return
    if (selectedTaskIds.length === 0) {
      setStatus(t('findoc.selectTask'))
      return
    }
    const templateContent = getSelectedTemplateContent()
    if (!templateId || !templateContent) {
      setStatus(t('findoc.selectValidTemplate'))
      return
    }

    proceedAbortRef.current?.abort()
    const controller = new AbortController()
    proceedAbortRef.current = controller
    const previousOutput = outputText

    promptDraftsRef.current.set(projectId, adjustmentPrompt)
    setProceeding(true)
    setOutputViewMode('preview')
    setStatus(t('findoc.checkingSaved'))
    setOutputStatus(null)

    try {
      const orderedIds = records
        .map((r) => r.id)
        .filter((id) => selectedTaskIds.includes(id))

      const proceedContext: FindocProceedContext = {
        templateId,
        taskIds: orderedIds,
        adjustmentPrompt: adjustmentPrompt.trim(),
      }

      const saved = await lookupSavedFindocOutput(projectId, proceedContext)
      if (saved) {
        setOutputText(saved.editorText)
        streamingOutputRef.current = saved.editorText
        setOutputRecordId(saved.id)
        outputDraftsRef.current.set(projectId, saved.editorText)
        try {
          localStorage.setItem(
            `scarper.findoc.output.${projectId}`,
            saved.editorText,
          )
        } catch {
          /* ignore */
        }
        setStatus(null)
        setOutputStatus(t('findoc.loadedSaved'))
        return
      }

      setStatus(t('findoc.loadingTasks'))

      const texts = await Promise.all(
        orderedIds.map((id) => loadTaskContentForFinDoc(projectId, id)),
      )

      const taskContent = texts
        .map((text, index) => {
          if (!text.trim()) return ''
          return `--- Task ${index + 1} ---\n${text.trim()}`
        })
        .filter(Boolean)
        .join('\n\n')

      if (!taskContent.trim()) {
        setStatus(t('findoc.noTaskContent'))
        return
      }

      streamingOutputRef.current = ''
      setOutputText('')
      setOutputRecordId(null)
      setStatus(
        t('findoc.loadedTasks', {
          count: orderedIds.length,
          chars: taskContent.length,
        }),
      )

      const finalText = await rewriteTasksWithTemplate(
        templateContent,
        taskContent,
        {
          onDelta: (chunk) => {
            streamingOutputRef.current += chunk
            const length = streamingOutputRef.current.length
            setOutputText(streamingOutputRef.current)
            setStatus(t('findoc.aiRewriting', { chars: length }))
          },
          onRetry: () => {
            streamingOutputRef.current = ''
            setOutputText('')
            setStatus(t('findoc.retryRewrite'))
          },
        },
        controller.signal,
        outputLanguage,
        adjustmentPrompt.trim() || undefined,
      )

      setOutputText(finalText)
      streamingOutputRef.current = finalText
      outputDraftsRef.current.set(projectId, finalText)
      try {
        localStorage.setItem(
          `scarper.findoc.output.${projectId}`,
          finalText,
        )
      } catch {
        /* ignore */
      }
      setStatus(null)
      setOutputStatus(t('findoc.rewriteComplete'))
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setOutputText(previousOutput)
      streamingOutputRef.current = previousOutput
      setOutputStatus(err instanceof Error ? err.message : t('findoc.rewriteFailed'))
      setStatus(null)
    } finally {
      setProceeding(false)
      if (proceedAbortRef.current === controller) {
        proceedAbortRef.current = null
      }
    }
  }

  const handleSaveOutput = async () => {
    if (!projectId) return
    if (!outputText.trim()) {
      setOutputStatus(t('findoc.contentEmpty'))
      return
    }
    setSavingOutput(true)
    setOutputStatus(null)
    const updatingExisting = Boolean(outputRecordId)
    outputDraftsRef.current.set(projectId, outputText)
    const orderedIds = records
      .map((r) => r.id)
      .filter((id) => selectedTaskIds.includes(id))
    const proceedContext: FindocProceedContext = {
      templateId,
      taskIds: orderedIds,
      adjustmentPrompt: adjustmentPrompt.trim(),
    }
    try {
      localStorage.setItem(
        `scarper.findoc.output.${projectId}`,
        outputText,
      )
      const result = await saveFindocOutputToProject(
        projectId,
        outputText,
        outputRecordId,
        proceedContext,
      )
      setOutputRecordId(result.id)
      void listProjectDataRecords(projectId).then(setRecords)
      if (updatingExisting) {
        setOutputStatus(t('findoc.updatedHint'))
      } else {
        setOutputStatus(t('findoc.savedHint'))
      }
    } catch (err) {
      setOutputStatus(err instanceof Error ? err.message : t('findoc.saveFailed'))
    } finally {
      setSavingOutput(false)
    }
  }

  const handleExportWord = () => {
    if (!projectId) return
    if (!outputText.trim()) {
      setOutputStatus(t('findoc.exportEmpty'))
      return
    }
    setExportingWord(true)
    setOutputStatus(null)
    try {
      const projectName =
        projects.find((p) => p.id === projectId)?.name ?? 'findoc'
      const result = exportTextAsWordDocument(outputText, projectName)
      if (!result.ok) {
        setOutputStatus(t('findoc.exportEmpty'))
        return
      }
      setOutputStatus(t('findoc.downloaded', { filename: result.filename }))
    } catch {
      setOutputStatus(t('findoc.exportFailed'))
    } finally {
      setExportingWord(false)
    }
  }

  const handleSetAsTemplate = () => {
    if (!projectId) return
    outputDraftsRef.current.set(projectId, outputText)
    try {
      localStorage.setItem('scarper.findoc.template-draft', outputText)
      setOutputStatus(t('findoc.templateDraftSet'))
      onCreateTemplate?.()
    } catch {
      setOutputStatus(t('findoc.templateDraftFailed'))
    }
  }

  const updateSplitFromClientX = useCallback((clientX: number) => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const rect = workspace.getBoundingClientRect()
    if (rect.width <= 0) return
    const pct = ((clientX - rect.left) / rect.width) * 100
    setLeftPanePct(clampFindocSplitPct(pct))
  }, [])

  const handleSplitterPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      splitDragRef.current = true
      setSplitDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      updateSplitFromClientX(event.clientX)
    },
    [updateSplitFromClientX],
  )

  const handleSplitterPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!splitDragRef.current) return
      updateSplitFromClientX(event.clientX)
    },
    [updateSplitFromClientX],
  )

  const endSplitDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!splitDragRef.current) return
    splitDragRef.current = false
    setSplitDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  useEffect(() => {
    return () => {
      proceedAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!splitDragging) return
    document.body.classList.add('findoc-split-dragging')
    return () => {
      document.body.classList.remove('findoc-split-dragging')
    }
  }, [splitDragging])

  return (
    <main className="app-main findoc-page">
      <div className="findoc-shell">
        <section
          ref={workspaceRef}
          className="findoc-workspace"
          aria-label="FinDoc workspace"
          style={
            {
              '--findoc-left-pct': `${leftPanePct}%`,
            } as CSSProperties
          }
        >
          <div className="findoc-pane findoc-pane--left" aria-label="Left pane">
            <section
              className="findoc-left-toolbar"
              aria-label="Template and project selection"
            >
              <Flex wrap="wrap" gap={12} align="center" style={{ width: '100%' }}>
                <ScarperToolbarField label={t('fields.template')}>
                  <Select
                    {...scarperSelectProps()}
                    value={templateId || undefined}
                    placeholder={
                      showTemplatesLoading
                        ? t('findoc.loadingTemplates')
                        : templates.length === 0
                          ? t('findoc.noTemplates')
                          : t('findoc.selectTemplate')
                    }
                    disabled={loadingTemplates || templates.length === 0}
                    options={templates.map((t) => ({ value: t.id, label: t.name }))}
                    onChange={handleTemplateChange}
                  />
                </ScarperToolbarField>
                <Button
                  type="primary"
                  size="middle"
                  icon={<PlusOutlined />}
                  onClick={() => onCreateTemplate?.()}
                >
                  {t('findoc.new')}
                </Button>
                <ScarperToolbarField label={t('fields.project')}>
                  <Select
                    {...scarperSelectProps()}
                    value={projectId || undefined}
                    placeholder={
                      showProjectsLoading
                        ? t('findoc.loadingProjects')
                        : projects.length === 0
                          ? t('findoc.noProjects')
                          : t('findoc.selectProject')
                    }
                    disabled={loadingProjects || projects.length === 0}
                    options={projects.map((p) => ({ value: p.id, label: p.name }))}
                    onChange={handleProjectChange}
                  />
                </ScarperToolbarField>
                <ScarperToolbarField label={t('fields.task')}>
                  <DashboardTaskSelect
                    records={records}
                    selectedIds={selectedTaskIds}
                    disabled={!projectId}
                    formatLabel={(record, index) =>
                      formatFindocTaskLabel(record, index, t, locale)
                    }
                    onChange={setSelectedTaskIds}
                  />
                </ScarperToolbarField>
              </Flex>
            </section>
            <section className="findoc-left-editor" aria-label="Rewrite prompt">
              <div className="findoc-prompt-head">
                <span className="findoc-prompt-head__label">{t('fields.prompt')}</span>
                <p className="findoc-prompt-head__hint">
                  {selectedTemplateName
                    ? t('findoc.promptHintPrefix', { name: selectedTemplateName })
                    : t('findoc.promptHintNoTemplate')}
                  {t('findoc.promptHintSuffix')}
                </p>
              </div>
              <textarea
                className="findoc-editor-textarea findoc-prompt-textarea scarper-scrollbar scarper-scrollbar--editor"
                value={adjustmentPrompt}
                disabled={!projectId || proceeding}
                placeholder={
                  projectId
                    ? t('findoc.promptPlaceholder')
                    : t('findoc.selectProjectFirst')
                }
                onChange={(e) => handlePromptChange(e.target.value)}
              />
            </section>
            <footer className="findoc-pane-footer findoc-left-footer" aria-label="Actions">
              {status ? (
                <Text style={{ color: token.colorPrimary, fontSize: 13 }} role="status">
                  {status}
                </Text>
              ) : null}
              <div className="findoc-pane-footer__actions">
                <Button
                  size="middle"
                  disabled={!projectId || saving}
                  loading={saving}
                  onClick={handleSave}
                >
                  {t('findoc.save')}
                </Button>
                <Button
                  type="primary"
                  size="middle"
                  disabled={
                    !projectId ||
                    proceeding ||
                    selectedTaskIds.length === 0 ||
                    !templateId ||
                    !getSelectedTemplateContent()
                  }
                  loading={proceeding}
                  onClick={() => void handleProceed()}
                >
                  {t('findoc.proceed')}
                </Button>
              </div>
            </footer>
          </div>
          <div
            className={`findoc-splitter${splitDragging ? ' is-dragging' : ''}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            aria-valuemin={FINDOC_SPLIT_MIN_PCT}
            aria-valuemax={FINDOC_SPLIT_MAX_PCT}
            aria-valuenow={Math.round(leftPanePct)}
            tabIndex={0}
            onPointerDown={handleSplitterPointerDown}
            onPointerMove={handleSplitterPointerMove}
            onPointerUp={endSplitDrag}
            onPointerCancel={endSplitDrag}
          />
          <div className="findoc-pane findoc-pane--right" aria-label="Right pane">
            <section className="findoc-right-editor" aria-label="Output editor">
              <FinDocOutputPanel
                value={outputText}
                disabled={!projectId}
                readOnly={proceeding}
                viewMode={outputViewMode}
                placeholder={
                  projectId
                    ? t('findoc.outputPlaceholder')
                    : t('findoc.selectProjectFirst')
                }
                onChange={handleOutputChange}
              />
            </section>
            <footer className="findoc-pane-footer findoc-right-footer" aria-label="Output actions">
              {outputStatus ? (
                <Text style={{ color: token.colorPrimary, fontSize: 13 }} role="status">
                  {outputStatus}
                </Text>
              ) : null}
              <div className="findoc-pane-footer__actions">
                <Button
                  size="middle"
                  type={outputViewMode === 'preview' ? 'primary' : 'default'}
                  disabled={!projectId || proceeding}
                  onClick={() => setOutputViewMode('preview')}
                >
                  {t('findoc.preview')}
                </Button>
                <Button
                  size="middle"
                  type={outputViewMode === 'source' ? 'primary' : 'default'}
                  disabled={!projectId || proceeding}
                  onClick={() => setOutputViewMode('source')}
                >
                  {t('findoc.editSource')}
                </Button>
                <Button
                  size="middle"
                  disabled={!projectId || savingOutput || !outputText.trim()}
                  loading={savingOutput}
                  onClick={() => void handleSaveOutput()}
                >
                  {outputRecordId ? t('findoc.update') : t('findoc.save')}
                </Button>
                <Button
                  size="middle"
                  disabled={!projectId || exportingWord || !outputText.trim()}
                  loading={exportingWord}
                  onClick={handleExportWord}
                >
                  {t('findoc.exportWord')}
                </Button>
                <Button
                  type="primary"
                  size="middle"
                  disabled={!projectId || !outputText.trim()}
                  onClick={handleSetAsTemplate}
                >
                  {t('findoc.setAsTemplate')}
                </Button>
              </div>
            </footer>
          </div>
        </section>
      </div>

    </main>
  )
}
