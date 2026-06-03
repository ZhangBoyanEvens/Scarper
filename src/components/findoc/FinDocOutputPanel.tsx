import { renderFindocRichTextToHtml } from '../../utils/findocRichText'
import '../../styles/scrollbar.css'
import './FinDocOutputPanel.css'

export type FinDocOutputViewMode = 'preview' | 'source'

export interface FinDocOutputPanelProps {
  value: string
  disabled?: boolean
  readOnly?: boolean
  placeholder?: string
  viewMode: FinDocOutputViewMode
  onChange: (value: string) => void
}

export function FinDocOutputPanel({
  value,
  disabled = false,
  readOnly = false,
  placeholder,
  viewMode,
  onChange,
}: FinDocOutputPanelProps) {
  if (viewMode === 'source') {
    return (
      <textarea
        className="findoc-editor-textarea scarper-scrollbar scarper-scrollbar--editor"
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  const html = value.trim() ? renderFindocRichTextToHtml(value) : ''

  return (
    <div
      className={`findoc-styled-output scarper-scrollbar scarper-scrollbar--editor${disabled ? ' is-disabled' : ''}`}
      aria-label="Layout preview"
    >
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="findoc-styled-output__placeholder">{placeholder}</p>
      )}
    </div>
  )
}
