import { useAppSettings } from './contexts/AppSettingsContext'
import { useScrapeSession } from './contexts/ScrapeSessionContext'
import { ContentSections } from './components/Layout/ContentSections'
import { TopToolbar } from './components/Layout/TopToolbar'

export function ScarperApp() {
  const {
    settings: { outputLanguage, outputDetail, ui },
    setOutputLanguage,
    setOutputDetail,
  } = useAppSettings()
  const { resultsState, handleSearch, handleResultChange } = useScrapeSession()

  const appMainClass = ui.compactMode ? 'app-main app-main--compact' : 'app-main'

  return (
    <>
      <TopToolbar
        outputLanguage={outputLanguage}
        outputDetail={outputDetail}
        onOutputLanguageChange={setOutputLanguage}
        onOutputDetailChange={setOutputDetail}
      />
      <main className={appMainClass}>
        <ContentSections
          resultsState={resultsState}
          onSearch={handleSearch}
          onResultChange={handleResultChange}
        />
      </main>
    </>
  )
}
