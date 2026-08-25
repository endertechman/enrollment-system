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
      if (error.message === 'User already registered') {
        setMessage('This email is already registered.')
      } else {
        setMessage(error.message)
      }

      return
    }

    setMessage('Registration successful!')

    setTimeout(() => {
      navigate('/login')
    }, 1000)
  }

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div
            className="landing-brand"
            onClick={() => navigate('/')}
            style={{ cursor: 'pointer' }}
          >
            <img
              src="/bcdc-logo.png"
              alt="Binuangan Child Development Center logo"
              className="landing-logo"
            />

            <span>Binuangan Child Development Center</span>
          </div>

          <div className="landing-nav-actions">
            <button
              className="nav-login"
              onClick={() => navigate('/')}
            >
              Home
            </button>
          </div>
        </div>
      </nav>

      <div className="landing-scroll">
        <main className="register-page">
          <header className="register-heading">
            <h1>Register your account</h1>
            <p>
              Follow your child’s journey, register your BCDC account.
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

                <button type="submit">
                  Register
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

export default Register
