import { useAuth } from '@clerk/clerk-react'
import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  List,
  Row,
  Spin,
  Typography,
  theme,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { isClerkConfigured } from '../../config/clerk'
import { useI18n } from '../../contexts/I18nContext'
import { formatLocaleDateTime } from '../../i18n/localeFormat'
import { useLoadingVisible } from '../../hooks/useLoadingVisible'
import {
  createProject,
  deleteProject,
  listProjects,
  peekProjects,
} from '../../services/projectService'
import type { Project } from '../../types/project'
import { ProjectDetailRecords } from './ProjectDetailRecords'
import { ProjectStorageBar } from './ProjectStorageBar'
import { NewProjectModal } from './NewProjectModal'
import './ProjectPage.css'

const { Text, Paragraph } = Typography

interface ProjectPageContentProps {
  clerkReady: boolean
  onOpenFindocRecord?: (projectId: string, recordId: string) => void
}

function ProjectPageContent({
  clerkReady,
  onOpenFindocRecord,
}: ProjectPageContentProps) {
  const { t, locale } = useI18n()
  const { token } = theme.useToken()
  const initial = peekProjects()
  const [projects, setProjects] = useState<Project[]>(initial)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(
    initial[0]?.id ?? null,
  )
  const [loading, setLoading] = useState(initial.length === 0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const showLoading = useLoadingVisible(loading && projects.length === 0)

  const formatDate = (iso: string) => formatLocaleDateTime(iso, locale)

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
          err instanceof Error ? err.message : t('project.loadFailed'),
        )
      }
    } finally {
      setLoading(false)
    }
  }, [t])

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
          err instanceof Error ? err.message : t('project.createFailed'),
        )
      }
    },
    [refresh, t],
  )

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (!window.confirm(t('project.deleteConfirm', { name }))) return
      try {
        await deleteProject(id)
        setSelectedId((prev) => (prev === id ? null : prev))
        await refresh()
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : t('project.deleteFailed'),
        )
      }
    },
    [refresh, t],
  )

  const selected = projects.find((p) => p.id === selectedId) ?? null

  const listCardExtra = (
    <Button
      type="primary"
      size="small"
      icon={<PlusOutlined />}
      onClick={() => setModalOpen(true)}
    >
      {t('project.newProject')}
    </Button>
  )

  return (
    <main className="app-main project-page">
      <Row gutter={[16, 16]} className="project-page-split">
        <Col xs={24} lg={7} className="project-page__col">
          <Card
            title={t('project.title')}
            extra={listCardExtra}
            className="project-panel project-panel--list"
            styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', minHeight: 0 } }}
          >
            <ProjectStorageBar />
            {!clerkReady || showLoading ? (
              <div className="project-page__center">
                <Spin tip={t('project.loading')} />
              </div>
            ) : loadError ? (
              <div className="project-page__center project-page__center--stack">
                <Text type="danger">{loadError}</Text>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    setLoading(true)
                    void refresh()
                  }}
                >
                  {t('project.retry')}
                </Button>
              </div>
            ) : projects.length === 0 ? (
              <Empty
                className="project-page__empty"
                description={t('project.emptyList')}
              />
            ) : (
              <List
                className="project-list"
                dataSource={projects}
                renderItem={(project, index) => {
                  const active = selectedId === project.id
                  return (
                    <List.Item
                      className={`project-list__item${active ? ' project-list__item--active' : ''}`}
                      style={{
                        cursor: 'pointer',
                        ...(active
                          ? {
                              background: token.colorPrimaryBg,
                              borderInlineStart: `3px solid ${token.colorPrimary}`,
                            }
                          : undefined),
                      }}
                      onClick={() => setSelectedId(project.id)}
                    >
                      <List.Item.Meta
                        avatar={
                          <Avatar
                            size="small"
                            style={{
                              backgroundColor: active
                                ? token.colorPrimary
                                : token.colorFillSecondary,
                              color: active ? '#fff' : token.colorTextSecondary,
                            }}
                          >
                            {index + 1}
                          </Avatar>
                        }
                        title={project.name}
                        description={
                          <>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {project.description || t('project.noNotes')}
                            </Text>
                            <br />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {t('project.updated', {
                                date: formatDate(project.updatedAt),
                              })}
                            </Text>
                          </>
                        }
                      />
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label={t('project.deleteProject', { name: project.name })}
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleDelete(project.id, project.name)
                        }}
                      />
                    </List.Item>
                  )
                }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={17} className="project-page__col">
          <Card title={t('project.details')} className="project-panel project-panel--detail">
            {selected ? (
              <>
                <Typography.Title level={4} style={{ marginTop: 0 }}>
                  {selected.name}
                </Typography.Title>
                <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                  {selected.description || t('project.noNotes')}
                </Paragraph>
                <Descriptions
                  column={{ xs: 1, sm: 2 }}
                  size="small"
                  items={[
                    {
                      key: 'created',
                      label: t('project.created'),
                      children: formatDate(selected.createdAt),
                    },
                    {
                      key: 'updated',
                      label: t('project.lastUpdated'),
                      children: formatDate(selected.updatedAt),
                    },
                  ]}
                />
                <ProjectDetailRecords
                  projectId={selected.id}
                  onOpenFindocRecord={onOpenFindocRecord}
                />
              </>
            ) : (
              <Empty description={t('project.selectHint')} />
            )}
          </Card>
        </Col>
      </Row>

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
