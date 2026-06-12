import { useEffect } from 'react'
import { isClerkConfigured } from '../../config/clerk'
import { prefetchVetraTemplateWorkspace } from '../vetra/vetraTemplateWorkspaceCache'
import { prefetchVetraWorkspace } from '../vetra/vetraWorkspaceCache'
import scrapeIllustration from '../../assets/Scrape.svg'
import findocIllustration from '../../assets/Findoc.svg'
import templateIllustration from '../../assets/Template.svg'
import ragChatIllustration from '../../assets/RAG Chat.svg'
import vetraIllustration from '../../assets/Vetra.svg'
import '../../styles/layout.css'
import './ToolsPage.css'

export interface ToolsPageProps {
  onOpenScrape?: () => void
  onOpenFindoc?: () => void
  onOpenTemplates?: () => void
  onOpenRagChat?: () => void
  onOpenVetra?: () => void
}

interface ToolCardProps {
  title: string
  description: string
  imageSrc: string
  onClick?: () => void
}

function ToolCard({ title, description, imageSrc, onClick }: ToolCardProps) {
  return (
    <button type="button" className="tools-card" onClick={onClick}>
      <img
        src={imageSrc}
        alt=""
        className="tools-card__illus"
        width={320}
        height={200}
        decoding="async"
      />
      <div className="tools-card__footer">
        <span className="tools-card__body">
          <span className="tools-card__title">{title}</span>
          <span className="tools-card__desc">{description}</span>
        </span>
        <span className="tools-card__arrow" aria-hidden>
          →
        </span>
      </div>
    </button>
  )
}

export function ToolsPage({
  onOpenScrape,
  onOpenFindoc,
  onOpenTemplates,
  onOpenRagChat,
  onOpenVetra,
}: ToolsPageProps) {
  useEffect(() => {
    if (!isClerkConfigured) {
      void prefetchVetraWorkspace()
      return
    }

    const prefetch = () => {
      void prefetchVetraWorkspace()
      void prefetchVetraTemplateWorkspace()
    }
    window.addEventListener('scarper:auth-token-ready', prefetch)
    return () => window.removeEventListener('scarper:auth-token-ready', prefetch)
  }, [])

  return (
    <main className="app-main tools-page">
      <div className="tools-shell">
        <header className="tools-head">
          <h1 className="tools-head__title">Tools</h1>
          <p className="tools-head__desc">
            Pick a tool: web scraping, document generation, templates, or RAG chat
          </p>
        </header>
        <div className="tools-grid">
          <div className="tools-row tools-row--top">
            <ToolCard
              title="Scrape"
              description="Enter URLs to scrape pages and generate AI summaries; upload results to a Project"
              imageSrc={scrapeIllustration}
              onClick={onOpenScrape}
            />
            <ToolCard
              title="FinDoc"
              description="Merge Task content into a Template structure, rewrite with AI, and save as a document"
              imageSrc={findocIllustration}
              onClick={onOpenFindoc}
            />
            <ToolCard
              title="Templates"
              description="Create, edit, and AI-analyze FinDoc template structures; saved to the cloud"
              imageSrc={templateIllustration}
              onClick={onOpenTemplates}
            />
          </div>
          <div className="tools-row tools-row--bottom">
            <ToolCard
              title="RAG Chat"
              description="Select Task text, highlight a passage, and ask AI—answers grounded in your project data"
              imageSrc={ragChatIllustration}
              onClick={onOpenRagChat}
            />
            <ToolCard
              title="Vetra"
              description="Coming soon"
              imageSrc={vetraIllustration}
              onClick={onOpenVetra}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
