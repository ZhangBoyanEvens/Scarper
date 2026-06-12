import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { CloseOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'
import { Button, Input, Space } from 'antd'
import type { InputRef } from 'antd/es/input'
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
  const inputRef = useRef<InputRef>(null)

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
      aria-label="Find in document"
    >
      <Input
        ref={inputRef}
        size="middle"
        allowClear
        className="dashboard-find-bar__input"
        value={query}
        placeholder="Find"
        disabled={disabled}
        aria-label="Find keyword"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onInputKeyDown}
      />
      {countLabel ? (
        <span className="dashboard-find-bar__count" aria-live="polite">
          {countLabel}
        </span>
      ) : null}
      <Space size={2}>
        <Button
          type="text"
          size="small"
          className="dashboard-find-bar__nav"
          title="Previous (Shift+Enter)"
          disabled={disabled || !q || matches.length === 0}
          aria-label="Previous match"
          icon={<UpOutlined />}
          onClick={goPrev}
        />
        <Button
          type="text"
          size="small"
          className="dashboard-find-bar__nav"
          title="Next (Enter)"
          disabled={disabled || !q || matches.length === 0}
          aria-label="Next match"
          icon={<DownOutlined />}
          onClick={goNext}
        />
        {query ? (
          <Button
            type="text"
            size="small"
            className="dashboard-find-bar__clear"
            title="Clear (Esc)"
            disabled={disabled}
            aria-label="Clear find"
            icon={<CloseOutlined />}
            onClick={clear}
          />
        ) : null}
      </Space>
    </div>
  )
}
