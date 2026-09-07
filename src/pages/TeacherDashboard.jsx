import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StaffReferenceSearch from '../components/StaffReferenceSearch'
import AppHeader from '../components/AppHeader'
import LoadingSpinner from '../components/LoadingSpinner'

function TeacherDashboard() {
  const navigate = useNavigate()

  const [enrollments, setEnrollments] = useState([])
  const [teacherName, setTeacherName] = useState('Teacher')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState(null)
  const [activeTab, setActiveTab] = useState('approvals')

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

    const [profileResult, enrollmentResult, parentNamesResult] =
      await Promise.all([
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
      supabase.rpc('get_staff_parent_names'),
    ])

    if (profileResult.error) {
      setMessage(profileResult.error.message)
    } else if (profileResult.data?.full_name) {
      setTeacherName(profileResult.data.full_name)
    }

    if (enrollmentResult.error) {
      setMessage(enrollmentResult.error.message)
    } else {
      const parentNames = new Map(
        (parentNamesResult.data || []).map((parent) => [
          parent.parent_id,
          parent.parent_full_name,
        ]),
      )

      setEnrollments(
        (enrollmentResult.data || []).map((enrollment) => ({
          ...enrollment,
          parent_full_name: parentNames.get(enrollment.parent_id) || null,
        })),
      )
    }

    if (parentNamesResult.error) {
      console.error('Unable to load parent names:', parentNamesResult.error)
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
    const heightInCentimeters = Number(heightCm)
    const weightInKilograms = Number(weightKg)

    if (
      !Number.isFinite(heightInCentimeters) ||
      !Number.isFinite(weightInKilograms) ||
      heightInCentimeters <= 0 ||
      weightInKilograms <= 0
    ) {
      return '—'
    }

    const heightInMeters = heightInCentimeters / 100
    const heightSquared = heightInMeters * heightInMeters
    const bmi = weightInKilograms / heightSquared

    return bmi.toFixed(1)
  }

  return (
    <div className="teacher-dashboard-page">
      <AppHeader />

      <main className="teacher-dashboard-scroll">
        <div className="teacher-dashboard-content">
          <section className="teacher-profile-area">
            <div>
              <h1>{teacherName}</h1>
              <p>BCDC primary teacher</p>
            </div>
          </section>

          <div className="staff-dashboard-layout">
            <nav
              className="teacher-tabs"
              aria-label="Teacher dashboard sections"
            >
              <button type="button" className={`teacher-tab${activeTab === 'approvals' ? ' active' : ''}`} onClick={() => setActiveTab('approvals')}>
                Approvals
              </button>
              <button type="button" className={`teacher-tab${activeTab === 'reference' ? ' active' : ''}`} onClick={() => setActiveTab('reference')}>
                Reference Search
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

            {activeTab === 'reference' ? <StaffReferenceSearch /> : <section className="pending-approvals-panel">
            <div className="pending-approvals-header">
              <h2>Pending Approvals</h2>
              <span className="waiting-badge">
                {enrollments.length} waiting
              </span>
            </div>

            {message && <p className="teacher-dashboard-message">{message}</p>}

            {loading ? (
              <div className="teacher-empty-state"><LoadingSpinner label="Loading applications..." compact /></div>
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
                          {formatSex(enrollment.sex)} | Parent:{' '}
                          {enrollment.parent_full_name || '—'}
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
            </section>}
          </div>
        </div>
      </main>
    </div>
  )
}

export default TeacherDashboard
