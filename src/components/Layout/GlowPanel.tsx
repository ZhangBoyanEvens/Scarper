import type { ReactNode } from 'react'
import '../../styles/panel.css'

interface GlowPanelProps {
  title: string
  children?: ReactNode
  className?: string
  bodyClassName?: string
}

export function GlowPanel({
  title,
  children,
  className = '',
  bodyClassName = '',
}: GlowPanelProps) {
  const bodyCls = ['panel-body', bodyClassName].filter(Boolean).join(' ')
  return (
    <div className={`panel-shell ${className}`.trim()}>
      <div className="panel-inner panel-fill">
        <header className="panel-header">
          <h2>{title}</h2>
        </header>
        <div className={bodyCls}>{children}</div>
      </div>
    </div>
  )
}
