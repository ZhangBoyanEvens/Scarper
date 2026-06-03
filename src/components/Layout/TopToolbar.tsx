import type { OutputDetail } from '../../types/outputDetail'
import type { OutputLanguage } from '../../types/outputLanguage'
import { getOutputDetailLabel } from '../../types/outputDetail'
import { getOutputLanguageLabel } from '../../types/outputLanguage'
import { OutputLanguageSelect } from './OutputLanguageSelect'
import { TextInputSection } from './TextInputSection'
import '../../styles/layout.css'
import './TopToolbar.css'

interface TopToolbarProps {
  outputLanguage: OutputLanguage
  outputDetail: OutputDetail
  onOutputLanguageChange: (lang: OutputLanguage) => void
  onOutputDetailChange: (detail: OutputDetail) => void
}

export function TopToolbar({
  outputLanguage,
  outputDetail,
  onOutputLanguageChange,
  onOutputDetailChange,
}: TopToolbarProps) {
  return (
    <header className="top-toolbar">
      <div className="page-split top-toolbar-split">
        <div className="page-col top-toolbar-left">
          <TextInputSection layout="toolbar" />
        </div>
        <div className="page-col top-toolbar-right">
          <div className="top-toolbar-lang">
            <OutputLanguageSelect
              language={outputLanguage}
              detail={outputDetail}
              onLanguageChange={onOutputLanguageChange}
              onDetailChange={onOutputDetailChange}
            />
            <p className="top-toolbar-lang__hint" title="Synced with Settings → Language global preset">
              Global: {getOutputLanguageLabel(outputLanguage)} ·{' '}
              {getOutputDetailLabel(outputDetail)}
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
