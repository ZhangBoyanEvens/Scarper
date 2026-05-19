import {
  DEFAULT_OUTPUT_DETAIL,
  OUTPUT_DETAIL_OPTIONS,
  type OutputDetail,
} from '../../types/outputDetail'
import {
  DEFAULT_OUTPUT_LANGUAGE,
  OUTPUT_LANGUAGE_OPTIONS,
  type OutputLanguage,
} from '../../types/outputLanguage'
import '../../styles/panel.css'
import './OutputLanguageSelect.css'

interface OutputLanguageSelectProps {
  language: OutputLanguage
  detail: OutputDetail
  onLanguageChange: (value: OutputLanguage) => void
  onDetailChange: (value: OutputDetail) => void
}

export function OutputLanguageSelect({
  language,
  detail,
  onLanguageChange,
  onDetailChange,
}: OutputLanguageSelectProps) {
  return (
    <div className="lang-select-wrap">
      <div className="panel-shell lang-select-shell">
        <div className="panel-inner lang-select-inner lang-select-inner--dual">
          <label className="lang-select-item">
       
            <select
              className="lang-select-control"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value as OutputLanguage)}
            >
              {OUTPUT_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="lang-select-item">

            <select
              className="lang-select-control"
              value={detail}
              onChange={(e) => onDetailChange(e.target.value as OutputDetail)}
            >
              {OUTPUT_DETAIL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}

export { DEFAULT_OUTPUT_LANGUAGE, DEFAULT_OUTPUT_DETAIL }
