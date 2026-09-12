import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import takeAuthAttempt from '../lib/authRateLimit'
import AppHeader from './AppHeader'

function Register() {
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')

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
      setRegisteredEmail(email.trim())
      setSubmitting(false)
      setMessage(
        'Registration successful. Please confirm your email before logging in.',
      )
      return
    }

    navigate('/')
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
                  {submitting ? 'Creating Account...' : registeredEmail ? 'Done' : 'Register'}
                </button>
              </div>
            </form>

            {message && (registeredEmail
              ? <p>Registration successful. Please confirm your <a className="auth-email-link" href="https://gmail.com" target="_blank" rel="noreferrer">email</a> before logging in.</p>
              : <p>{message}</p>)}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Register
