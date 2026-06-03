import { GlowPanel } from '../Layout/GlowPanel'
import './PlaceholderPage.css'

interface PlaceholderPageProps {
  title: string
  description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <main className="app-main page-view">
      <div className="page-view-inner">
        <GlowPanel title={title} bodyClassName="page-placeholder-body">
          <p className="page-placeholder-text">{description}</p>
        </GlowPanel>
      </div>
    </main>
  )
}
