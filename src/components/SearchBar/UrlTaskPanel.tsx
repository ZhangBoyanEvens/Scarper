import {
  DeleteOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import {
  Button,
  Checkbox,
  Empty,
  Flex,
  Input,
  List,
  Space,
  Tag,
  Typography,
} from 'antd'
import type { InputRef } from 'antd/es/input'
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useAppSettingsOptional } from '../../contexts/AppSettingsContext'
import { useI18n } from '../../contexts/I18nContext'
import { urlValidationMessage } from '../../i18n/scrapeHelpers'
import { MAX_URLS_PER_BATCH, normalizeUrl } from '../../utils/urlValidation'
import { GlowPanel } from '../Layout/GlowPanel'
import './SearchBar.css'

const { Text } = Typography

export interface UrlTask {
  id: string
  url: string
}

export interface UrlTaskSearchOptions {
  aiIntegrate: boolean
}

export interface UrlTaskPanelProps {
  onSearch?: (urls: string[], options: UrlTaskSearchOptions) => void
}

function nextTaskId(): string {
  return crypto.randomUUID()
}

export function UrlTaskPanel({ onSearch }: UrlTaskPanelProps) {
  const { t } = useI18n()
  const appSettings = useAppSettingsOptional()
  const defaultIntegrate =
    appSettings?.settings.scrape.defaultAiIntegrate ?? false
  const [tasks, setTasks] = useState<UrlTask[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aiIntegrate, setAiIntegrate] = useState(defaultIntegrate)
  const inputRef = useRef<InputRef>(null)
  const listId = useId()

  const addFromDraft = useCallback((): boolean => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setError(t('scrape.validation.enterUrl'))
      return false
    }

    const msg = urlValidationMessage(trimmed, t)
    if (msg) {
      setError(msg)
      return false
    }

    const normalized = normalizeUrl(trimmed)
    if (!normalized) {
      setError(t('scrape.validation.invalidUrl'))
      return false
    }

    if (tasks.some((task) => task.url === normalized)) {
      setError(t('scrape.urlTask.duplicateLink'))
      return false
    }

    if (tasks.length >= MAX_URLS_PER_BATCH) {
      setError(t('scrape.urlTask.maxTasks', { max: MAX_URLS_PER_BATCH }))
      return false
    }

    setTasks((prev) => [...prev, { id: nextTaskId(), url: normalized }])
    setDraft('')
    setError(null)
    inputRef.current?.focus()
    return true
  }, [draft, tasks, t])

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
    setError(null)
  }, [])

  const canIntegrate = tasks.length > 1

  useEffect(() => {
    if (!canIntegrate && aiIntegrate) {
      setAiIntegrate(false)
    }
  }, [canIntegrate, aiIntegrate])

  const handleRun = useCallback(() => {
    if (tasks.length === 0) {
      setError(t('scrape.urlTask.addFirst'))
      return
    }
    setError(null)
    onSearch?.(tasks.map((t) => t.url), {
      aiIntegrate: canIntegrate && aiIntegrate,
    })
  }, [tasks, onSearch, canIntegrate, aiIntegrate, t])

  const handleDraftKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addFromDraft()
    }
  }

  return (
    <GlowPanel title={t('scrape.urlTask.title')} bodyClassName="panel-body--input">
      <div className="url-task-panel">
        <div id={listId} className="url-task-list" aria-label={t('scrape.urlTask.pendingAria')}>
          {tasks.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('scrape.urlTask.emptyDesc')}
              style={{ margin: '24px 0' }}
            />
          ) : (
            <List
              size="small"
              dataSource={tasks}
              renderItem={(task, index) => (
                <List.Item
                  className="url-task-item"
                  actions={[
                    <Button
                      key="remove"
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={t('scrape.urlTask.removeTask', { n: index + 1 })}
                      onClick={() => removeTask(task.id)}
                    />,
                  ]}
                >
                  <Space size={8} align="start">
                    <Tag color="blue">{index + 1}</Tag>
                    <Text style={{ wordBreak: 'break-all' }}>{task.url}</Text>
                  </Space>
                </List.Item>
              )}
            />
          )}
        </div>

        <div className="url-task-add-row">
          <Input
            ref={inputRef}
            size="middle"
            inputMode="url"
            value={draft}
            placeholder={t('scrape.urlTask.urlPlaceholder')}
            spellCheck={false}
            status={error ? 'error' : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'url-task-error' : listId}
            onChange={(e) => {
              setDraft(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={handleDraftKeyDown}
          />
        </div>

        <Flex
          className="url-task-footer"
          align="center"
          justify="space-between"
          gap={8}
          wrap="wrap"
        >
          <Checkbox
            checked={aiIntegrate}
            disabled={!canIntegrate}
            onChange={(e) => setAiIntegrate(e.target.checked)}
          >
            {t('scrape.aiMerge')}
          </Checkbox>
          {error ? (
            <Text type="danger" id="url-task-error" style={{ fontSize: 12 }}>
              {error}
            </Text>
          ) : null}
          <Space size={8} wrap>
            <Button
              icon={<PlusOutlined />}
              aria-label={t('scrape.urlTask.addAria')}
              onClick={() => addFromDraft()}
            >
              {t('scrape.urlTask.add')}
            </Button>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              disabled={tasks.length === 0}
              onClick={handleRun}
            >
              {tasks.length > 0
                ? t('scrape.urlTask.scrapeAnalyzeCount', { count: tasks.length })
                : t('scrape.urlTask.scrapeAnalyze')}
            </Button>
          </Space>
        </Flex>
      </div>
    </GlowPanel>
  )
}
