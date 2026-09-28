import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import AuthToast from '../components/AuthToast'
import AttendanceRoster from '../components/AttendanceRoster'
import AnnouncementsPanel from '../components/AnnouncementsPanel'
import CalendarPanel from '../components/CalendarPanel'
import HealthGrowthPanel from '../components/HealthGrowthDirectory'
import EccdAssessmentPanel from '../components/EccdAssessmentPanel'
import StudentReportPanel from '../components/StudentReportPanel'
import StudentReportsDirectory from '../components/StudentReportsDirectory'
import EnrollmentRequestsDirectory from '../components/EnrollmentRequestsDirectory'
import DashboardLoadingShell from '../components/DashboardLoadingShell'
import EnrollmentBatchControls from '../components/EnrollmentBatchControls'
import { getEnrollmentWindow } from '../lib/enrollmentWindow'
import { getPhilippineDateValue } from '../lib/philippineDate'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

function TeacherDashboard() {
  const navigate = useNavigate()

  const [enrollments, setEnrollments] = useState([])
  const [studentRecords, setStudentRecords] = useState([])
  const [teacherName, setTeacherName] = useState('Teacher')
  const [message, setMessage] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState(null)
  const [updatingStudentStateId, setUpdatingStudentStateId] = useState(null)
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab')
    if (requestedTab === 'student-report') return 'students'
    return ['approvals', 'students', 'enrollment-window', 'health-growth', 'eccd', 'attendance', 'announcements', 'calendar'].includes(requestedTab) ? requestedTab : 'approvals'
  })
  const [reportEnrollmentId, setReportEnrollmentId] = useState(null)
  const [batches, setBatches] = useState([])
  const [currentBatchId, setCurrentBatchId] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [attendanceDate, setAttendanceDate] = useState(getPhilippineDateValue)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)

  useEffect(() => {
    function openNotificationTab(event) {
      if (event.detail?.dashboard === 'teacher' && ['approvals', 'students', 'enrollment-window', 'health-growth', 'eccd', 'attendance', 'announcements', 'calendar'].includes(event.detail.tab)) {
        setActiveTab(event.detail.tab)
      }
    }

    window.addEventListener('bcdc:notification-navigation', openNotificationTab)
    return () => window.removeEventListener('bcdc:notification-navigation', openNotificationTab)
  }, [])

  useEffect(() => {
    const updateName = (event) => { if (event.detail?.name) setTeacherName(event.detail.name) }
    window.addEventListener('bcdc:account-name-updated', updateName)
    return () => window.removeEventListener('bcdc:account-name-updated', updateName)
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

    const [profileResult, parentNamesResult, parentEmailsResult, windowResult, batchesResult] =
      await Promise.all([
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single(),
      supabase.rpc('get_staff_parent_names'),
      supabase.rpc('get_staff_parent_emails'),
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
        .select('id, batch_id, parent_id, child_first_name, child_middle_name, child_last_name, child_suffix, birth_date, sex, place_of_birth, is_registered, mother_tongue, other_dialect, status, student_state, reference_code, submitted_at, resubmitted_at, reviewed_at, reviewed_by, review_reason')
        .eq('batch_id', viewedBatchId)
        .order('submitted_at', { ascending: false })
      : { data: [], error: null }

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
      const parentEmails = new Map(
        (parentEmailsResult.data || []).map((parent) => [
          parent.parent_id,
          parent.parent_email,
        ]),
      )

      const attachParentName = (enrollment) => ({
          ...enrollment,
          parent_full_name: parentNames.get(enrollment.parent_id) || null,
          parent_email: parentEmails.get(enrollment.parent_id) || null,
        })
      const records = (enrollmentResult.data || []).map(attachParentName)
      setStudentRecords(records)
      setEnrollments(records.filter((enrollment) => enrollment.status === 'pending'))
    }

    if (parentNamesResult.error) {
      console.error('Unable to load parent names:', parentNamesResult.error)
    }

    if (parentEmailsResult.error) {
      console.error('Unable to load parent emails:', parentEmailsResult.error)
    }

    if (batchesResult.error) {
      setMessage('Enrollment batches are unavailable until the batch migration is applied.')
    }

    if (windowResult.error) {
      setMessage('The enrollment schedule is unavailable until its migration is applied.')
    }

    setLoading(false)
  }, [navigate, selectedBatchId])

  useEffect(() => {
    const initialLoad = window.setTimeout(loadDashboard, 0)
    return () => window.clearTimeout(initialLoad)
  }, [loadDashboard])

  useRealtimeRefresh(() => loadDashboard({ silent: true }), {
    channelName: 'teacher-dashboard',
    tables: ['profiles', 'enrollments', 'enrollment_settings', 'enrollment_batches'],
  })

  async function updateStatus(id, status, reviewReason = '') {
    setMessage('')
    setReviewNotice('')
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
        review_reason: status === 'rejected' ? reviewReason.trim() : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      setReviewingId(null)
      return
    }

    setEnrollments((current) => current.filter((enrollment) => enrollment.id !== id))
    setStudentRecords((current) => current.map((enrollment) => enrollment.id === id
      ? { ...enrollment, status, reviewed_at: new Date().toISOString(), reviewed_by: user.id }
      : enrollment))
    setReviewNotice(status === 'approved' ? 'Enrollment approved.' : 'Resubmission requested from the parent.')
    setReviewingId(null)
  }

  const studentDirectoryRecords = studentRecords.filter((enrollment) => enrollment.status === 'approved')
  if (loading) {
    return <DashboardLoadingShell label="Loading teacher dashboard..." />
  }

  async function updateStudentState(id, studentState) {
    setMessage('')
    setUpdatingStudentStateId(id)

    const { error } = await supabase
      .from('enrollments')
      .update({ student_state: studentState })
      .eq('id', id)
      .eq('status', 'approved')

    if (error) {
      setMessage(error.message)
    } else {
      setStudentRecords((current) => current.map((student) => student.id === id ? { ...student, student_state: studentState } : student))
      setReviewNotice(`Student status changed to ${studentState}.`)
    }

    setUpdatingStudentStateId(null)
  }

  function updateStudentInformation(id, updates) {
    setStudentRecords((current) => current.map((student) => student.id === id ? { ...student, ...updates } : student))
    setReviewNotice('Student information updated successfully.')
  }

  return (
    <div className="teacher-dashboard-page teacher-aide-dashboard-page">
      <AppHeader />
      <AuthToast message={reviewNotice} onDismiss={() => setReviewNotice('')} duration={5000} variant="success" />
      {reportEnrollmentId && <StudentReportPanel enrollments={studentRecords.filter((enrollment) => enrollment.id === reportEnrollmentId)} onClose={() => setReportEnrollmentId(null)} canManageStatus updatingStatusId={updatingStudentStateId} onStatusChange={updateStudentState} canEditStudentInfo onStudentInfoUpdated={updateStudentInformation} />}

      <main className="teacher-dashboard-scroll">
        <div className="teacher-dashboard-content">
          <section className={`aide-dashboard-intro${headerCollapsed ? ' is-collapsed' : ''}`} aria-labelledby="teacher-dashboard-title">
            <div className="aide-intro-copy">
              <p className="aide-context-label">Teacher workspace</p>
              <h1 id="teacher-dashboard-title">Welcome, {teacherName}</h1>
              <p>Review enrollment decisions and manage center records.</p>
            </div>
            <dl className="aide-workload-summary" aria-label="Current record totals">
              <div><dt>Waiting for review</dt><dd>{enrollments.length}</dd></div>
              <div><dt>Student records</dt><dd>{studentDirectoryRecords.length}</dd></div>
            </dl>
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

          <div className="staff-dashboard-layout">
            <nav
              className="teacher-tabs"
              aria-label="Teacher dashboard sections"
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
                <button type="button" className={`teacher-tab${activeTab === 'eccd' ? ' active' : ''}`} aria-pressed={activeTab === 'eccd'} onClick={() => setActiveTab('eccd')}>
                  <i className="app-icon app-icon-clipboard" aria-hidden="true" /><span>Development (ECCD)</span>
                </button>
                <button type="button" className={`teacher-tab${activeTab === 'attendance' ? ' active' : ''}`} aria-pressed={activeTab === 'attendance'} onClick={() => setActiveTab('attendance')}>
                  <i className="app-icon app-icon-check-o" aria-hidden="true" /><span>Attendance</span>
                </button>
                <button type="button" className={`teacher-tab${activeTab === 'announcements' ? ' active' : ''}`} aria-pressed={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')}>
                  <i className="app-icon app-icon-mail" aria-hidden="true" /><span>Announcements</span>
                </button>
                <button type="button" className={`teacher-tab${activeTab === 'calendar' ? ' active' : ''}`} aria-pressed={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')}>
                  <i className="app-icon app-icon-calendar-dates" aria-hidden="true" /><span>School Calendar</span>
                </button>
              </div>
            </nav>

            <div className="staff-tab-content">
              {activeTab === 'eccd' ? (
                <EccdAssessmentPanel enrollments={studentRecords} />
              ) : activeTab === 'health-growth' ? (
                <HealthGrowthPanel enrollments={studentRecords} canManage />
              ) : activeTab === 'calendar' ? (
                <CalendarPanel canManage listView />
              ) : activeTab === 'announcements' ? (
                <AnnouncementsPanel canManage />
              ) : activeTab === 'attendance' ? (
                <AttendanceRoster enrollments={studentRecords} loading={loading} attendanceDate={attendanceDate} onDateChange={setAttendanceDate} batch={batches.find((batch) => batch.id === selectedBatchId) || null} canEdit />
              ) : activeTab === 'students' ? (
                <StudentReportsDirectory enrollments={studentRecords} onOpenReport={setReportEnrollmentId} />
              ) : activeTab === 'enrollment-window' ? (
                <section className="pending-approvals-panel enrollment-window-panel">
                  <div className="pending-approvals-header">
                    <div><h2>School Year &amp; Enrollment</h2></div>
                  </div>
                  <EnrollmentBatchControls
                    batches={batches}
                    currentBatchId={currentBatchId}
                    selectedBatchId={selectedBatchId}
                    onSelect={setSelectedBatchId}
                    onChanged={setSelectedBatchId}
                    onNotice={setReviewNotice}
                    onError={setMessage}
                    canDelete
                  />
                  {message && <p className="teacher-dashboard-message" role="status">{message}</p>}
                </section>
              ) : (
                <div className="enrollment-requests-view">
                  {message && <p className="teacher-dashboard-message" role="status">{message}</p>}
                  <EnrollmentRequestsDirectory enrollments={enrollments} canReview reviewingId={reviewingId} onReview={updateStatus} />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default TeacherDashboard
