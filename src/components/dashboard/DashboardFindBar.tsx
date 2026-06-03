import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { findMatchIndices } from '../../utils/documentFind'
import type { DashboardEditorHandle } from './DashboardEditor'
import './DashboardFindBar.css'

export interface DashboardFindBarProps {
  text: string
  disabled?: boolean
  editorRef: RefObject<DashboardEditorHandle | null>
}

export function DashboardFindBar({
  text,
  disabled = false,
  editorRef,
}: DashboardFindBarProps) {
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(
    () => findMatchIndices(text, query),
    [text, query],
  )

  const q = query.trim()

  useEffect(() => {
    setMatchIndex(0)
  }, [q, text])

  const goToMatch = useCallback(
    (index: number) => {
      if (!q || matches.length === 0) return
      const safe = ((index % matches.length) + matches.length) % matches.length
      setMatchIndex(safe)
      editorRef.current?.focusMatch(matches[safe], q.length)
    },
    [q, matches, editorRef],
  )

  useEffect(() => {
    if (!q || matches.length === 0) return
    editorRef.current?.focusMatch(matches[matchIndex], q.length)
  }, [q, matches, matchIndex, editorRef])

  const goNext = useCallback(() => {
    goToMatch(matchIndex + 1)
  }, [goToMatch, matchIndex])

  const goPrev = useCallback(() => {
    goToMatch(matchIndex - 1)
  }, [goToMatch, matchIndex])

  const clear = useCallback(() => {
    setQuery('')
    setMatchIndex(0)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        if (!disabled) inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [disabled])

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) goPrev()
      else goNext()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      clear()
      inputRef.current?.blur()
    }
  }

  const countLabel =
    q && matches.length > 0
      ? `${matchIndex + 1}/${matches.length}`
      : q
        ? '0/0'
        : ''

  return (
    <div
      className={`dashboard-find-bar${disabled ? ' is-disabled' : ''}`}
      role="search"
      aria-label="在正文中查找"
    >
      <input
        ref={inputRef}
        type="search"
        className="dashboard-find-bar__input"
        value={query}
        placeholder="查找"
        disabled={disabled}
        aria-label="查找关键字"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onInputKeyDown}
      />
      {countLabel ? (
        <span className="dashboard-find-bar__count" aria-live="polite">
          {countLabel}
        </span>
      ) : null}
      <button
        type="button"
        className="dashboard-find-bar__nav"
        title="上一处 (Shift+Enter)"
        disabled={disabled || !q || matches.length === 0}
        aria-label="上一处"
        onClick={goPrev}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <path
            d="M4 10l4-4 4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="dashboard-find-bar__nav"
        title="下一处 (Enter)"
        disabled={disabled || !q || matches.length === 0}
        aria-label="下一处"
        onClick={goNext}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {query ? (
        <button
          type="button"
          className="dashboard-find-bar__clear"
          title="清除 (Esc)"
          disabled={disabled}
          aria-label="清除查找"
          onClick={clear}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
