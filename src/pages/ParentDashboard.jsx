import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'

function ParentDashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [parentName, setParentName] = useState('Parent')
  const [enrollments, setEnrollments] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    setMessage('')

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
        .select(`
          id,
          child_first_name,
          child_middle_name,
          child_last_name,
          child_suffix,
          birth_date,
          sex,
          place_of_birth,
          is_registered,
          mother_tongue,
          other_dialect,
          height_cm,
          weight_kg,
          status,
          submitted_at,
          reference_code
        `)
        .eq('parent_id', user.id)
        .order('submitted_at', { ascending: false }),
    ])

    if (profileResult.error) {
      setMessage(profileResult.error.message)
    } else if (profileResult.data?.full_name) {
      setParentName(profileResult.data.full_name)
    }

    if (enrollmentResult.error) {
      setMessage(enrollmentResult.error.message)
    } else {
      const nextEnrollments = enrollmentResult.data || []
      setEnrollments(nextEnrollments)
      const requestedChildId = searchParams.get('child')
      setSelectedEnrollmentId((current) =>
        nextEnrollments.some((item) => item.id === requestedChildId)
          ? requestedChildId
          : nextEnrollments.some((item) => item.id === current)
          ? current
          : nextEnrollments[0]?.id || null,
      )
    }

    setLoading(false)
  }

  function formatDate(date) {
    if (!date) return '—'

    return new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  function formatSubmittedDate(date) {
    if (!date) return '—'

    return new Date(date).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return '—'
    return String(value)
  }

  function formatSex(sex) {
    if (!sex) return '—'
    return sex.charAt(0).toUpperCase() + sex.slice(1)
  }

  function getStatusMessage(status) {
    if (status === 'approved') return 'Application has been approved.'
    if (status === 'rejected') return 'Application was not approved.'
    return 'Application is being reviewed.'
  }

  const selectedEnrollment =
    enrollments.find((item) => item.id === selectedEnrollmentId) ||
    enrollments[0] ||
    null

  return (
    <div className="parent-dashboard-page">
      <AppHeader />

      <main className="parent-dashboard-scroll">
        <div className="parent-dashboard-content">
          <section className="parent-profile-area">
            <h1>{parentName}</h1>
            <p>BCDC Parent Account</p>
          </section>

          {message && <p className="parent-dashboard-message">{message}</p>}
          {searchParams.get('notice') === 'max-children' && (
            <p className="parent-dashboard-message">
              All child enrollment slots for this account are already filled.
            </p>
          )}

          <div className="parent-dashboard-layout">
            <nav
              className="parent-sidebar-tabs"
              aria-label="Parent dashboard sections"
            >
              <button
                type="button"
                className={`parent-sidebar-tab${
                  activeTab === 'overview' ? ' active' : ''
                }`}
                onClick={() => setActiveTab('overview')}
              >
                Enrollment Status
              </button>
              <button
                type="button"
                className={`parent-sidebar-tab${
                  activeTab === 'information' ? ' active' : ''
                }`}
                onClick={() => setActiveTab('information')}
              >
                Child Information
              </button>
            </nav>

            <div className="parent-tab-content">
              {loading ? (
                <section className="parent-dashboard-card parent-empty-state">
                  <p>Loading your enrollment...</p>
                </section>
              ) : enrollments.length === 0 ? (
                <section className="parent-dashboard-card parent-empty-state">
                  <h2>No enrollment application yet.</h2>
                  <p>
                    Return to Home to enroll your child when you are ready.
                  </p>
                </section>
              ) : activeTab === 'information' ? (
                <div className="parent-enrollment-card-list">
                    <section className="parent-dashboard-card" key={selectedEnrollment.id}>
                      <dl className="parent-information-grid">
                        <div>
                          <dt>Date of Birth</dt>
                          <dd>{formatDate(selectedEnrollment.birth_date)}</dd>
                        </div>
                        <div>
                          <dt>Sex</dt>
                          <dd>{formatSex(selectedEnrollment.sex)}</dd>
                        </div>
                        <div>
                          <dt>Place of Birth</dt>
                          <dd>{formatValue(selectedEnrollment.place_of_birth)}</dd>
                        </div>
                        <div>
                          <dt>Registered</dt>
                          <dd>{selectedEnrollment.is_registered ? 'Yes' : 'No'}</dd>
                        </div>
                        <div>
                          <dt>Mother Tongue</dt>
                          <dd>{formatValue(selectedEnrollment.mother_tongue)}</dd>
                        </div>
                        <div>
                          <dt>Other Dialect</dt>
                          <dd>{formatValue(selectedEnrollment.other_dialect)}</dd>
                        </div>
                        <div>
                          <dt>Height</dt>
                          <dd>{formatValue(selectedEnrollment.height_cm)} cm</dd>
                        </div>
                        <div>
                          <dt>Weight</dt>
                          <dd>{formatValue(selectedEnrollment.weight_kg)} kg</dd>
                        </div>
                      </dl>
                    </section>
                </div>
              ) : (
                <div className="parent-enrollment-card-list">
                    <section className="parent-dashboard-card" key={selectedEnrollment.id}>
                      <div className="parent-card-heading">
                        <span className={`enrollment-status ${selectedEnrollment.status}`}>
                          {selectedEnrollment.status}
                        </span>
                      </div>

                      <p className="parent-status-message">
                        {getStatusMessage(selectedEnrollment.status)}
                      </p>

                      <dl className="parent-overview-grid">
                        <div>
                          <dt>Application Status</dt>
                          <dd>{formatSex(selectedEnrollment.status)}</dd>
                        </div>
                        <div>
                          <dt>Reference Code</dt>
                          <dd>{selectedEnrollment.reference_code}</dd>
                        </div>
                        <div>
                          <dt>Submitted</dt>
                          <dd>{formatSubmittedDate(selectedEnrollment.submitted_at)}</dd>
                        </div>
                      </dl>
                    </section>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default ParentDashboard
