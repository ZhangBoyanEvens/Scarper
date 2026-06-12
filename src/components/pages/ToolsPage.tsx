import { ArrowRightOutlined } from '@ant-design/icons'
import { Card, Col, Row, Typography } from 'antd'
import { useEffect, useMemo } from 'react'
import { isClerkConfigured } from '../../config/clerk'
import { useI18n } from '../../contexts/I18nContext'
import { prefetchVetraTemplateWorkspace } from '../vetra/vetraTemplateWorkspaceCache'
import { prefetchVetraWorkspace } from '../vetra/vetraWorkspaceCache'
import scrapeIllustration from '../../assets/Scrape.svg'
import findocIllustration from '../../assets/Findoc.svg'
import templateIllustration from '../../assets/Template.svg'
import ragChatIllustration from '../../assets/RAG Chat.svg'
import vetraIllustration from '../../assets/Vetra.svg'
import './ToolsPage.css'

const { Paragraph, Text } = Typography

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
    <Card
      hoverable
      onClick={onClick}
      style={{ height: '100%', cursor: 'pointer' }}
      styles={{ body: { padding: 16 } }}
    >
      <img
        src={imageSrc}
        alt={title}
        width={320}
        height={148}
        decoding="async"
        className="tools-page__card-image"
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Text strong style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>
            {title}
          </Text>
          <Paragraph
            type="secondary"
            style={{ marginBottom: 0, fontSize: 13, lineHeight: 1.55 }}
          >
            {description}
          </Paragraph>
        </div>
        <ArrowRightOutlined style={{ color: 'rgba(0,0,0,0.25)', marginTop: 4 }} />
      </div>
    </Card>
  )
}

const TOOL_KEYS = [
  'scrape',
  'findoc',
  'templates',
  'rag',
  'vetra',
] as const

const TOOL_IMAGES: Record<(typeof TOOL_KEYS)[number], string> = {
  scrape: scrapeIllustration,
  findoc: findocIllustration,
  templates: templateIllustration,
  rag: ragChatIllustration,
  vetra: vetraIllustration,
}

export function ToolsPage({
  onOpenScrape,
  onOpenFindoc,
  onOpenTemplates,
  onOpenRagChat,
  onOpenVetra,
}: ToolsPageProps) {
  const { t } = useI18n()

  const tools = useMemo(
    () =>
      TOOL_KEYS.map((key) => ({
        key,
        title: t(`toolsPage.${key}.title`),
        description: t(`toolsPage.${key}.description`),
        image: TOOL_IMAGES[key],
      })),
    [t],
  )

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

  const handlers: Record<string, (() => void) | undefined> = {
    scrape: onOpenScrape,
    findoc: onOpenFindoc,
    templates: onOpenTemplates,
    rag: onOpenRagChat,
    vetra: onOpenVetra,
  }

  return (
    <div className="scarper-page tools-page">
      <div className="scarper-page__inner tools-page__inner">
        <Row gutter={[16, 16]} justify="center" className="tools-page__grid">
          {tools.slice(0, 3).map((tool) => (
            <Col key={tool.key} xs={24} sm={12} md={8} className="tools-page__col">
              <ToolCard
                title={tool.title}
                description={tool.description}
                imageSrc={tool.image}
                onClick={handlers[tool.key]}
              />
            </Col>
          ))}
        </Row>
        <Row gutter={[16, 16]} justify="center" className="tools-page__grid">
          {tools.slice(3).map((tool) => (
            <Col key={tool.key} xs={24} sm={12} md={8} className="tools-page__col">
              <ToolCard
                title={tool.title}
                description={tool.description}
                imageSrc={tool.image}
                onClick={handlers[tool.key]}
              />
            </Col>
          ))}
        </Row>
      </div>
    </div>
  )
}
