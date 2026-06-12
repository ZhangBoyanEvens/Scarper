import { useAppSettings } from './contexts/AppSettingsContext'
import { useScrapeSession } from './contexts/ScrapeSessionContext'
import { ContentSections } from './components/Layout/ContentSections'
import { TopToolbar } from './components/Layout/TopToolbar'
import './components/pages/ScrapePage.css'

export function ScarperApp() {
  const {
    settings: { outputLanguage, outputDetail },
    setOutputLanguage,
    setOutputDetail,
  } = useAppSettings()
  const { resultsState, handleSearch, handleResultChange } = useScrapeSession()

  return (
    <div className="scrape-page">
      <TopToolbar
        outputLanguage={outputLanguage}
        outputDetail={outputDetail}
        onOutputLanguageChange={setOutputLanguage}
        onOutputDetailChange={setOutputDetail}
      />
      <div className="scrape-page__body">
        <ContentSections
          resultsState={resultsState}
          onSearch={handleSearch}
          onResultChange={handleResultChange}
        />
      </div>
    </div>
  )
}
