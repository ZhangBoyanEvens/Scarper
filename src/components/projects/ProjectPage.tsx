import { useAuth } from '@clerk/clerk-react'
import { useCallback, useEffect, useState } from 'react'
import { isClerkConfigured } from '../../config/clerk'
import { useLoadingVisible } from '../../hooks/useLoadingVisible'
import {
  createProject,
  deleteProject,
  listProjects,
  peekProjects,
} from '../../services/projectService'
import type { Project } from '../../types/project'
import '../../styles/layout.css'
import '../Layout/TextInputSection.css'
import '../../styles/panel.css'
import { GlowPanel } from '../Layout/GlowPanel'
import { ProjectDetailRecords } from './ProjectDetailRecords'
import { ProjectStorageBar } from './ProjectStorageBar'
import { NewProjectModal } from './NewProjectModal'
import './ProjectPage.css'

interface ProjectPageContentProps {
  clerkReady: boolean
  onOpenFindocRecord?: (projectId: string, recordId: string) => void
}

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

function ProjectPageContent({
  clerkReady,
  onOpenFindocRecord,
}: ProjectPageContentProps) {
  const initial = peekProjects()
  const [projects, setProjects] = useState<Project[]>(initial)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(
    initial[0]?.id ?? null,
  )
  const [loading, setLoading] = useState(initial.length === 0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const showLoading = useLoadingVisible(loading && projects.length === 0)

  const refresh = useCallback(async () => {
    setLoadError(null)
    const cached = peekProjects()
    if (cached.length > 0) {
      setProjects(cached)
      setSelectedId((prev) =>
        prev && cached.some((p) => p.id === prev) ? prev : cached[0].id,
      )
      setLoading(false)
    }
    try {
      const list = await listProjects()
      setProjects(list)
      if (list.length > 0) {
        setSelectedId((prev) =>
          prev && list.some((p) => p.id === prev) ? prev : list[0].id,
        )
      }
    } catch (err) {
      if (cached.length === 0) {
        setProjects([])
        setLoadError(
          err instanceof Error ? err.message : '加载项目列表失败，请稍后重试',
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!clerkReady) return
    if (peekProjects().length === 0) setLoading(true)
    void refresh()
    const onChanged = () => void refresh()
    window.addEventListener('scarper:projects-changed', onChanged)
    return () => window.removeEventListener('scarper:projects-changed', onChanged)
  }, [refresh, clerkReady])

  const handleCreate = useCallback(
    async (name: string, description: string) => {
      try {
        const created = await createProject({ name, description })
        setSelectedId(created.id)
        await refresh()
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : '创建项目失败，请稍后重试',
        )
      }
    },
    [refresh],
  )

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (!window.confirm(`确定删除项目「${name}」？`)) return
      try {
        await deleteProject(id)
        setSelectedId((prev) => (prev === id ? null : prev))
        await refresh()
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : '删除项目失败，请稍后重试',
        )
      }
    },
    [refresh],
  )

  const selected = projects.find((p) => p.id === selectedId) ?? null

  const newProjectButton = (
    <button
      type="button"
      className="text-input-save project-new-btn"
      onClick={() => setModalOpen(true)}
    >
      新建 Project
    </button>
  )

  return (
    <main className="app-main project-page">
      <div className="page-split project-page-split">
        <section
          className="page-col page-col--left project-page__col"
          aria-label="项目列表"
        >
          <GlowPanel
            title="Project"
            headerAction={newProjectButton}
            bodyClassName="panel-body--project"
            className="project-panel"
          >
            <ProjectStorageBar />
            {!clerkReady || showLoading ? (
              <p className="project-empty-hint">加载项目列表…</p>
            ) : loadError ? (
              <div className="project-load-error">
                <p className="project-empty-hint project-empty-hint--error" role="alert">
                  {loadError}
                </p>
                <button
                  type="button"
                  className="project-btn project-btn--ghost"
                  onClick={() => {
                    setLoading(true)
                    void refresh()
                  }}
                >
                  重试
                </button>
              </div>
            ) : projects.length === 0 ? (
              <p className="project-empty-hint">
                还没有项目。点击右上角「新建 Project」创建第一个分组。
              </p>
            ) : (
              <ul className="project-list" aria-label="项目列表">
                {projects.map((project, index) => (
                  <li key={project.id}>
                    <div
                      className={[
                        'project-list__item',
                        selectedId === project.id ? 'project-list__item--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <button
                        type="button"
                        className="project-list__main"
                        onClick={() => setSelectedId(project.id)}
                      >
                        <span className="project-list__index">{index + 1}</span>
                        <span className="project-list__content">
                          <span className="project-list__name">{project.name}</span>
                          {project.description ? (
                            <span className="project-list__desc">{project.description}</span>
                          ) : (
                            <span className="project-list__desc project-list__desc--muted">
                              无备注
                            </span>
                          )}
                          <span className="project-list__meta">
                            更新于 {formatDate(project.updatedAt)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="project-list__delete"
                        aria-label={`删除 ${project.name}`}
                        onClick={() => handleDelete(project.id, project.name)}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </GlowPanel>
        </section>
        <section
          className="page-col page-col--right project-page__col"
          aria-label="项目详情"
        >
          <GlowPanel title="详情" bodyClassName="panel-body--project-detail" className="project-panel">
            {selected ? (
              <div className="project-detail">
                <h3 className="project-detail__name">{selected.name}</h3>
                <p className="project-detail__desc">
                  {selected.description || '暂无备注'}
                </p>
                <dl className="project-detail__meta">
                  <div>
                    <dt>创建时间</dt>
                    <dd>{formatDate(selected.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>最近更新</dt>
                    <dd>{formatDate(selected.updatedAt)}</dd>
                  </div>
                </dl>
                <ProjectDetailRecords
                  projectId={selected.id}
                  onOpenFindocRecord={onOpenFindocRecord}
                />
              </div>
            ) : (
              <p className="panel-placeholder">在左侧选择一个项目查看详情</p>
            )}
          </GlowPanel>
        </section>
      </div>

      <NewProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
      />
    </main>
  )
}

function ProjectPageWithClerk({
  onOpenFindocRecord,
}: {
  onOpenFindocRecord?: (projectId: string, recordId: string) => void
}) {
  const { isLoaded } = useAuth()
  return (
    <ProjectPageContent
      clerkReady={isLoaded}
      onOpenFindocRecord={onOpenFindocRecord}
    />
  )
}

export function ProjectPage({
  onOpenFindocRecord,
}: {
  onOpenFindocRecord?: (projectId: string, recordId: string) => void
} = {}) {
  if (!isClerkConfigured) {
    return (
      <ProjectPageContent
        clerkReady
        onOpenFindocRecord={onOpenFindocRecord}
      />
    )
  }
  return <ProjectPageWithClerk onOpenFindocRecord={onOpenFindocRecord} />
}
