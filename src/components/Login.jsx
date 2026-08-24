import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
    <div className="auth-container">
      <h1>Enrollment System</h1>
      <h2>Login</h2>

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

        <button type="submit">
          Login
        </button>
      </form>

      {message && <p>{message}</p>}

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
    </div>
  )
}

export default Login