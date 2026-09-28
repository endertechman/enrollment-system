import { useEffect, useRef } from 'react'

function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'danger', iconClass = 'app-icon-trash', busy = false, onConfirm, onCancel }) {
  const confirmRef = useRef(null)

  useEffect(() => {
    confirmRef.current?.focus()

    function closeOnEscape(event) {
      if (event.key === 'Escape' && !busy) onCancel()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, onCancel])

  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
        <div className={`confirm-dialog-icon ${tone}`} aria-hidden="true"><i className={`app-icon ${iconClass}`} /></div>
        <div>
          <span className="confirm-dialog-label">Please confirm</span>
          <h2 id="confirm-dialog-title">{title}</h2>
          <p id="confirm-dialog-message">{message}</p>
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-cancel" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button ref={confirmRef} type="button" className={`confirm-action ${tone}`} onClick={onConfirm} disabled={busy}>{busy ? 'Working...' : confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}

export default ConfirmDialog
