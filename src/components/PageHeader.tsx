import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}

export default function PageHeader({
  title,
  description,
  actions,
  eyebrow = 'Springbrook groups',
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <div className="page-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <div className="page-description muted">{description}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}
