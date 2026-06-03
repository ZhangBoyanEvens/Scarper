import type { ExtractResponse } from '../../types/extraction'
import type { ResultsState } from '../Results/ResultsPanel'
import { ResultsPanel } from '../Results/ResultsPanel'
import { SearchBar } from '../SearchBar/SearchBar'
import { ProjectUploadFooter } from './ProjectUploadFooter'
import '../../styles/layout.css'
import './ContentSections.css'

interface ContentSectionsProps {
  resultsState: ResultsState
  onSearch: (
    urls: string[],
    options?: { aiIntegrate?: boolean },
  ) => void
  onResultChange?: (index: number, item: ExtractResponse) => void
}

export function ContentSections({
  resultsState,
  onSearch,
  onResultChange,
}: ContentSectionsProps) {
  return (
    <div className="scrape-layout">
      <div className="page-split content-split scrape-layout__main">
        <section
          className="page-col page-col--left content-col content-col--links"
          aria-label="URL input"
        >
          <SearchBar layout="panel" onSearch={onSearch} />
        </section>
        <section
          className="page-col page-col--right content-col content-col--stacked"
          aria-label="Scrape results"
        >
          <div className="content-col__results">
            <ResultsPanel
              state={resultsState}
              onResultChange={onResultChange}
            />
          </div>
          <ProjectUploadFooter resultsState={resultsState} />
        </section>
      </div>
    </div>
  )
}
