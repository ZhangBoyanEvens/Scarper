import { Col, Row } from 'antd'
import type { ExtractResponse } from '../../types/extraction'
import type { ResultsState } from '../Results/ResultsPanel'
import { ResultsPanel } from '../Results/ResultsPanel'
import { SearchBar } from '../SearchBar/SearchBar'
import { ProjectUploadFooter } from './ProjectUploadFooter'

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
    <Row gutter={[16, 16]} className="scrape-page__row">
      <Col xs={24} lg={9} xl={8} className="scrape-page__col">
        <SearchBar layout="panel" onSearch={onSearch} />
      </Col>
      <Col xs={24} lg={15} xl={16} className="scrape-page__col scrape-page__col--stack">
        <ResultsPanel state={resultsState} onResultChange={onResultChange} />
        <ProjectUploadFooter resultsState={resultsState} />
      </Col>
    </Row>
  )
}
