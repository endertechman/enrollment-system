import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import takeAuthAttempt, { getAuthCooldownRemaining } from '../lib/authRateLimit'
import AppHeader from './AppHeader'
import AuthToast from './AuthToast'
import LoadingSpinner from './LoadingSpinner'

function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectParams = new URLSearchParams(window.location.hash.slice(1))
  const redirectError = redirectParams.get('error_description')
  const confirmationExpired = redirectParams.get('error_code') === 'otp_expired'
    || redirectError?.toLowerCase().includes('expired')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState(() => confirmationExpired
    ? 'The email verification link has expired.'
    : redirectError
      ? 'The email verification link is invalid.'
    : searchParams.get('confirmed') === '1'
      ? 'Email confirmed. You can now log in.'
      : searchParams.get('reset') === '1'
        ? 'Password updated. Log in with your new password.'
        : '')
  const [submitting, setSubmitting] = useState(false)
  const [showRecoveryHelp, setShowRecoveryHelp] = useState(searchParams.get('forgot') === '1')
  const [showConfirmationRetry, setShowConfirmationRetry] = useState(false)
  const [retryingConfirmation, setRetryingConfirmation] = useState(false)
  const [confirmationCooldown, setConfirmationCooldown] = useState(0)
  const [requestingRecovery, setRequestingRecovery] = useState(false)
  const [recoveryRequested, setRecoveryRequested] = useState(false)
  const [recoveryCooldown, setRecoveryCooldown] = useState(0)

  useEffect(() => {
    if (confirmationCooldown <= 0 && recoveryCooldown <= 0) return undefined

    const timer = window.setTimeout(() => {
      setConfirmationCooldown((seconds) => Math.max(0, seconds - 1))
      setRecoveryCooldown((seconds) => Math.max(0, seconds - 1))
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [confirmationCooldown, recoveryCooldown])

  async function handleLogin(e) {
    e.preventDefault()
    setMessage('')
    setShowRecoveryHelp(false)
    setShowConfirmationRetry(false)

    const rateLimit = takeAuthAttempt('login')
    if (!rateLimit.allowed) {
      setMessage(`Too many login attempts. Please wait ${rateLimit.retryAfter} seconds.`)
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setSubmitting(false)
      if (error.message.toLowerCase().includes('email not confirmed')) {
        setMessage('Confirm your email using the verification link we sent before logging in.')
        setShowConfirmationRetry(true)
        setConfirmationCooldown(getAuthCooldownRemaining('confirmationRetry'))
      } else {
        setMessage(error.status === 429 ? 'Too many requests. Please wait before trying again.' : 'Invalid email or password.')
        setShowRecoveryHelp(error.status !== 429)
      }
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('Unable to get user account.')
      setSubmitting(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError) {
      setMessage(profileError.message)
      setSubmitting(false)
      return
    }

    if (
      profile.role === 'parent' ||
      profile.role === 'teacher' ||
      profile.role === 'teacher_aide'
    ) {
      navigate('/')
    } else {
      setMessage('No valid role assigned to this account.')
      setSubmitting(false)
    }
  }

  async function sendAnotherConfirmation() {
    const trimmedEmail = email.trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setMessage('Enter the account email above, then select the verification email link again.')
      return
    }

    const rateLimit = takeAuthAttempt('confirmationRetry')
    if (!rateLimit.allowed) {
      setConfirmationCooldown(rateLimit.retryAfter)
      setMessage(`Please wait ${rateLimit.retryAfter} seconds before requesting another email.`)
      return
    }

    setConfirmationCooldown(60)
    setRetryingConfirmation(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: trimmedEmail,
      options: { emailRedirectTo: `${window.location.origin}/login?confirmed=1` },
    })
    setRetryingConfirmation(false)

    if (error) {
      setMessage(error.status === 429
        ? 'Too many requests. Please wait before trying again.'
        : 'Unable to request another verification email right now.')
      return
    }

    setMessage('If the account is awaiting confirmation, another verification email has been sent.')
  }

  async function requestPasswordReset() {
    const trimmedEmail = email.trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setMessage('Enter your account email above, then select Forgot your password again.')
      return
    }

    const rateLimit = takeAuthAttempt('recovery')
    if (!rateLimit.allowed) {
      setRecoveryRequested(true)
      setRecoveryCooldown(rateLimit.retryAfter)
      setMessage(`Please wait ${rateLimit.retryAfter} seconds before requesting another email.`)
      return
    }

    setRecoveryRequested(true)
    setRecoveryCooldown(60)
    setRequestingRecovery(true)
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setRequestingRecovery(false)

    if (error) {
      setMessage(error.status === 429
        ? 'Too many requests. Please wait before trying again.'
        : 'Unable to send a reset email right now. Please try again later.')
      return
    }

    setMessage('If an account exists for that email, a password reset link has been sent. Please check your Gmail inbox and Spam folder.')
  }

  return (
    <div className="landing-page">
      <AppHeader />

      <div className="landing-scroll">
        <main className="login-page">
          <header className="login-heading">
            <h1>Welcome</h1>
            <p>Login first to see your dashboard.</p>
          </header>

          <div className="auth-container login-card">
            <form className="auth-form" onSubmit={handleLogin}>
              <div>
                <label>Email</label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label>Password</label>

                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="password-visibility-toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    <i className={`app-icon ${showPassword ? 'app-icon-eye-alt' : 'app-icon-eye'}`} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="login-actions">
                <div
                  className="auth-switch"
                  onClick={() => navigate('/register')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      navigate('/register')
                    }
                  }}
                >
                  Don't have an account?
                </div>

                <button type="submit" disabled={submitting}>
                  {submitting ? <LoadingSpinner label="Logging in..." inline /> : 'Login'}
                </button>
              </div>
            </form>

            <AuthToast message={message} onDismiss={() => setMessage('')} />
            {showRecoveryHelp && <button type="button" className="login-recovery-link" onClick={requestPasswordReset} disabled={requestingRecovery || recoveryCooldown > 0}>{requestingRecovery ? <LoadingSpinner label="Sending..." inline /> : recoveryRequested && recoveryCooldown > 0 ? `Resend password reset in ${recoveryCooldown}s` : recoveryRequested ? 'Resend password reset now' : 'Forgot your password?'}</button>}
            {showConfirmationRetry && <button type="button" className="login-recovery-link" onClick={sendAnotherConfirmation} disabled={retryingConfirmation || confirmationCooldown > 0}>{retryingConfirmation ? <LoadingSpinner label="Sending..." inline /> : confirmationCooldown > 0 ? `Resend email verification in ${confirmationCooldown}s` : 'Resend email verification now'}</button>}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Login
