import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from './AppHeader'

function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('Unable to get user account.')
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError) {
      setMessage(profileError.message)
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
    }
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
                  required
                />
              </div>

              <div>
                <label>Password</label>

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
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

                <button type="submit">
                  Login
                </button>
              </div>
            </form>

            {message && <p>{message}</p>}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Login
