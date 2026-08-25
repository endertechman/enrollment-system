import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function TeacherDashboard() {
  const navigate = useNavigate()

  const [enrollments, setEnrollments] = useState([])
  const [teacherName, setTeacherName] = useState('Teacher')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState(null)
  const [isDraggingTabs, setIsDraggingTabs] = useState(false)
  const tabsRef = useRef(null)
  const tabDrag = useRef({ startX: 0, scrollLeft: 0 })

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      navigate('/login')
      return
    }

    const [profileResult, enrollmentResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single(),
      supabase
        .from('enrollments')
        .select('*')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false }),
    ])

    if (profileResult.error) {
      setMessage(profileResult.error.message)
    } else if (profileResult.data?.full_name) {
      setTeacherName(profileResult.data.full_name)
    }

    if (enrollmentResult.error) {
      setMessage(enrollmentResult.error.message)
    } else {
      setEnrollments(enrollmentResult.data || [])
    }

    setLoading(false)
  }

  async function updateStatus(id, status) {
    setMessage('')
    setReviewingId(id)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('You must be logged in.')
      setReviewingId(null)
      return
    }

    const { error } = await supabase
      .from('enrollments')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      setReviewingId(null)
      return
    }

    setEnrollments((current) =>
      current.filter((enrollment) => enrollment.id !== id),
    )
    setMessage(`Enrollment ${status}.`)
    setReviewingId(null)
  }

  function getChildName(enrollment) {
    return [
      enrollment.child_first_name,
      enrollment.child_middle_name,
      enrollment.child_last_name,
      enrollment.child_suffix,
    ]
      .filter(Boolean)
      .join(' ')
  }

  function calculateAge(birthDate) {
    if (!birthDate) return '—'

    const today = new Date()
    const birth = new Date(`${birthDate}T00:00:00`)
    let age = today.getFullYear() - birth.getFullYear()
    const monthDifference = today.getMonth() - birth.getMonth()

    if (
      monthDifference < 0 ||
      (monthDifference === 0 && today.getDate() < birth.getDate())
    ) {
      age -= 1
    }

    return age
  }

  function formatSex(sex) {
    if (!sex) return 'Not specified'
    return sex.charAt(0).toUpperCase() + sex.slice(1)
  }

  function calculateBmi(heightCm, weightKg) {
    const height = Number(heightCm)
    const weight = Number(weightKg)

    if (!height || !weight || height <= 0 || weight <= 0) {
      return '—'
    }

    const heightInMeters = height / 100
    return (weight / heightInMeters ** 2).toFixed(1)
  }

  function startTabDrag(event) {
    if (!tabsRef.current) return

    setIsDraggingTabs(true)
    tabDrag.current = {
      startX: event.pageX,
      scrollLeft: tabsRef.current.scrollLeft,
    }
  }

  function dragTabs(event) {
    if (!isDraggingTabs || !tabsRef.current) return

    event.preventDefault()
    const distance = event.pageX - tabDrag.current.startX
    tabsRef.current.scrollLeft = tabDrag.current.scrollLeft - distance
  }

  function stopTabDrag() {
    setIsDraggingTabs(false)
  }

  return (
    <div className="teacher-dashboard-page">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div
            className="landing-brand"
            onClick={() => navigate('/')}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                navigate('/')
              }
            }}
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
              type="button"
              className="nav-login"
              onClick={() => navigate('/')}
            >
              Home
            </button>
          </div>
        </div>
      </nav>

      <main className="teacher-dashboard-scroll">
        <div className="teacher-dashboard-content">
          <section className="teacher-profile-area">
            <div>
              <h1>{teacherName}</h1>
              <p>BCDC primary teacher</p>
            </div>
          </section>

          <nav
            ref={tabsRef}
            className={`teacher-tabs${isDraggingTabs ? ' dragging' : ''}`}
            aria-label="Teacher dashboard sections"
            onMouseDown={startTabDrag}
            onMouseMove={dragTabs}
            onMouseUp={stopTabDrag}
            onMouseLeave={stopTabDrag}
          >
            <button type="button" className="teacher-tab active">
              Approvals
            </button>
            <button type="button" className="teacher-tab" disabled>
              Students
            </button>
            <button type="button" className="teacher-tab" disabled>
              Attendance
            </button>
            <button type="button" className="teacher-tab" disabled>
              Announcement
            </button>
            <button type="button" className="teacher-tab" disabled>
              Calendar
            </button>
          </nav>

          <section className="pending-approvals-panel">
            <div className="pending-approvals-header">
              <h2>Pending Approvals</h2>
              <span className="waiting-badge">
                {enrollments.length} waiting
              </span>
            </div>

            {message && <p className="teacher-dashboard-message">{message}</p>}

            {loading ? (
              <p className="teacher-empty-state">Loading applications...</p>
            ) : enrollments.length === 0 ? (
              <p className="teacher-empty-state">No pending applications.</p>
            ) : (
              <div className="approval-list">
                {enrollments.map((enrollment) => (
                  <article className="approval-row" key={enrollment.id}>
                    <div className="approval-details">
                      <h3>{getChildName(enrollment)}</h3>
                      <div className="application-meta">
                        <p className="approval-summary">
                          Age: {calculateAge(enrollment.birth_date)} | Sex:{' '}
                          {formatSex(enrollment.sex)} | Parent: —
                        </p>
                        <p className="approval-bmi">
                          BMI: {calculateBmi(
                            enrollment.height_cm,
                            enrollment.weight_kg,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="review-actions">
                      <button
                        type="button"
                        className="approve-button"
                        disabled={reviewingId === enrollment.id}
                        onClick={() =>
                          updateStatus(enrollment.id, 'approved')
                        }
                      >
                        Accept
                      </button>

                      <button
                        type="button"
                        className="reject-button"
                        disabled={reviewingId === enrollment.id}
                        onClick={() =>
                          updateStatus(enrollment.id, 'rejected')
                        }
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

export default TeacherDashboard
