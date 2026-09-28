import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import takeAuthAttempt, { startAuthCooldown } from '../lib/authRateLimit'
import AppHeader from './AppHeader'
import AuthToast from './AuthToast'

function Register() {
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [resendingConfirmation, setResendingConfirmation] = useState(false)
  const [confirmationCooldown, setConfirmationCooldown] = useState(0)

  useEffect(() => {
    if (confirmationCooldown <= 0) return undefined

    const timer = window.setTimeout(() => {
      setConfirmationCooldown((seconds) => Math.max(0, seconds - 1))
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [confirmationCooldown])

  async function handleRegister(e) {
    e.preventDefault()
    setMessage('')

    if (password.length < 8) {
      setMessage('Use at least 8 characters for your password.')
      return
    }

    const rateLimit = takeAuthAttempt('signup')
    if (!rateLimit.allowed) {
      setMessage(`Too many registration attempts. Please wait ${rateLimit.retryAfter} seconds.`)
      return
    }

    setSubmitting(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,

      options: {
        data: {
          full_name: fullName.trim(),
        },
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
      },
    })

    if (error) {
      setSubmitting(false)
      if (error.message === 'User already registered') {
        setMessage('This email is already registered.')
      } else {
        setMessage(error.message)
      }

      return
    }

    if (!data.session) {
      const pendingEmail = email.trim()
      startAuthCooldown('confirmationRetry')
      setConfirmationCooldown(60)
      setRegisteredEmail(pendingEmail)
      setSubmitting(false)
      setMessage(
        'Registration successful. Please confirm your email before logging in.',
      )
      return
    }

    navigate('/')
  }

  async function sendAnotherConfirmation() {
    const rateLimit = takeAuthAttempt('confirmationRetry')
    if (!rateLimit.allowed) {
      setConfirmationCooldown(rateLimit.retryAfter)
      setMessage(`Please wait ${rateLimit.retryAfter} seconds before requesting another email.`)
      return
    }

    setConfirmationCooldown(60)
    setResendingConfirmation(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: registeredEmail,
      options: { emailRedirectTo: `${window.location.origin}/login?confirmed=1` },
    })
    setResendingConfirmation(false)

    if (error) {
      setMessage(error.status === 429
        ? 'Too many requests. Please wait before trying again.'
        : 'Unable to request another verification email right now.')
      return
    }

    setMessage('Another verification email has been requested. Please check your inbox.')
  }

  return (
    <div className="landing-page">
      <AppHeader />

      <div className="landing-scroll">
        <main className="register-page">
          <header className="register-heading">
            <h1>Register your account</h1>
            <p>
              Register using the parent or guardian&apos;s full name. This name
              will be recorded with the child&apos;s enrollment information.
            </p>
          </header>

          <div className="auth-container register-card">
            <form
              className="auth-form"
              onSubmit={handleRegister}
            >
              <div>
                <label>Full Name</label>

                <input
                  type="text"
                  value={fullName}
                  onChange={(e) =>
                    setFullName(e.target.value)
                  }
                  placeholder="Enter the parent or guardian's full name"
                  required
                />
              </div>

              <div>
                <label>Email</label>

                <input
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
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
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    placeholder="Enter your password"
                    minLength="8"
                    autoComplete="new-password"
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

              <div className="register-actions">
                <div
                  className="auth-switch"
                  onClick={() => navigate('/login')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' ||
                      e.key === ' '
                    ) {
                      navigate('/login')
                    }
                  }}
                >
                  Already have an account?
                </div>

                <button
                  type={registeredEmail ? 'button' : 'submit'}
                  disabled={submitting}
                  onClick={registeredEmail ? () => navigate('/login') : undefined}
                >
                  {registeredEmail ? 'Done' : 'Register'}
                </button>
              </div>
            </form>

            <AuthToast message={message} onDismiss={() => setMessage('')} />
            {registeredEmail && (
              <button
                type="button"
                className="login-recovery-link"
                onClick={sendAnotherConfirmation}
                disabled={resendingConfirmation || confirmationCooldown > 0}
              >
                {confirmationCooldown > 0 ? `Resend email verification in ${confirmationCooldown}s` : 'Resend email verification now'}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Register
