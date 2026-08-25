import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function HomePage() {
  const navigate = useNavigate()

  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [fullName, setFullName] = useState('')
  const [enrollment, setEnrollment] = useState(null)

  const [referenceCode, setReferenceCode] = useState('')
  const [trackedEnrollment, setTrackedEnrollment] = useState(null)
  const [trackMessage, setTrackMessage] = useState('')

  const [loading, setLoading] = useState(true)
  const [tracking, setTracking] = useState(false)

  useEffect(() => {
    checkUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkUser()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function checkUser() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setUser(null)
      setRole(null)
      setFullName('')
      setEnrollment(null)
      setLoading(false)
      return
    }

    setUser(user)

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error(profileError)

      setRole(null)
      setFullName('')
      setEnrollment(null)
      setLoading(false)

      return
    }

    setRole(profile.role)
    setFullName(profile.full_name)

    if (profile.role === 'parent') {
      await loadParentEnrollment(user.id)
    } else {
      setEnrollment(null)
    }

    setLoading(false)
  }

  async function loadParentEnrollment(userId) {
    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        id,
        child_first_name,
        child_last_name,
        birth_date,
        status,
        reference_code,
        submitted_at
      `)
      .eq('parent_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error(error)
      setEnrollment(null)
      return
    }

    setEnrollment(data?.[0] ?? null)
  }

  async function handleTrackEnrollment(e) {
    e.preventDefault()

    setTrackMessage('')
    setTrackedEnrollment(null)

    const cleanedCode = referenceCode.trim().toUpperCase()

    if (!cleanedCode) {
      setTrackMessage('Enter your reference code.')
      return
    }

    setTracking(true)

    const { data, error } = await supabase.rpc('track_enrollment', {
      lookup_reference: cleanedCode,
    })

    setTracking(false)

    if (error) {
      console.error(error)

      setTrackMessage(
        'Unable to check the application right now.',
      )

      return
    }

    if (!data || data.length === 0) {
      setTrackMessage(
        'No application found with that reference code.',
      )

      return
    }

    setTrackedEnrollment(data[0])
  }

  function goToDashboard() {
    if (role === 'teacher') {
      navigate('/teacher')
      return
    }

    if (role === 'teacher_aide') {
      navigate('/teacher-aide')
      return
    }

    if (role === 'parent') {
      navigate('/')
    }
  }

  function startEnrollment() {
    if (!user) {
      navigate('/login')
      return
    }

    if (role === 'parent' && !enrollment) {
      navigate('/enroll')
      return
    }

    goToDashboard()
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error(error)
      return
    }

    setUser(null)
    setRole(null)
    setFullName('')
    setEnrollment(null)
    setTrackedEnrollment(null)
    setReferenceCode('')
    setTrackMessage('')

    navigate('/')
  }

  function formatDate(date) {
    if (!date) {
      return ''
    }

    return new Date(date).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  function getStatusMessage(status) {
    if (status === 'approved') {
      return 'Your enrollment application has been accepted.'
    }

    if (status === 'rejected') {
      return 'Your enrollment application was not accepted.'
    }

    return 'Your application is currently being reviewed.'
  }

  return (
    <div className="landing-page">
      {/* HEADER */}

      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand">
            <img
              src="/bcdc-logo.png"
              alt="Binuangan Child Development Center logo"
              className="landing-logo"
            />

            <span>Binuangan Child Development Center</span>
          </div>

          <div className="landing-nav-actions">
            {loading ? null : user ? (
              <>
                <span className="nav-user-name">
                  Hi, {fullName || 'User'}
                </span>

                <button
                  type="button"
                  className="nav-logout"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                type="button"
                className="nav-login"
                onClick={() => navigate('/login')}
              >
                Login
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* SCROLLABLE CONTENT BELOW HEADER */}

      <div className="landing-scroll">
        <main className="landing-hero">
          {/* LEFT SIDE */}

          <div className="hero-content">
            <p className="hero-label">
              Enrollment Ongoing
            </p>

            <h1>
              Every Child is a Beginning of{' '}
              <span>Something Big.</span>
            </h1>

            <p className="hero-description">
              Give your little one the best start in learning.
              <br />
              Enroll today and become part of the BCDC Family!
            </p>

            <div className="hero-actions">
              {!loading && (
                <>
                  {/* Logged out */}
                  {!user && (
                    <>
                      <button
                        type="button"
                        className="primary-cta"
                        onClick={() => navigate('/login')}
                      >
                        Start Enrollment
                      </button>

                      <button
                        type="button"
                        className="secondary-cta"
                        onClick={() => navigate('/register')}
                      >
                        Sign Up
                      </button>
                    </>
                  )}

                  {/* Parent with no application */}
                  {user &&
                    role === 'parent' &&
                    !enrollment && (
                      <button
                        type="button"
                        className="primary-cta"
                        onClick={() => navigate('/enroll')}
                      >
                        Start Enrollment
                      </button>
                    )}

                  {/* Teacher */}
                  {user && role === 'teacher' && (
                    <button
                      type="button"
                      className="primary-cta"
                      onClick={() => navigate('/teacher')}
                    >
                      Open Teacher Portal
                    </button>
                  )}

                  {/* Teacher Aide */}
                  {user && role === 'teacher_aide' && (
                    <button
                      type="button"
                      className="primary-cta"
                      onClick={() => navigate('/teacher-aide')}
                    >
                      Open Teacher Aide Portal
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* RIGHT SIDE */}

          <div className="hero-panel">
            <div className="hero-card">
              <div className="hero-card-header">
                <span>Enrollment Status</span>

                <span className="status-dot"></span>
              </div>

              {/* Loading */}

              {loading ? (
                <p>Loading...</p>
              ) : user && role === 'parent' ? (
                /* LOGGED-IN PARENT */

                enrollment ? (
                  <>
                    <div className="status-summary">
                      <span
                        className={`enrollment-status ${enrollment.status}`}
                      >
                        {enrollment.status}
                      </span>

                      <p className="status-message">
                        {getStatusMessage(
                          enrollment.status,
                        )}
                      </p>
                    </div>

                    <div className="enrollment-details">
                      <div>
                        <span>Child</span>

                        <strong>
                          {enrollment.child_first_name}{' '}
                          {enrollment.child_last_name}
                        </strong>
                      </div>

                      <div>
                        <span>Reference Code</span>

                        <strong>
                          {enrollment.reference_code}
                        </strong>
                      </div>

                      <div>
                        <span>Submitted</span>

                        <strong>
                          {formatDate(
                            enrollment.submitted_at,
                          )}
                        </strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-enrollment">
                    <h3>No application yet</h3>

                    <p>
                      You have not submitted an enrollment
                      application.
                    </p>
                  </div>
                )
              ) : (
                /* PUBLIC TRACKER */

                <div className="public-tracker">
                  {!trackedEnrollment ? (
                    <>
                      <h3>
                        Track your application
                      </h3>

                      <p>
                        Enter the reference code provided
                        after submitting your enrollment
                        application.
                      </p>

                      <form
                        className="tracker-form"
                        onSubmit={
                          handleTrackEnrollment
                        }
                      >
                        <input
                          type="text"
                          value={referenceCode}
                          onChange={(e) =>
                            setReferenceCode(
                              e.target.value,
                            )
                          }
                          placeholder="ENR-2026-ABC123"
                        />

                        <button
                          type="submit"
                          disabled={tracking}
                        >
                          {tracking
                            ? 'Checking...'
                            : 'Check Status'}
                        </button>
                      </form>

                      {trackMessage && (
                        <p className="tracker-message">
                          {trackMessage}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="tracker-result-display">
                      <span
                        className={`enrollment-status ${trackedEnrollment.status}`}
                      >
                        {trackedEnrollment.status}
                      </span>

                      <p className="status-message">
                        {getStatusMessage(
                          trackedEnrollment.status,
                        )}
                      </p>

                      <div className="enrollment-details">
                        <div>
                          <span>
                            Reference Code
                          </span>

                          <strong>
                            {
                              trackedEnrollment.reference_code
                            }
                          </strong>
                        </div>

                        <div>
                          <span>Submitted</span>

                          <strong>
                            {formatDate(
                              trackedEnrollment.submitted_at,
                            )}
                          </strong>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="track-another-button"
                        onClick={() => {
                          setTrackedEnrollment(null)
                          setReferenceCode('')
                          setTrackMessage('')
                        }}
                      >
                        Check another application
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default HomePage