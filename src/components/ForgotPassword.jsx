import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import takeAuthAttempt from '../lib/authRateLimit'
import AppHeader from './AppHeader'

function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [message, setMessage] = useState('')

  async function handleResetRequest(event) {
    event.preventDefault()
    const rateLimit = takeAuthAttempt('recovery')
    if (!rateLimit.allowed) {
      setMessage(`Please wait ${rateLimit.retryAfter} seconds before requesting another email.`)
      return
    }

    setSending(true)
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSending(false)

    if (error?.status === 429) {
      setMessage('Too many requests. Please wait before trying again.')
      return
    }

    if (error) {
      setMessage('Unable to send a reset email right now. Please try again later.')
      return
    }

    setSent(true)
    setMessage('If an account exists for that email, a password reset link has been sent.')
  }

  return <div className="landing-page">
    <AppHeader />
    <div className="landing-scroll"><main className="recovery-page">
      <header className="recovery-heading"><h1>Reset your password</h1><p>Enter your account email and we’ll send a secure reset link.</p></header>
      <div className="auth-container recovery-card">
        <form className="auth-form" onSubmit={handleResetRequest}>
          <div><label>Email</label><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your email" autoComplete="email" required /></div>
          <button type="submit" disabled={sending || sent}>{sending ? 'Sending...' : sent ? 'Email Sent' : 'Send Reset Link'}</button>
          <button type="button" className="auth-back-link" onClick={() => navigate('/login')}>Back to Login</button>
        </form>
        {message && <p>{message}</p>}
      </div>
    </main></div>
  </div>
}

export default ForgotPassword
