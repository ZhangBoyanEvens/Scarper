import { useCallback, useEffect, useRef, useState } from 'react'
import { useLoadingVisible } from '../../hooks/useLoadingVisible'
import { extractDocumentFile } from '../../services/documentExtractApi'
import { listProjects, peekProjects } from '../../services/projectService'
import {
  createProjectDataRecord,
  listProjectDataRecords,
  loadTaskContentBundle,
  loadTaskEditorText,
  peekProjectRecords,
  peekTaskEditorText,
  revertTaskEditorText,
  saveTaskEditorText,
} from '../../services/projectRecordService'
import { buildRagCorpus, mergeRagCorpora, type DashboardRagCorpus } from '../../utils/dashboardRag'
import type { Project } from '../../types/project'
import type { ProjectDataRecord } from '../../types/projectRecord'
import '../Layout/OutputLanguageSelect.css'
import '../Layout/TextInputSection.css'
import { DashboardChatDrawer } from '../dashboard/DashboardChatDrawer'
import { DashboardFileUpload } from '../dashboard/DashboardFileUpload'
import {
  NewRecordModal,
  type NewRecordModalConfirmPayload,
} from '../dashboard/NewRecordModal'
import '../dashboard/NewRecordModal.css'
import { DashboardTaskSelect } from '../dashboard/DashboardTaskSelect'
import { DashboardFindBar } from '../dashboard/DashboardFindBar'
import {
  DashboardEditor,
  type DashboardEditorHandle,
  type PendingEditProposal,
} from '../dashboard/DashboardEditor'
import '../dashboard/DashboardEditor.css'
import '../projects/ProjectPage.css'
import '../../styles/scrollbar.css'
import './DashboardPage.css'

function formatTaskLabel(record: ProjectDataRecord, index: number): string {
  if (record.title?.trim()) {
    return record.title.trim()
  }
  let when = record.uploadedAt
  try {
    when = new Date(record.uploadedAt).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    /* keep raw */
  }
  const suffix =
    record.source === 'manual'
      ? '手动'
      : `${record.resultCount} 条`
  return `#${index + 1} ${when} · ${suffix}`
}

import {
  buildMultiTaskEditorText,
  parseMultiTaskEditorText,
} from '../../utils/dashboardDocument'

function normalizeTaskSelection(
  ids: string[],
  records: ProjectDataRecord[],
): string[] {
  const valid = ids.filter((id) => records.some((r) => r.id === id))
  if (valid.length > 0) return valid
  return records[0]?.id ? [records[0].id] : []
}

function taskLabelsForIds(
  taskIds: string[],
  records: ProjectDataRecord[],
): { id: string; label: string }[] {
  return taskIds.map((id) => {
    const index = records.findIndex((r) => r.id === id)
    return {
      id,
      label:
        index >= 0 ? formatTaskLabel(records[index], index) : id.slice(0, 8),
    }
  })
}

export function DashboardPage() {
  const initialProjects = peekProjects()
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [records, setRecords] = useState<ProjectDataRecord[]>([])
  const [projectId, setProjectId] = useState(initialProjects[0]?.id ?? '')
  const [taskIds, setTaskIds] = useState<string[]>([])
  const [editorText, setEditorText] = useState('')
  const [baselineText, setBaselineText] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(
    initialProjects.length === 0,
  )
  const [loadingTask, setLoadingTask] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [pendingEdit, setPendingEdit] = useState<PendingEditProposal | null>(
    null,
  )
  const [ragCorpus, setRagCorpus] = useState<DashboardRagCorpus | null>(null)
  const [ragLoading, setRagLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creatingRecord, setCreatingRecord] = useState(false)
  const [newRecordModalOpen, setNewRecordModalOpen] = useState(false)
  const [fileUploadTaskId, setFileUploadTaskId] = useState<string | null>(null)
  const [fileExtracting, setFileExtracting] = useState(false)
  const editorRef = useRef<DashboardEditorHandle>(null)
  const showProjectsLoading = useLoadingVisible(
    loadingProjects && projects.length === 0,
  )
  const showTaskLoading = useLoadingVisible(
    loadingTask && !editorText && taskIds.length > 0,
  )
  const multiTaskMode = taskIds.length > 1
  const taskSelectionKey = taskIds.join(',')
  const showFileUpload =
    taskIds.length === 1
    && fileUploadTaskId !== null
    && taskIds[0] === fileUploadTaskId
  const activeRecordName =
    taskIds.length === 1
      ? records.find((r) => r.id === taskIds[0])?.title?.trim()
      : undefined

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
      setTaskIds([])
      return
    }
    const stale = peekProjectRecords(projectId)
    if (stale.length > 0) {
      setRecords(stale)
      setTaskIds((prev) => normalizeTaskSelection(prev, stale))
    }
    let cancelled = false
    void (async () => {
      try {
        const list = await listProjectDataRecords(projectId)
        if (cancelled) return
        setRecords(list)
        setTaskIds((prev) => normalizeTaskSelection(prev, list))
      } catch {
        if (!cancelled && stale.length === 0) {
          setRecords([])
          setTaskIds([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    const onRecordsChanged = () => {
      if (!projectId) return
      void listProjectDataRecords(projectId)
        .then((list) => setRecords(list))
        .catch(() => {})
    }
    window.addEventListener('scarper:project-records-changed', onRecordsChanged)
    return () =>
      window.removeEventListener(
        'scarper:project-records-changed',
        onRecordsChanged,
      )
  }, [projectId])

  useEffect(() => {
    if (!projectId || taskIds.length === 0) {
      setEditorText('')
      setBaselineText('')
      setPendingEdit(null)
      return
    }
    setPendingEdit(null)

    if (taskIds.length === 1) {
      const taskId = taskIds[0]
      const preview = peekTaskEditorText(projectId, taskId)
      if (preview) {
        setEditorText(preview)
        setBaselineText(preview)
        setLoadingTask(false)
      }

      let cancelled = false
      if (!preview) setLoadingTask(true)
      setStatus(null)
      void (async () => {
        try {
          const text = await loadTaskEditorText(projectId, taskId)
          if (cancelled) return
          setEditorText(text)
          setBaselineText(text)
        } catch (err) {
          if (!cancelled && !preview) {
            setEditorText('')
            setBaselineText('')
            setStatus(err instanceof Error ? err.message : '加载失败')
          }
        } finally {
          if (!cancelled) setLoadingTask(false)
        }
      })()
      return () => {
        cancelled = true
      }
    }

    const previews = taskIds
      .map((id) => {
        const index = records.findIndex((r) => r.id === id)
        const label =
          index >= 0 ? formatTaskLabel(records[index], index) : id.slice(0, 8)
        return { id, label, text: peekTaskEditorText(projectId, id) }
      })
      .filter((part) => part.text)

    if (previews.length === taskIds.length) {
      const merged = buildMultiTaskEditorText(
        previews.map(({ label, text }) => ({ label, text })),
      )
      setEditorText(merged)
      setBaselineText(merged)
      setLoadingTask(false)
    }

    let cancelled = false
    if (previews.length < taskIds.length) setLoadingTask(true)
    setStatus(null)
    void (async () => {
      try {
        const parts = await Promise.all(
          taskIds.map(async (id) => {
            const index = records.findIndex((r) => r.id === id)
            const label =
              index >= 0 ? formatTaskLabel(records[index], index) : id.slice(0, 8)
            const text = await loadTaskEditorText(projectId, id)
            return { label, text }
          }),
        )
        if (cancelled) return
        const merged = buildMultiTaskEditorText(parts)
        setEditorText(merged)
        setBaselineText(merged)
      } catch (err) {
        if (!cancelled && previews.length < taskIds.length) {
          setEditorText('')
          setBaselineText('')
          setStatus(err instanceof Error ? err.message : '加载失败')
        }
      } finally {
        if (!cancelled) setLoadingTask(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, taskSelectionKey, records])

  const handleProjectChange = (id: string) => {
    setProjectId(id)
    setTaskIds([])
    setFileUploadTaskId(null)
    setStatus(null)
    setPendingEdit(null)
  }

  const dirty = editorText !== baselineText

  const handleProposeEdit = useCallback(
    (proposal: { revision: string; note: string; originalText: string }) => {
      setPendingEdit({
        originalText: proposal.originalText,
        proposedText: proposal.revision,
        note: proposal.note,
      })
      setStatus('请查看标黄修改，确认后点击「采纳」')
    },
    [],
  )

  const handleAcceptPending = useCallback(() => {
    if (!pendingEdit) return
    setEditorText(pendingEdit.proposedText)
    setPendingEdit(null)
    setStatus('已采纳 AI 修改，可继续在 AI 助手中提出下一版修改')
  }, [pendingEdit])

  const handleRejectPending = useCallback(() => {
    setPendingEdit(null)
    setStatus('已放弃 AI 修改建议')
  }, [])

  const handleEditorChange = useCallback(
    (value: string) => {
      setEditorText(value)
      setStatus(null)
      if (pendingEdit) setPendingEdit(null)
    },
    [pendingEdit],
  )

  const projectName =
    projects.find((p) => p.id === projectId)?.name ?? ''
  const chatContextHint = (() => {
    if (!projectName || taskIds.length === 0) return projectName || ''
    const labels = taskIds
      .map((id) => {
        const index = records.findIndex((r) => r.id === id)
        return index >= 0 ? formatTaskLabel(records[index], index) : id.slice(0, 8)
      })
      .join(' · ')
    return `${projectName} · ${labels}`
  })()

  const refreshRagCorpus = useCallback(async () => {
    if (!projectId || taskIds.length === 0) {
      setRagCorpus(null)
      return
    }
    const corpora = await Promise.all(
      taskIds.map(async (id) => {
        const index = records.findIndex((r) => r.id === id)
        const label =
          index >= 0
            ? formatTaskLabel(records[index], index)
            : `Task ${id.slice(0, 8)}`
        const { results, documentText } = await loadTaskContentBundle(
          projectId,
          id,
        )
        return buildRagCorpus(results, label, documentText)
      }),
    )
    setRagCorpus(
      mergeRagCorpora(
        corpora,
        chatContextHint || `Tasks ${taskIds.length}`,
      ),
    )
  }, [projectId, taskIds, records, chatContextHint])

  useEffect(() => {
    if (!projectId || taskIds.length === 0) {
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
  }, [projectId, taskSelectionKey, refreshRagCorpus])

  const handleSave = () => {
    if (!projectId || taskIds.length === 0) {
      setStatus('请先选择 Project 和 Task')
      return
    }
    setSaving(true)
    setStatus(null)
    void (async () => {
      try {
        if (multiTaskMode) {
          const labeled = taskLabelsForIds(taskIds, records)
          const texts = parseMultiTaskEditorText(
            editorText,
            labeled.map(({ label }) => ({ label, text: '' })),
          )
          if (!texts) {
            setStatus(
              '无法保存：请保留各 Task 分段标题（=== #N … ===），或改为单选后保存',
            )
            return
          }
          await Promise.all(
            labeled.map(({ id }, index) =>
              saveTaskEditorText(projectId, id, texts[index]),
            ),
          )
          setBaselineText(editorText)
          setStatus(`已保存 ${labeled.length} 个 Task`)
        } else {
          await saveTaskEditorText(projectId, taskIds[0], editorText)
          setBaselineText(editorText)
          setStatus('已保存到数据库')
        }
        try {
          await refreshRagCorpus()
        } catch {
          /* RAG refresh optional */
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : '保存失败')
      } finally {
        setSaving(false)
      }
    })()
  }

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!projectId || taskIds.length !== 1) {
        setStatus('文件上传请选择一个 Project 和一个 Task')
        return
      }
      setFileExtracting(true)
      setStatus(null)
      setPendingEdit(null)
      try {
        const result = await extractDocumentFile(file)
        await saveTaskEditorText(projectId, taskIds[0], result.text)
        setEditorText(result.text)
        setBaselineText(result.text)
        try {
          await refreshRagCorpus()
        } catch {
          /* RAG refresh optional */
        }
        setStatus(
          `已从 ${result.filename} 提取 ${result.char_count} 字（${result.method}），已写入文字库`,
        )
      } catch (err) {
        setStatus(err instanceof Error ? err.message : '文件解析失败')
      } finally {
        setFileExtracting(false)
      }
    },
    [projectId, taskIds, refreshRagCorpus],
  )

  const handleOpenNewRecordModal = () => {
    if (!projectId) {
      setStatus('请先选择 Project')
      return
    }
    if (dirty) {
      const ok = window.confirm('当前有未保存的更改，仍要新建记录吗？')
      if (!ok) return
    }
    setNewRecordModalOpen(true)
  }

  const handleConfirmNewRecord = (payload: NewRecordModalConfirmPayload) => {
    if (!projectId) return
    setCreatingRecord(true)
    setStatus(null)
    setPendingEdit(null)
    void (async () => {
      try {
        const record = await createProjectDataRecord(projectId, {
          title: payload.name,
          initialText: '',
        })
        const list = await listProjectDataRecords(projectId)
        setRecords(list)
        setTaskIds([record.id])
        setEditorText('')
        setBaselineText('')
        setFileUploadTaskId(payload.contentMode === 'file' ? record.id : null)
        setNewRecordModalOpen(false)
        setStatus(
          payload.contentMode === 'file'
            ? '已新建记录，请上传文件或继续在下方编辑'
            : '已新建记录，可直接编辑并保存',
        )
      } catch (err) {
        setStatus(err instanceof Error ? err.message : '新建记录失败')
      } finally {
        setCreatingRecord(false)
      }
    })()
  }

  const handleCancel = () => {
    if (!projectId || taskIds.length === 0) return
    setLoadingTask(true)
    setStatus(null)
    void (async () => {
      try {
        const labeled = taskLabelsForIds(taskIds, records)
        const parts = await Promise.all(
          labeled.map(async ({ id, label }) => ({
            label,
            text: await revertTaskEditorText(projectId, id),
          })),
        )
        const text =
          parts.length === 1
            ? parts[0].text
            : buildMultiTaskEditorText(parts)
        setEditorText(text)
        setBaselineText(text)
        setPendingEdit(null)
        setStatus(
          multiTaskMode
            ? `已恢复 ${parts.length} 个 Task 的数据库内容`
            : '已恢复为数据库中的内容',
        )
      } catch (err) {
        setStatus(err instanceof Error ? err.message : '恢复失败')
      } finally {
        setLoadingTask(false)
      }
    })()
  }

  return (
    <main className="app-main dashboard-page">
      <div className="dashboard-shell">
        <div className="dashboard-panel__body">
          <div className="dashboard-main">
            <header className="dashboard-head">
              <h2 className="dashboard-head__title">Dashboard</h2>
            </header>

            <section
              className="dashboard-toolbar"
              aria-label="项目与任务选择"
            >
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
                      <option value="">加载中…</option>
                    ) : projects.length === 0 ? (
                      <option value="">暂无项目</option>
                    ) : (
                      projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <div className="dashboard-field">
                  <span className="dashboard-field__label">Task</span>
                  <DashboardTaskSelect
                    records={records}
                    selectedIds={taskIds}
                    disabled={!projectId}
                    formatLabel={formatTaskLabel}
                    onChange={(ids) => {
                      setTaskIds(ids)
                      setStatus(null)
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="dashboard-new-record-btn"
                  disabled={!projectId || creatingRecord || loadingProjects}
                  title="在当前 Project 下插入一条空白记录"
                  onClick={handleOpenNewRecordModal}
                >
                  + 新建记录
                </button>
              </div>

              <div className="dashboard-toolbar__find">
                <DashboardFindBar
                  text={editorText}
                  disabled={
                    taskIds.length === 0
                    || loadingTask
                    || showTaskLoading
                    || Boolean(pendingEdit)
                  }
                  editorRef={editorRef}
                />
              </div>

              <div className="dashboard-toolbar__actions">
                {status && (
                  <span className="dashboard-status" role="status">
                    {status}
                  </span>
                )}
                {multiTaskMode && !status && !dirty && (
                  <span className="dashboard-status dashboard-status--muted">
                    已选 {taskIds.length} 个 Task · 按分段编辑后一并保存
                  </span>
                )}
                {dirty && !status && (
                  <span className="dashboard-status dashboard-status--muted">
                    未保存的更改
                  </span>
                )}
                <button
                  type="button"
                  className="project-btn project-btn--ghost"
                  disabled={taskIds.length === 0 || loadingTask}
                  onClick={handleCancel}
                >
                  取消编辑
                </button>
                <button
                  type="button"
                  className="text-input-save"
                  disabled={taskIds.length === 0 || loadingTask || saving || !dirty}
                  onClick={handleSave}
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </section>

            <section className="dashboard-editor-section" aria-label="编辑区">
              <DashboardEditor
                ref={editorRef}
                text={editorText}
                pending={pendingEdit}
                loading={showTaskLoading}
                disabled={taskIds.length === 0}
                headerSlot={
                  showFileUpload ? (
                    <DashboardFileUpload
                      recordName={activeRecordName}
                      disabled={loadingTask || showTaskLoading || multiTaskMode}
                      uploading={fileExtracting}
                      onUpload={handleFileUpload}
                    />
                  ) : null
                }
                placeholder={
                  taskIds.length > 0
                    ? showFileUpload
                      ? '可选：在下方直接输入或粘贴文本…'
                      : multiTaskMode
                        ? '编辑多个 Task 的合并内容，保存时将分别写回各 Task…'
                        : '在此编辑选中 Task 的文本内容…'
                    : projectId
                      ? '选择 Task，或点击「+ 新建记录」开始编写'
                      : '请选择 Project 与 Task 后开始编辑'
                }
                onTextChange={handleEditorChange}
                onAcceptPending={handleAcceptPending}
                onRejectPending={handleRejectPending}
              />
            </section>
            </div>

        <NewRecordModal
          open={newRecordModalOpen}
          creating={creatingRecord}
          onClose={() => {
            if (!creatingRecord) setNewRecordModalOpen(false)
          }}
          onConfirm={handleConfirmNewRecord}
        />

        <DashboardChatDrawer
          editorContext={editorText}
          contextHint={chatContextHint}
          ragCorpus={ragCorpus}
          ragLoading={ragLoading}
          onProposeEdit={handleProposeEdit}
        />
        </div>
      </div>
    </main>
  )
}
