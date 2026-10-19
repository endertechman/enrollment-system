import { useEffect, useRef, useState } from 'react'

// Typed-confirmation dialog for permanently deleting an account. The delete button stays
// disabled until the teacher types the account's email exactly, and the database checks it again.
function DeleteAccountDialog({ summary, busy = false, error = '', onConfirm, onCancel }) {
  const [typedEmail, setTypedEmail] = useState('')
  const inputRef = useRef(null)
  const matches = typedEmail.trim().toLowerCase() === String(summary.email || '').toLowerCase()
  const children = Number(summary.enrollment_count)

  useEffect(() => {
    inputRef.current?.focus()
    function closeOnEscape(event) { if (event.key === 'Escape' && !busy) onCancel() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [busy, onCancel])

  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <section className="confirm-dialog delete-account-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-details">
        <div className="confirm-dialog-icon danger" aria-hidden="true"><i className="app-icon app-icon-trash" /></div>
        <div>
          <span className="confirm-dialog-label">Permanent action</span>
          <h2 id="delete-account-title">Delete this account?</h2>
          <div id="delete-account-details">
            <p><strong>{summary.full_name}</strong> ({summary.email}) will no longer be able to sign in, and this cannot be undone.</p>
            {summary.account_role === 'parent' ? (
              <ul className="delete-account-list">
                <li><strong>{children}</strong> child enrollment {children === 1 ? 'record' : 'records'}</li>
                <li><strong>{Number(summary.attendance_count)}</strong> attendance {Number(summary.attendance_count) === 1 ? 'entry' : 'entries'}</li>
                <li><strong>{Number(summary.growth_count)}</strong> health &amp; growth {Number(summary.growth_count) === 1 ? 'record' : 'records'}</li>
                <li><strong>{Number(summary.eccd_count)}</strong> developmental {Number(summary.eccd_count) === 1 ? 'assessment' : 'assessments'}</li>
              </ul>
            ) : (
              <p>Only the account is removed. Announcements, events and records this teacher aide entered for students stay in the system.</p>
            )}
          </div>
          <label className="delete-account-confirm">
            <span>Type <strong>{summary.email}</strong> to confirm</span>
            <input ref={inputRef} type="text" value={typedEmail} onChange={(event) => setTypedEmail(event.target.value)} disabled={busy} autoComplete="off" spellCheck="false" aria-label="Type the account email to confirm deletion" />
          </label>
          {error && <p className="delete-account-error" role="alert">{error}</p>}
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="confirm-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="confirm-action danger" onClick={() => onConfirm(typedEmail.trim())} disabled={busy || !matches}>{busy ? 'Deleting...' : 'Delete permanently'}</button>
        </div>
      </section>
    </div>
  )
}

export default DeleteAccountDialog
