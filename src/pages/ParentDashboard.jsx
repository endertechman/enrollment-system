import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import AnnouncementsPanel from '../components/AnnouncementsPanel'
import CalendarPanel from '../components/CalendarPanel'
import ParentHealthGrowthPanel from '../components/ParentHealthGrowthPanel'
import ParentEccdPanel from '../components/ParentEccdPanel'
import ParentAttendancePanel from '../components/ParentAttendancePanel'
import StudentReportPanel from '../components/StudentReportPanel'
import AuthToast from '../components/AuthToast'
import DashboardLoadingShell from '../components/DashboardLoadingShell'
import { getEnrollmentWindow } from '../lib/enrollmentWindow'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

function ParentDashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [parentName, setParentName] = useState('Parent')
  const [parentEmail, setParentEmail] = useState('')
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
    const tab = requestedTab === 'student-report' ? 'information' : requestedTab
    return ['overview', 'information', 'health-growth', 'development', 'attendance', 'announcements', 'calendar'].includes(tab) ? tab : 'overview'
  })
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(null)
  const [childMenuOpen, setChildMenuOpen] = useState(false)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const childMenuRef = useRef(null)

  useEffect(() => {
    if (!childMenuOpen) return undefined

    function closeOnOutsideClick(event) {
      if (!childMenuRef.current?.contains(event.target)) setChildMenuOpen(false)
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setChildMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [childMenuOpen])

  useEffect(() => {
    function openNotificationTab(event) {
      if (event.detail?.dashboard !== 'parent') return
      const tab = event.detail.tab === 'student-report' ? 'information' : event.detail.tab
      if (['overview', 'information', 'health-growth', 'development', 'attendance', 'announcements', 'calendar'].includes(tab)) setActiveTab(tab)
      if (event.detail.childId) setSelectedEnrollmentId(event.detail.childId)
    }

    window.addEventListener('bcdc:notification-navigation', openNotificationTab)
    return () => window.removeEventListener('bcdc:notification-navigation', openNotificationTab)
  }, [])

  useEffect(() => {
    const updateName = (event) => { if (event.detail?.name) setParentName(event.detail.name) }
    window.addEventListener('bcdc:account-name-updated', updateName)
    return () => window.removeEventListener('bcdc:account-name-updated', updateName)
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

    setParentEmail(user.email || '')

    const windowResult = await getEnrollmentWindow()
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
          batch_id,
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
          status,
          student_state,
          review_reason,
          submitted_at,
          reference_code
        `)
        .eq('parent_id', user.id)
        .eq('batch_id', windowResult.data?.current_batch_id)
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
    tables: ['profiles', 'enrollments', 'enrollment_settings', 'enrollment_batches'],
  })

  function formatSubmittedDate(date) {
    if (!date) return 'Not provided'

    return new Date(date).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  function getChildName(enrollment) {
    return [
      enrollment?.child_first_name,
      enrollment?.child_last_name,
      enrollment?.child_suffix,
    ].filter(Boolean).join(' ')
  }

  function getChildSelectorName(enrollment) {
    return [enrollment?.child_last_name, enrollment?.child_first_name].filter(Boolean).join(', ') || 'Child record'
  }

  function getChildInitials(enrollment) {
    return `${enrollment?.child_first_name?.[0] || ''}${enrollment?.child_last_name?.[0] || ''}`.toUpperCase() || 'C'
  }

  function getChildStatus(enrollment) {
    if (enrollment?.status === 'rejected') return {
      label: 'Needs changes', tone: 'rejected', title: 'Application needs changes',
      message: 'Review the teacher’s note and update the application so it can be reviewed again.',
    }
    if (enrollment?.status !== 'approved') return {
      label: 'Pending review', tone: 'pending', title: 'Application under review',
      message: 'BCDC has received this child’s application. You can check here for a decision.',
    }
    if (enrollment.student_state === 'withdrawn') return {
      label: 'Withdrawn', tone: 'withdrawn', title: 'Child withdrawn',
      message: 'This child is no longer actively enrolled. Their existing records remain available.',
    }
    if (enrollment.student_state === 'dropped') return {
      label: 'Dropped', tone: 'dropped', title: 'Child dropped',
      message: 'This child is no longer actively enrolled. Their existing records remain available.',
    }
    return {
      label: 'Enrolled', tone: 'approved', title: 'Child enrolled',
      message: 'BCDC approved this application. Your child’s records and center updates are available here.',
    }
  }

  function getChildRecordLabel(enrollment) {
    return enrollment?.status === 'rejected' ? 'Resubmission needed' : getChildStatus(enrollment).label
  }

  const selectedEnrollment =
    enrollments.find((item) => item.id === selectedEnrollmentId) ||
    enrollments[0] ||
    null
  const hasApprovedSelection = selectedEnrollment?.status === 'approved'
  const childStatus = getChildStatus(selectedEnrollment)
  const currentTab = hasApprovedSelection || ['overview', 'information'].includes(activeTab) ? activeTab : 'overview'

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
          <h1 id="parent-empty-title">No child application yet</h1>
          <p>Submit an enrollment application to see your child’s status and information here.</p>
          <button type="button" onClick={() => navigate('/enroll')}>Start Enrollment</button>
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
          <section className={`parent-dashboard-intro${headerCollapsed ? ' is-collapsed' : ''}`} aria-labelledby="parent-dashboard-title">
            <div className="parent-intro-copy">
              <p className="parent-context-label">Parent account</p>
              <h1 id="parent-dashboard-title">Welcome, {parentName}</h1>
              <p>Check your child&apos;s enrollment, records, and updates from the center.</p>
            </div>

            <div className="parent-child-context" aria-label="Child record being viewed">
              <span>Viewing record for</span>
              <div className="parent-child-picker" ref={childMenuRef}>
                <span className="parent-child-avatar" aria-hidden="true">{getChildInitials(selectedEnrollment)}</span>
                <strong>{getChildSelectorName(selectedEnrollment)}</strong>
                {enrollments.length > 1 && <button
                  type="button"
                  className="parent-child-switch"
                  aria-label="Switch child record"
                  aria-expanded={childMenuOpen}
                  aria-controls="parent-child-menu"
                  onClick={() => setChildMenuOpen((open) => !open)}
                >
                  <i className="app-icon app-icon-swap" aria-hidden="true" />
                </button>}
                {childMenuOpen && enrollments.length > 1 && <div className="parent-child-menu" id="parent-child-menu" aria-label="Other child records">
                  {enrollments.filter((enrollment) => enrollment.id !== selectedEnrollment?.id).map((enrollment) => (
                    <button
                      type="button"
                      key={enrollment.id}
                      onClick={() => {
                        setSelectedEnrollmentId(enrollment.id)
                        setActiveTab('overview')
                        setChildMenuOpen(false)
                      }}
                    >
                      <span className="parent-child-avatar" aria-hidden="true">{getChildInitials(enrollment)}</span>
                      <span className="parent-child-menu-copy">
                        <strong>{getChildSelectorName(enrollment)}</strong>
                        <span className={`parent-child-state ${getChildStatus(enrollment).tone}`}>{getChildRecordLabel(enrollment)}</span>
                      </span>
                    </button>
                  ))}
                </div>
                }
              </div>
              <span className={`parent-child-state ${childStatus.tone}`} aria-live="polite">{getChildRecordLabel(selectedEnrollment)}</span>
            </div>
            <button
              type="button"
              className="dashboard-summary-toggle"
              aria-label={headerCollapsed ? 'Expand dashboard header' : 'Collapse dashboard header'}
              aria-expanded={!headerCollapsed}
              onClick={() => setHeaderCollapsed((collapsed) => !collapsed)}
            >
              <span className="dashboard-summary-chevron" aria-hidden="true" />
            </button>
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
                <span className="parent-tab-group-title">Child records</span>
                <button type="button" className={`parent-sidebar-tab${currentTab === 'overview' ? ' active' : ''}`} aria-pressed={currentTab === 'overview'} onClick={() => setActiveTab('overview')}>
                  <i className="app-icon app-icon-clipboard" aria-hidden="true" /><span>Enrollment Status</span>
                </button>
                <button type="button" className={`parent-sidebar-tab${currentTab === 'information' ? ' active' : ''}`} aria-pressed={currentTab === 'information'} onClick={() => setActiveTab('information')}>
                  <i className="app-icon app-icon-profile" aria-hidden="true" /><span>Child Summary</span>
                </button>
              </div>
              {hasApprovedSelection && <div className="parent-tab-group parent-tab-group-center">
                <span className="parent-tab-group-title">Center updates</span>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'health-growth' ? ' active' : ''}`} aria-pressed={activeTab === 'health-growth'} onClick={() => setActiveTab('health-growth')}>
                  <i className="app-icon app-icon-heart" aria-hidden="true" /><span>Health &amp; Growth</span>
                </button>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'development' ? ' active' : ''}`} aria-pressed={activeTab === 'development'} onClick={() => setActiveTab('development')}>
                  <i className="app-icon app-icon-clipboard" aria-hidden="true" /><span>Development</span>
                </button>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'attendance' ? ' active' : ''}`} aria-pressed={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')}>
                  <i className="app-icon app-icon-check-o" aria-hidden="true" /><span>Attendance</span>
                </button>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'announcements' ? ' active' : ''}`} aria-pressed={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')}>
                  <i className="app-icon app-icon-mail" aria-hidden="true" /><span>Announcements</span>
                </button>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'calendar' ? ' active' : ''}`} aria-pressed={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')}>
                  <i className="app-icon app-icon-calendar-dates" aria-hidden="true" /><span>School Calendar</span>
                </button>
              </div>}
            </nav>

            <div className="parent-tab-content">
              {currentTab === 'development' ? (
                <ParentEccdPanel key={selectedEnrollment.id} student={selectedEnrollment} />
              ) : currentTab === 'health-growth' ? (
                <ParentHealthGrowthPanel key={selectedEnrollment.id} student={selectedEnrollment} />
              ) : currentTab === 'attendance' ? (
                <ParentAttendancePanel key={selectedEnrollment.id} student={selectedEnrollment} />
              ) : currentTab === 'calendar' ? (
                <CalendarPanel showEnrollmentMilestones />
              ) : currentTab === 'announcements' ? (
                <AnnouncementsPanel />
              ) : currentTab === 'information' ? (
                <StudentReportPanel enrollments={selectedEnrollment ? [selectedEnrollment] : []} includeUnapproved viewerRole="parent" parentName={parentName} parentEmail={parentEmail} title="Child Summary" />
              ) : (
                <div className="parent-enrollment-card-list">
                    <section className="parent-dashboard-card parent-enrollment-panel" key={selectedEnrollment.id}>
                      <div className="parent-card-heading">
                        <h2>Enrollment Status</h2>
                      </div>

                      <div className={`parent-enrollment-status-card ${childStatus.tone}`}>
                        <span className="parent-enrollment-status-icon" aria-hidden="true">
                          <i className="app-icon app-icon-clipboard" />
                        </span>
                        <div>
                          <p>Latest application update</p>
                          <h3>{childStatus.title}</h3>
                          <span>{childStatus.message}</span>
                        </div>
                      </div>

                      {selectedEnrollment.status === 'rejected' && <div className="parent-resubmission-card">
                        {selectedEnrollment.review_reason && <div className="parent-review-note"><strong>Teacher’s note</strong><p>{selectedEnrollment.review_reason}</p></div>}
                        <button type="button" className="parent-primary-action parent-resubmit-action" onClick={() => navigate(`/enroll?resubmit=${selectedEnrollment.id}`)}>Update &amp; Resubmit</button>
                      </div>}

                      <dl className="parent-enrollment-details">
                        <div className="parent-enrollment-detail-card">
                          <span className="parent-detail-icon" aria-hidden="true"><i className="app-icon app-icon-profile" /></span>
                          <div><dt>Child</dt><dd>{getChildName(selectedEnrollment)}</dd></div>
                        </div>
                        <div className="parent-enrollment-detail-card">
                          <span className="parent-detail-icon" aria-hidden="true"><i className="app-icon app-icon-file-document" /></span>
                          <div>
                          <dt>Reference Code</dt>
                          <dd>{selectedEnrollment.reference_code || '—'}</dd>
                          </div>
                        </div>
                        <div className="parent-enrollment-detail-card">
                          <span className="parent-detail-icon" aria-hidden="true"><i className="app-icon app-icon-calendar-dates" /></span>
                          <div>
                          <dt>Submitted</dt>
                          <dd>{formatSubmittedDate(selectedEnrollment.submitted_at)}</dd>
                          </div>
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
