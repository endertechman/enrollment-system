import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import AnnouncementsPanel from '../components/AnnouncementsPanel'
import CalendarPanel from '../components/CalendarPanel'
import HealthGrowthPanel from '../components/HealthGrowthPanel'
import StudentReportPanel from '../components/StudentReportPanel'
import AuthToast from '../components/AuthToast'
import DashboardLoadingShell from '../components/DashboardLoadingShell'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

function ParentDashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [parentName, setParentName] = useState('Parent')
  const [enrollments, setEnrollments] = useState([])
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState(() => {
    const savedNotice = window.sessionStorage.getItem('bcdc:enrollment-success') || ''
    window.sessionStorage.removeItem('bcdc:enrollment-success')
    return savedNotice
  })
  const [loading, setLoading] = useState(true)
  const [dashboardAllowed, setDashboardAllowed] = useState(null)
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = searchParams.get('tab')
    return ['overview', 'information', 'student-report', 'health-growth', 'announcements', 'calendar'].includes(requestedTab) ? requestedTab : 'overview'
  })
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(null)

  useEffect(() => {
    function openNotificationTab(event) {
      if (event.detail?.dashboard !== 'parent') return
      if (['overview', 'information', 'student-report', 'health-growth', 'announcements', 'calendar'].includes(event.detail.tab)) setActiveTab(event.detail.tab)
      if (event.detail.childId) setSelectedEnrollmentId(event.detail.childId)
    }

    window.addEventListener('bcdc:notification-navigation', openNotificationTab)
    return () => window.removeEventListener('bcdc:notification-navigation', openNotificationTab)
  }, [])

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
      setMessage('')
      setLoadError('')
    }

    const {
      data: { user } = {},
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      setLoadError('We could not verify your account. Check your connection, then try again.')
      setDashboardAllowed(false)
      setLoading(false)
      return
    }

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
        .eq('status', 'approved')
        .order('submitted_at', { ascending: false }),
    ])

    if (profileResult.error) {
      setMessage(profileResult.error.message)
    } else if (profileResult.data?.full_name) {
      setParentName(profileResult.data.full_name)
    }

    if (enrollmentResult.error) {
      if (silent) {
        setMessage('We could not refresh the latest records. The information below may be out of date.')
      } else {
        setLoadError('We could not load your child records. Check your connection, then try again.')
        setDashboardAllowed(false)
      }
      setLoading(false)
      return
    } else {
      const nextEnrollments = enrollmentResult.data || []

      if (nextEnrollments.length === 0) {
        setEnrollments([])
        setDashboardAllowed(false)
        setLoading(false)
        return
      }

      setDashboardAllowed(true)
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
  }, [navigate, searchParams])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => loadDashboard(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadDashboard])

  useRealtimeRefresh(() => loadDashboard({ silent: true }), {
    channelName: 'parent-dashboard',
    tables: ['profiles', 'enrollments'],
  })

  function formatDate(date) {
    if (!date) return 'Not provided'

    return new Date(`${date}T00:00:00`).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  function formatSubmittedDate(date) {
    if (!date) return 'Not provided'

    return new Date(date).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  function formatValue(value) {
    if (value === null || value === undefined || value === '') return 'Not provided'
    return String(value)
  }

  function formatSex(sex) {
    if (!sex) return 'Not provided'
    return sex.charAt(0).toUpperCase() + sex.slice(1)
  }

  function formatMeasurement(value, unit) {
    if (value === null || value === undefined || value === '') return 'Not provided'
    return `${value} ${unit}`
  }

  function getChildName(enrollment, includeMiddleName = false) {
    return [
      enrollment?.child_first_name,
      includeMiddleName ? enrollment?.child_middle_name : null,
      enrollment?.child_last_name,
      enrollment?.child_suffix,
    ].filter(Boolean).join(' ')
  }

  function getStatusMessage(status) {
    if (status === 'approved') return 'BCDC approved this enrollment application.'
    if (status === 'rejected') return 'Application was not approved.'
    return 'Application is being reviewed.'
  }

  async function copyReferenceCode(code) {
    try {
      await navigator.clipboard.writeText(code)
      setNotice('Reference code copied.')
    } catch {
      setMessage('Unable to copy automatically. Please select the reference code instead.')
    }
  }

  const selectedEnrollment =
    enrollments.find((item) => item.id === selectedEnrollmentId) ||
    enrollments[0] ||
    null
  const hasApprovedSelection = selectedEnrollment?.status === 'approved'

  if (loading) {
    return <DashboardLoadingShell role="parent" label="Checking dashboard access..." />
  }

  if (loadError) {
    return (
      <div className="parent-dashboard-page">
        <AppHeader />
        <main className="parent-dashboard-state" aria-labelledby="parent-load-error-title">
          <p className="parent-state-label">Parent dashboard</p>
          <h1 id="parent-load-error-title">Your records are unavailable right now</h1>
          <p>{loadError}</p>
          <button type="button" onClick={() => loadDashboard()}>Try loading records again</button>
        </main>
      </div>
    )
  }

  if (dashboardAllowed !== true) {
    return (
      <div className="parent-dashboard-page">
        <AppHeader />
        <main className="parent-dashboard-state" aria-labelledby="parent-empty-title">
          <p className="parent-state-label">Parent dashboard</p>
          <h1 id="parent-empty-title">No approved child record yet</h1>
          <p>When BCDC approves an enrollment, the child record will appear here. You can check the application status from your home page.</p>
          <button type="button" onClick={() => navigate('/')}>Check enrollment status</button>
        </main>
      </div>
    )
  }

  return (
    <div className="parent-dashboard-page">
      <AppHeader />
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />

      <main className="parent-dashboard-scroll">
        <div className="parent-dashboard-content">
          <section className="parent-dashboard-intro" aria-labelledby="parent-dashboard-title">
            <div className="parent-intro-copy">
              <p className="parent-context-label">Parent account</p>
              <h1 id="parent-dashboard-title">Welcome, {parentName}</h1>
              <p>Check your child&apos;s enrollment, records, and updates from the center.</p>
            </div>

            <div className="parent-child-context" aria-label="Child record being viewed">
              <span>Viewing record for</span>
              {enrollments.length > 1 ? (
                <div className="parent-child-options">
                  {enrollments.map((enrollment) => (
                    <button
                      type="button"
                      key={enrollment.id}
                      className={enrollment.id === selectedEnrollmentId ? 'active' : ''}
                      aria-pressed={enrollment.id === selectedEnrollmentId}
                      onClick={() => {
                        setSelectedEnrollmentId(enrollment.id)
                        setActiveTab('overview')
                      }}
                    >
                      <span aria-hidden="true">{enrollment.child_first_name?.charAt(0) || 'C'}</span>
                      {enrollment.child_first_name}
                    </button>
                  ))}
                </div>
              ) : (
                <strong>{getChildName(selectedEnrollment)}</strong>
              )}
            </div>
          </section>

          {message && <p className="parent-dashboard-message" role="status">{message}</p>}
          {searchParams.get('notice') === 'max-children' && (
            <p className="parent-dashboard-message" role="status">
              All child enrollment slots for this account are already filled.
            </p>
          )}

          <div className="parent-dashboard-layout">
            <nav
              className="parent-workspace-tabs"
              aria-label="Parent dashboard sections"
            >
              <div className="parent-tab-group">
                <span className="parent-tab-group-title">Child record</span>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'overview' ? ' active' : ''}`} aria-pressed={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                  <i className="app-icon app-icon-clipboard" aria-hidden="true" /><span>Enrollment</span>
                </button>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'information' ? ' active' : ''}`} aria-pressed={activeTab === 'information'} onClick={() => setActiveTab('information')}>
                  <i className="app-icon app-icon-profile" aria-hidden="true" /><span>Child Information</span>
                </button>
                {hasApprovedSelection && <button type="button" className={`parent-sidebar-tab${activeTab === 'student-report' ? ' active' : ''}`} aria-pressed={activeTab === 'student-report'} onClick={() => setActiveTab('student-report')}>
                  <i className="app-icon app-icon-file-document" aria-hidden="true" /><span>Student Report</span>
                </button>}
                {hasApprovedSelection && <button type="button" className={`parent-sidebar-tab${activeTab === 'health-growth' ? ' active' : ''}`} aria-pressed={activeTab === 'health-growth'} onClick={() => setActiveTab('health-growth')}>
                  <i className="app-icon app-icon-heart" aria-hidden="true" /><span>Health &amp; Growth</span>
                </button>}
              </div>
              {hasApprovedSelection && <div className="parent-tab-group parent-tab-group-center">
                <span className="parent-tab-group-title">From the center</span>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'announcements' ? ' active' : ''}`} aria-pressed={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')}>
                  <i className="app-icon app-icon-bell" aria-hidden="true" /><span>Announcements</span>
                </button>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'calendar' ? ' active' : ''}`} aria-pressed={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')}>
                  <i className="app-icon app-icon-calendar-dates" aria-hidden="true" /><span>Calendar</span>
                </button>
              </div>}
            </nav>

            <div className="parent-tab-content">
              {activeTab === 'health-growth' ? (
                <HealthGrowthPanel enrollments={selectedEnrollment ? [selectedEnrollment] : []} />
              ) : activeTab === 'student-report' ? (
                <StudentReportPanel enrollments={selectedEnrollment ? [selectedEnrollment] : []} parentName={parentName} />
              ) : activeTab === 'calendar' ? (
                <CalendarPanel listView />
              ) : activeTab === 'announcements' ? (
                <AnnouncementsPanel />
              ) : activeTab === 'information' ? (
                <div className="parent-enrollment-card-list">
                    <section className="parent-dashboard-card" key={selectedEnrollment.id}>
                      <div className="parent-section-heading">
                        <h2>Child information</h2>
                      </div>
                      <div className="parent-panel-meta"><strong>{getChildName(selectedEnrollment, true)}</strong></div>
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
                          <dd>{formatMeasurement(selectedEnrollment.height_cm, 'cm')}</dd>
                        </div>
                        <div>
                          <dt>Weight</dt>
                          <dd>{formatMeasurement(selectedEnrollment.weight_kg, 'kg')}</dd>
                        </div>
                      </dl>
                    </section>
                </div>
              ) : (
                <div className="parent-enrollment-card-list">
                    <section className="parent-dashboard-card" key={selectedEnrollment.id}>
                      <div className="parent-card-heading">
                        <h2>Enrollment</h2>
                      </div>
                      <div className="parent-panel-meta">
                        <strong>{getChildName(selectedEnrollment)}</strong>
                        <span className={`enrollment-status ${selectedEnrollment.status}`}>
                          {selectedEnrollment.status}
                        </span>
                      </div>

                      <div className="parent-status-summary">
                        <p className="parent-status-kicker">Application decision</p>
                        <p className="parent-status-title">Enrollment approved</p>
                        <p className="parent-status-message">{getStatusMessage(selectedEnrollment.status)} You can now open the child record and center updates from this dashboard.</p>
                      </div>

                      <dl className="parent-overview-grid">
                        <div>
                          <dt>Enrollment status</dt>
                          <dd>Approved</dd>
                        </div>
                        <div>
                          <dt>Reference Code</dt>
                          <dd className="parent-reference-value"><span>{selectedEnrollment.reference_code}</span><button type="button" onClick={() => copyReferenceCode(selectedEnrollment.reference_code)} aria-label="Copy reference code">Copy</button></dd>
                        </div>
                        <div>
                          <dt>Submitted</dt>
                          <dd>{formatSubmittedDate(selectedEnrollment.submitted_at)}</dd>
                        </div>
                      </dl>
                      <div className="parent-card-actions">
                        <button type="button" className="parent-primary-action" onClick={() => setActiveTab('information')}>Open child information</button>
                        <button type="button" className="parent-secondary-action" onClick={() => setActiveTab('student-report')}>Open student report</button>
                      </div>
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
