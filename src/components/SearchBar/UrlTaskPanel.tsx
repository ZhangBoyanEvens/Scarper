import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { useAppSettingsOptional } from '../../contexts/AppSettingsContext'
import {
  MAX_URLS_PER_BATCH,
  normalizeUrl,
  urlValidationMessage,
} from '../../utils/urlValidation'
import { GlowPanel } from '../Layout/GlowPanel'
import '../../styles/panel.css'
import '../Layout/TextInputSection.css'
import './SearchBar.css'

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
  const appSettings = useAppSettingsOptional()
  const defaultIntegrate =
    appSettings?.settings.scrape.defaultAiIntegrate ?? false
  const [tasks, setTasks] = useState<UrlTask[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aiIntegrate, setAiIntegrate] = useState(defaultIntegrate)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const addFromDraft = useCallback((): boolean => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setError('Enter a URL')
      return false
    }

    const msg = urlValidationMessage(trimmed)
    if (msg) {
      setError(msg)
      return false
    }

    const normalized = normalizeUrl(trimmed)
    if (!normalized) {
      setError('Enter a valid http/https URL')
      return false
    }

    if (tasks.some((t) => t.url === normalized)) {
      setError('This link is already in the task list')
      return false
    }

    if (tasks.length >= MAX_URLS_PER_BATCH) {
      setError(`You can add at most ${MAX_URLS_PER_BATCH} tasks`)
      return false
    }

    setTasks((prev) => [...prev, { id: nextTaskId(), url: normalized }])
    setDraft('')
    setError(null)
    inputRef.current?.focus()
    return true
  }, [draft, tasks])

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
      setError('Add at least one link task first')
      return
    }
    setError(null)
    onSearch?.(tasks.map((t) => t.url), {
      aiIntegrate: canIntegrate && aiIntegrate,
    })
  }, [tasks, onSearch, canIntegrate, aiIntegrate])

  const handleDraftKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addFromDraft()
    }
  }

  return (
    <GlowPanel title="URLs to scrape" bodyClassName="panel-body--input">
      <div className="url-task-panel">
        <ul
          id={listId}
          className="url-task-list"
          aria-label="Pending scrape tasks"
        >
          {tasks.length === 0 ? (
            <li className="url-task-empty">Enter a link, then press Enter or + to add a task</li>
          ) : (
            tasks.map((task, index) => (
              <li key={task.id} className="url-task-item">
                <span className="url-task-index">{index + 1}</span>
                <span className="url-task-url" title={task.url}>
                  {task.url}
                </span>
                <button
                  type="button"
                  className="url-task-remove"
                  aria-label={`Remove task ${index + 1}`}
                  onClick={() => removeTask(task.id)}
                >
                  ×
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="url-task-add-row">
          <input
            ref={inputRef}
            type="text"
            inputMode="url"
            className="url-task-input"
            value={draft}
            placeholder="https://example.com"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'url-task-error' : listId}
            onChange={(e) => {
              setDraft(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={handleDraftKeyDown}
          />
        </div>

        <div className="text-input-footer url-task-footer">
          <label
            className={`url-task-integrate${canIntegrate ? '' : ' url-task-integrate--disabled'}`}
            title={
              canIntegrate
                ? 'Merge multiple pages into one result'
                : 'Add at least 2 tasks to enable'
            }
          >
            <input
              type="checkbox"
              className="url-task-integrate__input"
              checked={aiIntegrate}
              disabled={!canIntegrate}
              onChange={(e) => setAiIntegrate(e.target.checked)}
            />
            <span className="url-task-integrate__box" aria-hidden />
            <span className="url-task-integrate__label">AI merge</span>
          </label>
          {error && (
            <span id="url-task-error" className="text-input-status" role="alert">
              {error}
            </span>
          )}
          <div className="url-task-footer__actions">
          <button
            type="button"
            className="url-task-add-btn"
            aria-label="Add task"
            title="Add task"
            onClick={() => addFromDraft()}
          >
            +
          </button>
          <button
            type="button"
            className="url-task-run-btn"
            disabled={tasks.length === 0}
            title="Scrape and analyze"
            onClick={handleRun}
          >
            <span className="url-task-run-btn__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12h11M13 7l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="url-task-run-btn__text">
              Scrape & analyze
              {tasks.length > 0 && (
                <span className="url-task-run-btn__count">{tasks.length}</span>
              )}
            </span>
          </button>
          </div>
        </div>
      </div>
    </GlowPanel>
  )
}
