import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StaffReferenceSearch from '../components/StaffReferenceSearch'
import AppHeader from '../components/AppHeader'
import LoadingSpinner from '../components/LoadingSpinner'

function TeacherAideDashboard() {
  const navigate = useNavigate()

  const [enrollments, setEnrollments] = useState([])
  const [aideName, setAideName] = useState('Teacher Aide')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('students')

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
        .order('submitted_at', { ascending: false }),
      supabase.rpc('get_staff_parent_names'),
    ])

    if (profileResult.error) {
      setMessage(profileResult.error.message)
    } else if (profileResult.data?.full_name) {
      setAideName(profileResult.data.full_name)
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

  function formatSex(sex) {
    if (!sex) return 'Not specified'
    return sex.charAt(0).toUpperCase() + sex.slice(1)
  }

  return (
    <div className="teacher-dashboard-page">
      <AppHeader />

      <main className="teacher-dashboard-scroll">
        <div className="teacher-dashboard-content">
          <section className="teacher-profile-area">
            <div>
              <h1>{aideName}</h1>
              <p>BCDC teacher aide</p>
            </div>
          </section>

          <div className="staff-dashboard-layout">
            <nav
              className="teacher-tabs"
              aria-label="Teacher aide dashboard sections"
            >
              <button type="button" className={`teacher-tab${activeTab === 'students' ? ' active' : ''}`} onClick={() => setActiveTab('students')}>
                Students
              </button>
              <button type="button" className={`teacher-tab${activeTab === 'reference' ? ' active' : ''}`} onClick={() => setActiveTab('reference')}>
                Reference Search
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
              <h2>Student Records</h2>
              <span className="waiting-badge">
                {enrollments.length}{' '}
                {enrollments.length === 1 ? 'record' : 'records'}
              </span>
            </div>

            {message && <p className="teacher-dashboard-message">{message}</p>}

            {loading ? (
              <div className="teacher-empty-state"><LoadingSpinner label="Loading student records..." compact /></div>
            ) : enrollments.length === 0 ? (
              <p className="teacher-empty-state">No enrollment records found.</p>
            ) : (
              <div className="approval-list">
                {enrollments.map((enrollment) => (
                  <article
                    className="approval-row aide-record-row"
                    key={enrollment.id}
                  >
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

                    <span className={`enrollment-status ${enrollment.status}`}>
                      {enrollment.status}
                    </span>
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

export default TeacherAideDashboard
