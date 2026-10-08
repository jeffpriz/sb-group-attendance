import type { ReactNode } from 'react'

interface Props {
  kind?: 'error' | 'success' | 'info'
  children: ReactNode
  onDismiss?: () => void
}

export default function Notice({ kind = 'info', children, onDismiss }: Props) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onDismiss && (
        <button type="button" className="link-button" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  )
}
