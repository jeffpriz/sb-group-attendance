import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react'

type DialogProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  closeDisabled?: boolean
}

export default function Dialog({
  open,
  title,
  description,
  children,
  onClose,
  closeDisabled = false,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) return

    const previousFocus = document.activeElement
    if (!dialog.open) dialog.showModal()
    const frame = requestAnimationFrame(() => {
      dialog.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus()
    })

    return () => {
      cancelAnimationFrame(frame)
      if (dialog.open) dialog.close()
      if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) {
        previousFocus.focus()
      }
    }
  }, [open])

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget && !closeDisabled) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        if (!closeDisabled) onClose()
      }}
      onClick={closeFromBackdrop}
    >
      <div className="dialog-surface">
        <div className="dialog-header">
          <div>
            <span className="dialog-eyebrow">Springbrook groups</span>
            <h2 id={titleId}>{title}</h2>
            {description && <p className="dialog-description">{description}</p>}
          </div>
          <button
            type="button"
            className="dialog-close icon-button"
            aria-label={`Close ${title}`}
            onClick={onClose}
            disabled={closeDisabled}
          >
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </dialog>
  )
}
