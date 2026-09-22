import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import takeAuthAttempt from '../lib/authRateLimit'
import AuthToast from './AuthToast'

function formatRole(role) {
  if (role === 'teacher_aide') return 'Teacher Aide'
  return role ? role[0].toUpperCase() + role.slice(1) : 'Account user'
}

function AccountSettingsDialog({ user, fullName, role, onClose, onNameUpdated }) {
  const dialogRef = useRef(null)
  const closeButtonRef = useRef(null)
  const [currentFullName, setCurrentFullName] = useState(fullName || '')
  const [editedName, setEditedName] = useState(fullName || '')
  const [savingName, setSavingName] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [visiblePasswords, setVisiblePasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function updateName(event) {
    event.preventDefault()
    const cleanName = editedName.trim().replace(/\s+/g, ' ')
    if (cleanName.length < 2 || cleanName.length > 100) {
      setMessage('Name must be between 2 and 100 characters.')
      return
    }
    if (cleanName === currentFullName) return

    setSavingName(true)
    setMessage('')
    const { data, error } = await supabase.rpc('update_own_full_name', { p_full_name: cleanName })
    setSavingName(false)
    if (error) {
      setMessage(error.code === '42883' || error.code === 'PGRST202'
        ? 'Name editing is not available until the Supabase migration is applied.'
        : error.message)
      return
    }

    setCurrentFullName(data)
    setEditedName(data)
    onNameUpdated?.(data)
    setMessage('Name updated successfully.')
  }

  function togglePasswordVisibility(field) {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field],
    }))
  }

  useEffect(() => {
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement
    closeButtonRef.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialog) return

      const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [href], select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
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
    <div className="settings-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="account-settings-title" aria-describedby="account-settings-description">
        <header className="settings-header">
          <button ref={closeButtonRef} type="button" className="settings-close popup-close-button" onClick={onClose} aria-label="Close account settings">
            <i className="app-icon app-icon-close" aria-hidden="true" />
          </button>
          <span>Account</span>
          <h2 id="account-settings-title">Settings</h2>
          <p id="account-settings-description" className="visually-hidden">Review your account details, edit your name, and update your password.</p>
        </header>

        <div className="settings-body">
          <section className="settings-profile" aria-labelledby="settings-profile-title">
            <div className="settings-profile-icon" aria-hidden="true"><i className="app-icon app-icon-profile" /></div>
            <div className="settings-profile-copy">
              <h3 id="settings-profile-title">{currentFullName || 'User'}</h3>
              <p>{user.email || 'Email unavailable'}</p>
            </div>
            <dl><div><dt>Account role</dt><dd>{formatRole(role)}</dd></div></dl>
            <p className="settings-profile-note">Your email is fixed. Name changes also update how your account appears in center records.</p>
          </section>

          <form className="settings-name-form" onSubmit={updateName}>
            <div className="settings-section-heading"><h3>Edit Name</h3></div>
            <label htmlFor="settings-full-name">Full name</label>
            <input id="settings-full-name" type="text" value={editedName} onChange={(event) => setEditedName(event.target.value)} maxLength={100} autoComplete="name" required />
            <button type="submit" className="settings-submit" disabled={savingName || editedName.trim().replace(/\s+/g, ' ') === currentFullName}>Save Name</button>
          </form>

          <form className="settings-password-form" onSubmit={updatePassword}>
            <div className="settings-section-heading">
              <h3>Change Password</h3>
            </div>

          <label>
            <span>Current password</span>
            <div className="settings-password-field">
              <input type={visiblePasswords.current ? 'text' : 'password'} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your current password" required />
              <button type="button" className="settings-password-toggle" onClick={() => togglePasswordVisibility('current')} aria-label={visiblePasswords.current ? 'Hide current password' : 'Show current password'} aria-pressed={visiblePasswords.current}>
                <i className={`app-icon ${visiblePasswords.current ? 'app-icon-eye-alt' : 'app-icon-eye'}`} aria-hidden="true" />
              </button>
            </div>
          </label>
          <label>
            <span>New password</span>
            <div className="settings-password-field">
              <input type={visiblePasswords.next ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="8" autoComplete="new-password" placeholder="At least 8 characters" required />
              <button type="button" className="settings-password-toggle" onClick={() => togglePasswordVisibility('next')} aria-label={visiblePasswords.next ? 'Hide new password' : 'Show new password'} aria-pressed={visiblePasswords.next}>
                <i className={`app-icon ${visiblePasswords.next ? 'app-icon-eye-alt' : 'app-icon-eye'}`} aria-hidden="true" />
              </button>
            </div>
          </label>
          <label>
            <span>Confirm new password</span>
            <div className="settings-password-field">
              <input type={visiblePasswords.confirm ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength="8" autoComplete="new-password" placeholder="Repeat your new password" required />
              <button type="button" className="settings-password-toggle" onClick={() => togglePasswordVisibility('confirm')} aria-label={visiblePasswords.confirm ? 'Hide password confirmation' : 'Show password confirmation'} aria-pressed={visiblePasswords.confirm}>
                <i className={`app-icon ${visiblePasswords.confirm ? 'app-icon-eye-alt' : 'app-icon-eye'}`} aria-hidden="true" />
              </button>
            </div>
          </label>

            <button type="submit" className="settings-submit" disabled={saving}>Update Password</button>
          </form>
        </div>
      </section>

      <AuthToast message={message} onDismiss={() => setMessage('')} />
    </div>
  )
}

export default AccountSettingsDialog
