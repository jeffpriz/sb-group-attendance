import type { ComponentProps, ReactNode } from 'react'

type FormPanelProps = Omit<ComponentProps<'form'>, 'className'> & {
  title: ReactNode
  description?: ReactNode
  variant?: 'create' | 'edit'
  className?: string
}

export default function FormPanel({
  title,
  description,
  variant = 'create',
  className = '',
  children,
  ...formProps
}: FormPanelProps) {
  return (
    <form
      className={`card form-panel ${variant}-panel${className ? ` ${className}` : ''}`}
      {...formProps}
    >
      <div className="form-panel-header">
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {children}
    </form>
  )
}
