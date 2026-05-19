import type { ResultsState } from '../Results/ResultsPanel'
import { ResultsPanel } from '../Results/ResultsPanel'
import { TextInputSection } from './TextInputSection'
import '../../styles/layout.css'
import './ContentSections.css'

interface ContentSectionsProps {
  resultsState: ResultsState
}

export function ContentSections({ resultsState }: ContentSectionsProps) {
  return (
    <div className="page-split content-split">
      <section className="page-col page-col--left content-col" aria-label="文字输入">
        <TextInputSection />
      </section>
      <section className="page-col page-col--right content-col" aria-label="抓取结果">
        <ResultsPanel state={resultsState} />
      </section>
    </div>
  )
}
