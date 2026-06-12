import { Card } from 'antd'
import type { ReactNode } from 'react'

interface GlowPanelProps {
  title: string
  children?: ReactNode
  className?: string
  bodyClassName?: string
  headerAction?: ReactNode
}

export function GlowPanel({
  title,
  children,
  className = '',
  bodyClassName = '',
  headerAction,
}: GlowPanelProps) {
  const flushBody =
    bodyClassName.includes('panel-body--results') ||
    bodyClassName.includes('panel-body--input') ||
    bodyClassName.includes('panel-body--project')

  return (
    <Card
      className={`scarper-panel ${className}`.trim()}
      title={title}
      extra={headerAction}
      style={{ height: '100%' }}
      styles={{
        body: {
          flex: 1,
          minHeight: 0,
          overflow: flushBody ? 'hidden' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          padding: flushBody ? 0 : undefined,
        },
      }}
    >
      {children}
    </Card>
  )
}
