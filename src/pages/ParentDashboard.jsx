import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import AnnouncementsPanel from '../components/AnnouncementsPanel'
import CalendarPanel from '../components/CalendarPanel'
import HealthGrowthPanel from '../components/HealthGrowthPanel'
import AuthToast from '../components/AuthToast'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

function ParentDashboard() {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const [searchParams] = useSearchParams()

  const [parentName, setParentName] = useState('Parent')
  const [enrollments, setEnrollments] = useState([])
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState(() => {
    const savedNotice = window.sessionStorage.getItem('bcdc:enrollment-success') || ''
    window.sessionStorage.removeItem('bcdc:enrollment-success')
    return savedNotice
  })
  const [loading, setLoading] = useState(true)
  const [dashboardAllowed, setDashboardAllowed] = useState(null)
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = searchParams.get('tab')
    return ['overview', 'information', 'health-growth', 'announcements', 'calendar'].includes(requestedTab) ? requestedTab : 'overview'
  })
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [activeTab])

  useEffect(() => {
    function openNotificationTab(event) {
      if (event.detail?.dashboard !== 'parent') return
      if (['overview', 'information', 'health-growth', 'announcements', 'calendar'].includes(event.detail.tab)) setActiveTab(event.detail.tab)
      if (event.detail.childId) setSelectedEnrollmentId(event.detail.childId)
    }

    window.addEventListener('bcdc:notification-navigation', openNotificationTab)
    return () => window.removeEventListener('bcdc:notification-navigation', openNotificationTab)
  }, [])

  const loadDashboard = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
      setMessage('')
    }

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
        .eq('status', 'approved')
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

      if (nextEnrollments.length === 0) {
        setEnrollments([])
        setDashboardAllowed(false)
        setLoading(false)
        navigate('/', { replace: true })
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

  if (loading || dashboardAllowed !== true) {
    return <LoadingSpinner label="Checking dashboard access..." fullPage />
  }

  return (
    <div className="parent-dashboard-page">
      <AppHeader />
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />

      <main className="parent-dashboard-scroll" ref={scrollRef}>
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
              <div className="parent-tab-group">
                <span className="parent-tab-group-title">Your child</span>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'overview' ? ' active' : ''}`} aria-pressed={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                  <i className="app-icon app-icon-eye" aria-hidden="true" /><span>Enrollment Status</span>
                </button>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'information' ? ' active' : ''}`} aria-pressed={activeTab === 'information'} onClick={() => setActiveTab('information')}>
                  <i className="app-icon app-icon-user-list" aria-hidden="true" /><span>Child Information</span>
                </button>
                {hasApprovedSelection && <button type="button" className={`parent-sidebar-tab${activeTab === 'health-growth' ? ' active' : ''}`} aria-pressed={activeTab === 'health-growth'} onClick={() => setActiveTab('health-growth')}>
                  <i className="app-icon app-icon-options" aria-hidden="true" /><span>Health &amp; Growth</span>
                </button>}
              </div>
              {hasApprovedSelection && <div className="parent-tab-group">
                <span className="parent-tab-group-title">Center updates</span>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'announcements' ? ' active' : ''}`} aria-pressed={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')}>
                  <i className="app-icon app-icon-bell" aria-hidden="true" /><span>Announcements</span>
                </button>
                <button type="button" className={`parent-sidebar-tab${activeTab === 'calendar' ? ' active' : ''}`} aria-pressed={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')}>
                  <i className="app-icon app-icon-calendar" aria-hidden="true" /><span>Calendar</span>
                </button>
              </div>}
            </nav>

            <div className="parent-tab-content">
              {activeTab === 'health-growth' ? (
                <HealthGrowthPanel enrollments={selectedEnrollment ? [selectedEnrollment] : []} />
              ) : activeTab === 'calendar' ? (
                <CalendarPanel listView />
              ) : activeTab === 'announcements' ? (
                <AnnouncementsPanel />
              ) : activeTab === 'information' ? (
                <div className="parent-enrollment-card-list">
                    <section className="parent-dashboard-card" key={selectedEnrollment.id}>
                      <div className="parent-section-heading">
                        <div><span>Child Information</span><h2>{[selectedEnrollment.child_first_name, selectedEnrollment.child_middle_name, selectedEnrollment.child_last_name, selectedEnrollment.child_suffix].filter(Boolean).join(' ')}</h2></div>
                      </div>
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
                        <div><span>Enrollment Status</span><h2>{[selectedEnrollment.child_first_name, selectedEnrollment.child_last_name, selectedEnrollment.child_suffix].filter(Boolean).join(' ')}</h2></div>
                        <span className={`enrollment-status ${selectedEnrollment.status}`}>
                          {selectedEnrollment.status}
                        </span>
                      </div>

                      <p className="parent-status-message">
                        {getStatusMessage(selectedEnrollment.status)}
                      </p>

                      <dl className="parent-overview-grid">
                        <div>
                          <dt>Decision</dt>
                          <dd>Accepted</dd>
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
                      <button type="button" className="parent-inline-link" onClick={() => setActiveTab('information')}>View child information <span aria-hidden="true">→</span></button>
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
