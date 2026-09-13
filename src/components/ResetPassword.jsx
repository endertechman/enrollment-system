import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import takeAuthAttempt from '../lib/authRateLimit'
import AppHeader from './AppHeader'
import AuthToast from './AuthToast'
import LoadingSpinner from './LoadingSpinner'

function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [checking, setChecking] = useState(true)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || session) setRecoveryReady(true)
      setChecking(false)
    })

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setRecoveryReady(Boolean(data.session))
      setChecking(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function handlePasswordUpdate(event) {
    event.preventDefault()
    setMessage('')

    if (password.length < 8) {
      setMessage('Use at least 8 characters for your new password.')
      return
    }
    if (password !== confirmPassword) {
      setMessage('The passwords do not match.')
      return
    }

    const rateLimit = takeAuthAttempt('passwordUpdate')
    if (!rateLimit.allowed) {
      setMessage(`Too many attempts. Please wait ${rateLimit.retryAfter} seconds.`)
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (error) {
      setMessage(error.status === 429 ? 'Too many requests. Please wait before trying again.' : error.message)
      return
    }

    await supabase.auth.signOut()
    navigate('/login?reset=1', { replace: true })
  }

  return <div className="landing-page">
    <AppHeader />
    <div className="landing-scroll"><main className="recovery-page">
      <header className="recovery-heading"><h1>Choose a new password</h1><p>Create a secure password for your BCDC account.</p></header>
      <div className="auth-container recovery-card">
        {checking ? <LoadingSpinner label="Checking your reset link..." compact /> : recoveryReady ? <form className="auth-form" onSubmit={handlePasswordUpdate}>
          <div><label>New Password</label><div className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength="8" autoComplete="new-password" required /><button type="button" className="password-visibility-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}><i className={`app-icon ${showPassword ? 'app-icon-eye-alt' : 'app-icon-eye'}`} aria-hidden="true" /></button></div></div>
          <div><label>Confirm New Password</label><input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter the password again" minLength="8" autoComplete="new-password" required /></div>
          <button type="submit" disabled={saving}>{saving ? 'Updating...' : 'Update Password'}</button>
        </form> : <div className="recovery-invalid"><h2>Reset link unavailable</h2><p>This link is invalid or has expired. Request a new password reset email.</p><button type="button" className="auth-light-button" onClick={() => navigate('/login?forgot=1')}>Request New Link</button></div>}
        <AuthToast message={message} onDismiss={() => setMessage('')} />
      </div>
    </main></div>
  </div>
}

export default ResetPassword
