import { Input } from 'antd'
import { useCallback, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { urlValidationMessage } from '../../i18n/scrapeHelpers'
import { parseUrlBatch } from '../../utils/urlValidation'
import { UrlTaskPanel } from './UrlTaskPanel'

export interface SearchBarProps {
  layout?: 'toolbar' | 'panel'
  onSearch?: (
    urls: string[],
    options?: { aiIntegrate?: boolean },
  ) => void
}

export function SearchBar({ layout = 'toolbar', onSearch }: SearchBarProps) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(
    (nextValue?: string) => {
      const raw = nextValue ?? value
      const msg = urlValidationMessage(raw, t)
      if (msg) {
        setError(msg)
        return
      }
      const urls = parseUrlBatch(raw)
      setError(null)
      onSearch?.(urls)
    },
    [value, onSearch, t],
  )

  const handleChange = (next: string) => {
    setValue(next)
    if (error) setError(urlValidationMessage(next, t))
  }

  if (layout === 'panel') {
    return <UrlTaskPanel onSearch={onSearch} />
  }

  return (
    <div className="search-bar">
      <Input.Search
        size="large"
        value={value}
        placeholder={t('scrape.search.batchPlaceholder')}
        status={error ? 'error' : undefined}
        enterButton={t('scrape.search.button')}
        onChange={(e) => handleChange(e.target.value)}
        onSearch={(v) => submit(v)}
        onPressEnter={() => submit()}
      />
      {error ? (
        <p id="search-error" role="alert" style={{ margin: '8px 0 0', color: '#ff4d4f', fontSize: 13 }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
