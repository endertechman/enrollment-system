import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import AttendanceRoster from '../components/AttendanceRoster'
import AnnouncementsPanel from '../components/AnnouncementsPanel'
import CalendarPanel from '../components/CalendarPanel'
import HealthGrowthPanel from '../components/HealthGrowthPanel'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

function TeacherAideDashboard() {
  const navigate = useNavigate()

  const [enrollments, setEnrollments] = useState([])
  const [aideName, setAideName] = useState('Teacher Aide')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab')
    return ['students', 'health-growth', 'attendance', 'announcements', 'calendar'].includes(requestedTab) ? requestedTab : 'students'
  })
  const [attendanceDate, setAttendanceDate] = useState(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 10)
  })

  useEffect(() => {
    function openNotificationTab(event) {
      if (event.detail?.dashboard === 'teacher-aide' && ['students', 'health-growth', 'attendance', 'announcements', 'calendar'].includes(event.detail.tab)) {
        setActiveTab(event.detail.tab)
      }
    }

    window.addEventListener('bcdc:notification-navigation', openNotificationTab)
    return () => window.removeEventListener('bcdc:notification-navigation', openNotificationTab)
  }, [])

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)

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
        .select('id, parent_id, child_first_name, child_middle_name, child_last_name, child_suffix, birth_date, sex, height_cm, weight_kg, status, reference_code, submitted_at, reviewed_at')
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
  }, [navigate])

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

  useEffect(() => {
    const loadTimer = window.setTimeout(() => loadDashboard(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadDashboard])

  useRealtimeRefresh(() => loadDashboard({ silent: true }), {
    channelName: 'teacher-aide-dashboard',
    tables: ['profiles', 'enrollments'],
  })

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
              <button type="button" className={`teacher-tab${activeTab === 'health-growth' ? ' active' : ''}`} onClick={() => setActiveTab('health-growth')}>
                Health &amp; Growth
              </button>
              <button type="button" className={`teacher-tab${activeTab === 'attendance' ? ' active' : ''}`} onClick={() => setActiveTab('attendance')}>
                Attendance
              </button>
              <button type="button" className={`teacher-tab${activeTab === 'announcements' ? ' active' : ''}`} onClick={() => setActiveTab('announcements')}>
                Announcement
              </button>
              <button type="button" className={`teacher-tab${activeTab === 'calendar' ? ' active' : ''}`} onClick={() => setActiveTab('calendar')}>
                Calendar
              </button>
            </nav>

            {activeTab === 'health-growth' ? (
              <HealthGrowthPanel enrollments={enrollments} />
            ) : activeTab === 'calendar' ? (
              <CalendarPanel />
            ) : activeTab === 'announcements' ? (
              <AnnouncementsPanel />
            ) : activeTab === 'attendance' ? (
              <AttendanceRoster enrollments={enrollments} loading={loading} attendanceDate={attendanceDate} onDateChange={setAttendanceDate} />
            ) : <section className="pending-approvals-panel">
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
