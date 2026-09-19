import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import AttendanceRoster from '../components/AttendanceRoster'
import AnnouncementsPanel from '../components/AnnouncementsPanel'
import CalendarPanel from '../components/CalendarPanel'
import HealthGrowthPanel from '../components/HealthGrowthPanel'
import StudentReportPanel from '../components/StudentReportPanel'
import AuthToast from '../components/AuthToast'
import DashboardLoadingShell from '../components/DashboardLoadingShell'
import EnrollmentBatchControls from '../components/EnrollmentBatchControls'
import { getEnrollmentWindow } from '../lib/enrollmentWindow'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

function TeacherAideDashboard() {
  const navigate = useNavigate()

  const [enrollments, setEnrollments] = useState([])
  const [aideName, setAideName] = useState('Teacher Aide')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [studentSearch, setStudentSearch] = useState('')
  const [requestSearch, setRequestSearch] = useState('')
  const [studentFilter, setStudentFilter] = useState('all')
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab')
    if (requestedTab === 'student-report') return 'students'
    return ['approvals', 'students', 'enrollment-window', 'health-growth', 'attendance', 'announcements', 'calendar'].includes(requestedTab) ? requestedTab : 'approvals'
  })
  const [reportEnrollmentId, setReportEnrollmentId] = useState(null)
  const [batches, setBatches] = useState([])
  const [currentBatchId, setCurrentBatchId] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [attendanceDate, setAttendanceDate] = useState(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 10)
  })

  useEffect(() => {
    function openNotificationTab(event) {
      if (event.detail?.dashboard === 'teacher-aide' && ['approvals', 'students', 'enrollment-window', 'health-growth', 'attendance', 'announcements', 'calendar'].includes(event.detail.tab)) {
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

    const [profileResult, parentNamesResult, windowResult, batchesResult] =
      await Promise.all([
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single(),
      supabase.rpc('get_staff_parent_names'),
      getEnrollmentWindow(),
      supabase
        .from('enrollment_batches')
        .select('id, name, starts_on, ends_on, opens_at, closes_at, created_at, archived_at')
        .order('created_at', { ascending: false }),
    ])

    const availableBatches = batchesResult.data || []
    const activeBatchId = windowResult.data?.current_batch_id || ''
    const viewedBatchId = availableBatches.some((batch) => batch.id === selectedBatchId)
      ? selectedBatchId
      : activeBatchId
    setBatches(availableBatches)
    setCurrentBatchId(activeBatchId)
    if (viewedBatchId !== selectedBatchId) setSelectedBatchId(viewedBatchId)

    const enrollmentResult = viewedBatchId
      ? await supabase
        .from('enrollments')
        .select('id, batch_id, parent_id, child_first_name, child_middle_name, child_last_name, child_suffix, birth_date, sex, place_of_birth, is_registered, mother_tongue, other_dialect, status, reference_code, submitted_at, reviewed_at')
        .eq('batch_id', viewedBatchId)
        .order('submitted_at', { ascending: false })
      : { data: [], error: null }

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

    if (batchesResult.error) {
      setMessage('Enrollment batches are unavailable until the batch migration is applied.')
    }

    if (windowResult.error) {
      setMessage('The enrollment schedule is unavailable until its migration is applied.')
    }

    setLoading(false)
  }, [navigate, selectedBatchId])

  function getChildName(enrollment) {
    return [
      enrollment.child_first_name,
      enrollment.child_last_name,
      enrollment.child_suffix,
    ]
      .filter(Boolean)
      .join(' ')
  }

  function calculateAge(birthDate) {
    if (!birthDate) return 'Not provided'

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

  useEffect(() => {
    const loadTimer = window.setTimeout(() => loadDashboard(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadDashboard])

  useRealtimeRefresh(() => loadDashboard({ silent: true }), {
    channelName: 'teacher-aide-dashboard',
    tables: ['profiles', 'enrollments', 'enrollment_settings', 'enrollment_batches'],
  })

  function formatSex(sex) {
    if (!sex) return 'Not specified'
    return sex.charAt(0).toUpperCase() + sex.slice(1)
  }

  const pendingEnrollments = enrollments.filter((enrollment) => enrollment.status === 'pending')
  const studentDirectoryRecords = enrollments.filter((enrollment) => enrollment.status !== 'pending')
  const studentSearchTerm = studentSearch.trim().toLocaleLowerCase()
  const filteredStudents = studentFilter === 'all' ? studentDirectoryRecords : studentDirectoryRecords.filter((enrollment) => enrollment.status === studentFilter)
  const visibleStudents = studentSearchTerm
    ? filteredStudents.filter((enrollment) => [getChildName(enrollment), enrollment.parent_full_name, enrollment.reference_code].some((value) => String(value || '').toLocaleLowerCase().includes(studentSearchTerm)))
    : filteredStudents
  const requestSearchTerm = requestSearch.trim().toLocaleLowerCase()
  const visibleRequests = requestSearchTerm
    ? pendingEnrollments.filter((enrollment) => [getChildName(enrollment), enrollment.parent_full_name, enrollment.reference_code].some((value) => String(value || '').toLocaleLowerCase().includes(requestSearchTerm)))
    : pendingEnrollments

  if (loading) {
    return <DashboardLoadingShell label="Loading teacher aide dashboard..." />
  }

  return (
    <div className="teacher-dashboard-page teacher-aide-dashboard-page">
      <AppHeader />
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />

      <main className="teacher-dashboard-scroll">
        <div className="teacher-dashboard-content">
          <section className="aide-dashboard-intro" aria-labelledby="aide-dashboard-title">
            <div className="aide-intro-copy">
              <p className="aide-context-label">Teacher aide workspace</p>
              <h1 id="aide-dashboard-title">Welcome, {aideName}</h1>
              <p>Review enrollment requests and manage daily center records.</p>
            </div>
            <dl className="aide-workload-summary" aria-label="Current record totals">
              <div><dt>Waiting for review</dt><dd>{pendingEnrollments.length}</dd></div>
              <div><dt>Student records</dt><dd>{studentDirectoryRecords.length}</dd></div>
            </dl>
          </section>

          <div className="staff-dashboard-layout">
            <nav
              className="teacher-tabs"
              aria-label="Teacher aide dashboard sections"
            >
              <div className="teacher-tab-group">
                <span className="teacher-tab-group-title">Enrollment</span>
                <button type="button" className={`teacher-tab${activeTab === 'approvals' ? ' active' : ''}`} aria-pressed={activeTab === 'approvals'} onClick={() => setActiveTab('approvals')}>
                  <i className="app-icon app-icon-inbox" aria-hidden="true" /><span>Enrollment Requests</span>
                </button>
                <button type="button" className={`teacher-tab${activeTab === 'students' ? ' active' : ''}`} aria-pressed={activeTab === 'students'} onClick={() => setActiveTab('students')}>
                  <i className="app-icon app-icon-user-list" aria-hidden="true" /><span>Enrolled Students</span>
                </button>
                <button type="button" className={`teacher-tab${activeTab === 'enrollment-window' ? ' active' : ''}`} aria-pressed={activeTab === 'enrollment-window'} onClick={() => setActiveTab('enrollment-window')}>
                  <i className="app-icon app-icon-calendar-due" aria-hidden="true" /><span>Enrollment Setup</span>
                </button>
              </div>
              <div className="teacher-tab-group aide-tab-group-center">
                <span className="teacher-tab-group-title">Center tools</span>
                <button type="button" className={`teacher-tab${activeTab === 'health-growth' ? ' active' : ''}`} aria-pressed={activeTab === 'health-growth'} onClick={() => setActiveTab('health-growth')}>
                  <i className="app-icon app-icon-heart" aria-hidden="true" /><span>Health &amp; Growth</span>
                </button>
                <button type="button" className={`teacher-tab${activeTab === 'attendance' ? ' active' : ''}`} aria-pressed={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')}>
                  <i className="app-icon app-icon-check-o" aria-hidden="true" /><span>Attendance</span>
                </button>
                <button type="button" className={`teacher-tab${activeTab === 'announcements' ? ' active' : ''}`} aria-pressed={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')}>
                  <i className="app-icon app-icon-bell" aria-hidden="true" /><span>Announcements</span>
                </button>
                <button type="button" className={`teacher-tab${activeTab === 'calendar' ? ' active' : ''}`} aria-pressed={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')}>
                  <i className="app-icon app-icon-calendar-dates" aria-hidden="true" /><span>School Calendar</span>
                </button>
              </div>
            </nav>

            {activeTab === 'health-growth' ? (
              <HealthGrowthPanel enrollments={enrollments} canManage />
            ) : activeTab === 'student-report' ? (
              <StudentReportPanel enrollments={enrollments.filter((enrollment) => enrollment.id === reportEnrollmentId)} onBack={() => { setReportEnrollmentId(null); setActiveTab('students') }} />
            ) : activeTab === 'calendar' ? (
              <CalendarPanel canManage listView />
            ) : activeTab === 'announcements' ? (
              <AnnouncementsPanel canManage />
            ) : activeTab === 'attendance' ? (
              <AttendanceRoster enrollments={enrollments} loading={loading} attendanceDate={attendanceDate} onDateChange={setAttendanceDate} canEdit />
            ) : activeTab === 'students' ? (
              <section className="pending-approvals-panel student-records-panel">
                <div className="pending-approvals-header"><div><h2>Enrolled Students</h2></div><span className="waiting-badge">{visibleStudents.length} records</span></div>
                <div className="student-status-filters" aria-label="Filter student records by status">
                  {[['all', 'All'], ['approved', 'Enrolled'], ['rejected', 'Rejected']].map(([value, label]) => <button type="button" key={value} className={studentFilter === value ? 'active' : ''} onClick={() => setStudentFilter(value)}>{label}</button>)}
                </div>
                <label className="dashboard-search"><span className="visually-hidden">Search student records</span><input type="search" value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Search student, parent, or reference code" /></label>
                {message && <p className="teacher-dashboard-message" role="status">{message}</p>}
                {loading ? <div className="teacher-empty-state"><LoadingSpinner label="Loading student records..." compact /></div> : visibleStudents.length === 0 ? <p className="teacher-empty-state">{studentSearchTerm ? 'No students match your search.' : `No ${studentFilter === 'all' ? '' : studentFilter} student records found.`}</p> : <div className="records-table-shell">
                  <table className="records-table student-records-table">
                    <caption className="visually-hidden">Student enrollment records</caption>
                    <thead><tr><th scope="col">Student</th><th scope="col">Age</th><th scope="col">Sex</th><th scope="col">Parent</th><th scope="col">Status</th><th scope="col">Student Report</th></tr></thead>
                    <tbody>{visibleStudents.map((enrollment) => <tr key={enrollment.id}>
                      <td data-label="Student"><strong className="records-student-name">{getChildName(enrollment)}</strong></td>
                      <td data-label="Age">{calculateAge(enrollment.birth_date)}</td>
                      <td data-label="Sex">{formatSex(enrollment.sex)}</td>
                      <td data-label="Parent">{enrollment.parent_full_name || 'Not provided'}</td>
                      <td data-label="Status"><span className={`enrollment-status ${enrollment.status}`}>{enrollment.status === 'approved' ? 'accepted' : enrollment.status}</span></td>
                      <td className="records-report-cell" data-label="Student Report">{enrollment.status === 'approved' ? <button type="button" className="student-report-link" onClick={() => { setReportEnrollmentId(enrollment.id); setActiveTab('student-report') }}>View report</button> : <span aria-hidden="true">—</span>}</td>
                    </tr>)}</tbody>
                  </table>
                </div>}
              </section>
            ) : activeTab === 'enrollment-window' ? (
              <section className="pending-approvals-panel enrollment-window-panel">
                <div className="pending-approvals-header"><div><h2>School Year &amp; Enrollment</h2></div></div>
                <EnrollmentBatchControls
                  batches={batches}
                  currentBatchId={currentBatchId}
                  selectedBatchId={selectedBatchId}
                  onSelect={setSelectedBatchId}
                  onChanged={setSelectedBatchId}
                  onNotice={setNotice}
                  onError={setMessage}
                />
                {message && <p className="teacher-dashboard-message" role="status">{message}</p>}
              </section>
            ) : <section className="pending-approvals-panel">
              <div className="pending-approvals-header"><div><h2>Enrollment Requests</h2></div><span className="waiting-badge">{pendingEnrollments.length} waiting</span></div>
              <p className="enrollment-window-note">Teacher aides can inspect requests, but only teachers can accept or reject them.</p>
              <label className="dashboard-search"><span className="visually-hidden">Search enrollment requests</span><input type="search" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Search student, parent, or reference code" /></label>
              {message && <p className="teacher-dashboard-message" role="status">{message}</p>}
              {loading ? <div className="teacher-empty-state"><LoadingSpinner label="Loading applications..." compact /></div> : visibleRequests.length === 0 ? <p className="teacher-empty-state">{requestSearchTerm ? 'No requests match your search.' : 'No pending applications.'}</p> : <div className="records-table-shell">
                <table className="records-table approvals-table">
                  <caption className="visually-hidden">Pending enrollment requests</caption>
                  <thead><tr><th scope="col">Student</th><th scope="col">Age</th><th scope="col">Sex</th><th scope="col">Parent</th><th scope="col">Status</th></tr></thead>
                  <tbody>{visibleRequests.map((enrollment) => <tr key={enrollment.id}>
                    <td data-label="Student"><strong className="records-student-name">{getChildName(enrollment)}</strong></td>
                    <td data-label="Age">{calculateAge(enrollment.birth_date)}</td>
                    <td data-label="Sex">{formatSex(enrollment.sex)}</td>
                    <td data-label="Parent">{enrollment.parent_full_name || 'Not provided'}</td>
                    <td data-label="Status"><span className="enrollment-status pending">pending</span></td>
                  </tr>)}</tbody>
                </table>
              </div>}
            </section>}
          </div>
        </div>
      </main>
    </div>
  )
}

export default TeacherAideDashboard
