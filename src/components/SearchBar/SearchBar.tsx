import { type FormEvent, useCallback, useState } from 'react'
import {
  parseUrlBatch,
  URL_BATCH_SEPARATOR,
  urlValidationMessage,
} from '../../utils/urlValidation'
import '../../styles/panel.css'
import './SearchBar.css'

export interface SearchBarProps {
  onSearch?: (urls: string[]) => void
}

export function SearchBar({ onSearch }: SearchBarProps) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault()
      const msg = urlValidationMessage(value)
      if (msg) {
        setError(msg)
        return
      }
      const urls = parseUrlBatch(value)
      setError(null)
      onSearch?.(urls)
    },
    [value, onSearch],
  )

  const handleChange = (next: string) => {
    setValue(next)
    if (error) setError(urlValidationMessage(next))
  }

  return (
    <div className="search-bar">
      <form
        className={`panel-shell search-shell ${focused ? 'search-shell--focus' : ''} ${error ? 'search-shell--invalid' : ''}`}
        onSubmit={submit}
        role="search"
      >
        <label className="panel-inner search-field">
          <span className="search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path
                d="M20 20l-3.5-3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>

          <input
            type="text"
            inputMode="url"
            className="search-input"
            value={value}
            placeholder={`https://a.com${URL_BATCH_SEPARATOR}https://b.com`}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'search-error' : undefined}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />

          <button
            type="submit"
            className="search-go"
            disabled={!value.trim()}
            aria-label="抓取并分析"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12h12M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </label>
      </form>
      {error && (
        <p id="search-error" className="search-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
