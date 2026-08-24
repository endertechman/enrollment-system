import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function Register() {
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function handleRegister(e) {
    e.preventDefault()
    setMessage('')

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,

      options: {
        data: {
          full_name: fullName.trim(),
        },
      },
    })

    if (error) {
      if (error) {
        if (error.message === 'User already registered') {
          setMessage('This email is already registered.')
        } else {
          setMessage(error.message)
        }

        return
      }
      return
    }

    setMessage('Registration successful!')

    setTimeout(() => {
      navigate('/login')
    }, 1000)
  }

  return (
    <div className="auth-container">
      <h1>Enrollment System</h1>
      <h2>Register</h2>

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
            placeholder="Enter your full name"
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
            required
          />
        </div>

        <div>
          <label>Password</label>

          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            placeholder="Enter your password"
            required
          />
        </div>

        <button type="submit">
          Register
        </button>
      </form>

      {message && <p>{message}</p>}

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
    </div>
  )
}

export default Register