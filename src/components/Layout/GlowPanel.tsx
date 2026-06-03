import type { ReactNode } from 'react'
import '../../styles/panel.css'

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
  const bodyCls = ['panel-body', bodyClassName].filter(Boolean).join(' ')
  const headerCls = ['panel-header', headerAction ? 'panel-header--actions' : '']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={`panel-shell ${className}`.trim()}>
      <div className="panel-inner panel-fill">
        <header className={headerCls}>
          <h2>{title}</h2>
          {headerAction}
        </header>
        <div className={bodyCls}>{children}</div>
      </div>
    </div>
  )
}
