import type { OutputDetail } from '../../types/outputDetail'
import type { OutputLanguage } from '../../types/outputLanguage'
import { SearchBar } from '../SearchBar/SearchBar'
import { OutputLanguageSelect } from './OutputLanguageSelect'
import '../../styles/layout.css'
import './TopToolbar.css'

interface TopToolbarProps {
  outputLanguage: OutputLanguage
  outputDetail: OutputDetail
  onOutputLanguageChange: (lang: OutputLanguage) => void
  onOutputDetailChange: (detail: OutputDetail) => void
  onSearch: (urls: string[]) => void
}

export function TopToolbar({
  outputLanguage,
  outputDetail,
  onOutputLanguageChange,
  onOutputDetailChange,
  onSearch,
}: TopToolbarProps) {
  return (
    <header className="top-toolbar">
      <div className="page-split top-toolbar-split">
        <div className="page-col top-toolbar-left">
          <SearchBar onSearch={onSearch} />
        </div>
        <div className="page-col top-toolbar-right">
          <OutputLanguageSelect
            language={outputLanguage}
            detail={outputDetail}
            onLanguageChange={onOutputLanguageChange}
            onDetailChange={onOutputDetailChange}
          />
        </div>
      </div>
    </header>
  )
}
