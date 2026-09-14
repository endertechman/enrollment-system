import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import takeAuthAttempt from '../lib/authRateLimit'
import AuthToast from './AuthToast'
import LoadingSpinner from './LoadingSpinner'

function formatRole(role) {
  if (role === 'teacher_aide') return 'Teacher Aide'
  return role ? role[0].toUpperCase() + role.slice(1) : 'Account user'
}

function AccountSettingsDialog({ user, fullName, role, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  async function updatePassword(event) {
    event.preventDefault()
    setMessage('')

    if (newPassword.length < 8) {
      setMessage('Use at least 8 characters for your new password.')
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage('The new passwords do not match.')
      return
    }

    if (currentPassword === newPassword) {
      setMessage('Choose a new password that is different from your current password.')
      return
    }

    const rateLimit = takeAuthAttempt('passwordUpdate')
    if (!rateLimit.allowed) {
      setMessage(`Too many password attempts. Please wait ${rateLimit.retryAfter} seconds.`)
      return
    }

    setSaving(true)
    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })

    if (verificationError) {
      setSaving(false)
      setMessage(verificationError.status === 429
        ? 'Too many requests. Please wait before trying again.'
        : 'Your current password is incorrect.')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)

    if (error) {
      setMessage(error.status === 429
        ? 'Too many requests. Please wait before trying again.'
        : error.message)
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setMessage('Password updated successfully.')
  }

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="account-settings-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="settings-dialog">
        <button type="button" className="settings-close" onClick={onClose} aria-label="Close account settings">
          <i className="app-icon app-icon-close" aria-hidden="true" />
        </button>

        <header>
          <span>Account</span>
          <h2 id="account-settings-title">Settings</h2>
        </header>

        <dl className="settings-account-info">
          <div><dt>Name</dt><dd>{fullName || 'User'}</dd></div>
          <div><dt>Email</dt><dd>{user.email || '—'}</dd></div>
          <div><dt>Role</dt><dd>{formatRole(role)}</dd></div>
        </dl>

        <form className="settings-password-form" onSubmit={updatePassword}>
          <div className="settings-section-heading">
            <h3>Change Password</h3>
          </div>

          <label className="settings-current-password">
            Current password
            <input type={showPasswords ? 'text' : 'password'} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          <label>
            New password
            <input type={showPasswords ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="8" autoComplete="new-password" required />
          </label>
          <label>
            Confirm new password
            <input type={showPasswords ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength="8" autoComplete="new-password" required />
          </label>

          <label className="settings-show-passwords">
            <input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />
            Show passwords
          </label>

          <button type="submit" disabled={saving}>{saving ? <LoadingSpinner label="Updating..." inline /> : 'Update Password'}</button>
        </form>
      </section>

      <AuthToast message={message} onDismiss={() => setMessage('')} />
    </div>
  )
}

export default AccountSettingsDialog
