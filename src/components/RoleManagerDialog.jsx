import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from './LoadingSpinner'
import AuthToast from './AuthToast'
import ConfirmDialog from './ConfirmDialog'

function formatRole(role) {
  if (role === 'teacher_aide') return 'Teacher Aide'
  return role ? role[0].toUpperCase() + role.slice(1) : 'Unknown'
}

function RoleManagerDialog({ onClose }) {
  const [email, setEmail] = useState('')
  const [account, setAccount] = useState(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [searching, setSearching] = useState(false)
  const [updatingRole, setUpdatingRole] = useState('')
  const [pendingRole, setPendingRole] = useState('')

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !pendingRole) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, pendingRole])

  async function findAccount(event) {
    event.preventDefault()
    const cleanEmail = email.trim()
    if (!cleanEmail) return

    setSearching(true)
    setAccount(null)
    setMessage('')
    const { data, error } = await supabase
      .rpc('find_account_by_email', { p_email: cleanEmail })
      .maybeSingle()

    if (error) setMessage(error.message)
    else if (!data) setMessage('No account was found with that exact email address.')
    else setAccount(data)
    setSearching(false)
  }

  async function changeRole() {
    const nextRole = pendingRole
    if (!account || !nextRole || updatingRole) return
    setUpdatingRole(nextRole)
    setMessage('')
    setNotice('')
    const { data, error } = await supabase
      .rpc('set_account_role', { p_user_id: account.user_id, p_role: nextRole })
      .single()

    if (error) setMessage(error.message)
    else {
      setAccount(data)
      setNotice(`Account role changed to ${formatRole(data.account_role)}.`)
    }
    setUpdatingRole('')
    setPendingRole('')
  }

  const availableRoles = account?.account_role === 'parent'
    ? [['teacher_aide', 'Make Teacher Aide'], ['teacher', 'Make Teacher']]
    : account?.account_role === 'teacher_aide'
      ? [['parent', 'Return to Parent'], ['teacher', 'Make Teacher']]
      : []

  return (
    <div className="role-manager-overlay" role="dialog" aria-modal="true" aria-labelledby="role-manager-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      {pendingRole && account && <ConfirmDialog title="Change account role?" message={`${account.full_name} will become ${formatRole(pendingRole)}.`} confirmLabel="Change Role" tone="primary" iconClass="app-icon-user-add" busy={Boolean(updatingRole)} onConfirm={changeRole} onCancel={() => setPendingRole('')} />}
      <section className="role-manager-dialog">
        <header className="role-manager-header">
          <button type="button" className="role-manager-close" onClick={onClose} aria-label="Close role manager"><i className="app-icon app-icon-close" aria-hidden="true" /></button>
          <span>Teacher tools</span>
          <h2 id="role-manager-title">Manage Account Role</h2>
          <p>Search securely using the account&apos;s exact email.</p>
        </header>

        <div className="role-manager-body">
          <form className="role-manager-search" onSubmit={findAccount}>
            <label htmlFor="role-account-email">Account email</label>
            <div><input id="role-account-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="parent@example.com" required /><button type="submit" disabled={searching}>{searching ? <LoadingSpinner label="Searching..." inline /> : 'Find Account'}</button></div>
          </form>

          {message && <p className="role-manager-message">{message}</p>}

          {account && <article className="role-manager-result">
            <div className="role-manager-account"><i className="app-icon app-icon-user-list" aria-hidden="true" /><div><span>Account</span><strong>{account.full_name}</strong></div></div>
            <div><span>Current role</span><strong>{formatRole(account.account_role)}</strong></div>
            {account.account_role === 'teacher' ? <p>Teacher accounts are protected and cannot be changed here.</p> : <div className="role-manager-actions">{availableRoles.map(([role, label]) => <button type="button" key={role} disabled={Boolean(updatingRole)} onClick={() => setPendingRole(role)}>{updatingRole === role ? <LoadingSpinner label="Updating..." inline /> : label}</button>)}</div>}
          </article>}

          <p className="role-manager-note">Teacher accounts cannot be changed or demoted here.</p>
        </div>
      </section>
    </div>
  )
}

export default RoleManagerDialog
