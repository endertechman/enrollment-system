import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import AuthToast from '../components/AuthToast'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadingSpinner from '../components/LoadingSpinner'
import AttendanceRoster from '../components/AttendanceRoster'
import AnnouncementsPanel from '../components/AnnouncementsPanel'
import CalendarPanel from '../components/CalendarPanel'
import HealthGrowthPanel from '../components/HealthGrowthPanel'
import StudentReportPanel from '../components/StudentReportPanel'
import DashboardLoadingShell from '../components/DashboardLoadingShell'
import EnrollmentBatchControls from '../components/EnrollmentBatchControls'
import { getEnrollmentWindow, getEnrollmentWindowStatus, getEnrollmentWindowStatusLabel, toDateTimeLocalValue } from '../lib/enrollmentWindow'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

function TeacherDashboard() {
  const navigate = useNavigate()

  const [enrollments, setEnrollments] = useState([])
  const [studentRecords, setStudentRecords] = useState([])
  const [selectedRejectedIds, setSelectedRejectedIds] = useState([])
  const [teacherName, setTeacherName] = useState('Teacher')
  const [message, setMessage] = useState('')
  const [reviewNotice, setReviewNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState(null)
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab')
    if (requestedTab === 'student-report') return 'students'
    return ['approvals', 'students', 'enrollment-window', 'health-growth', 'attendance', 'announcements', 'calendar'].includes(requestedTab) ? requestedTab : 'approvals'
  })
  const [reportEnrollmentId, setReportEnrollmentId] = useState(null)
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [savingWindow, setSavingWindow] = useState(false)
  const [editingWindow, setEditingWindow] = useState(false)
  const [savedOpensAt, setSavedOpensAt] = useState('')
  const [savedClosesAt, setSavedClosesAt] = useState('')
  const [deletingRejected, setDeletingRejected] = useState(false)
  const [studentFilter, setStudentFilter] = useState('all')
  const [studentSearch, setStudentSearch] = useState('')
  const [requestSearch, setRequestSearch] = useState('')
  const [pendingRejectedDelete, setPendingRejectedDelete] = useState([])
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
      if (event.detail?.dashboard === 'teacher' && ['approvals', 'students', 'enrollment-window', 'health-growth', 'attendance', 'announcements', 'calendar'].includes(event.detail.tab)) {
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
        .select('id, batch_number, created_at, archived_at')
        .order('batch_number', { ascending: false }),
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
        .select('id, batch_id, parent_id, child_first_name, child_middle_name, child_last_name, child_suffix, birth_date, sex, place_of_birth, is_registered, mother_tongue, other_dialect, height_cm, weight_kg, status, reference_code, submitted_at, reviewed_at, reviewed_by')
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

      const attachParentName = (enrollment) => ({
          ...enrollment,
          parent_full_name: parentNames.get(enrollment.parent_id) || null,
        })
      const records = (enrollmentResult.data || []).map(attachParentName)
      setStudentRecords(records)
      setEnrollments(records.filter((enrollment) => enrollment.status === 'pending'))
    }

    if (parentNamesResult.error) {
      console.error('Unable to load parent names:', parentNamesResult.error)
    }

    if (batchesResult.error) {
      setMessage('Enrollment batches are unavailable until the batch migration is applied.')
    }

    if (windowResult.error) {
      setMessage('The enrollment schedule is unavailable until its migration is applied.')
    } else {
      setOpensAt(toDateTimeLocalValue(windowResult.data?.opens_at))
      setClosesAt(toDateTimeLocalValue(windowResult.data?.closes_at))
      setSavedOpensAt(toDateTimeLocalValue(windowResult.data?.opens_at))
      setSavedClosesAt(toDateTimeLocalValue(windowResult.data?.closes_at))
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

  async function updateStatus(id, status) {
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
    setReviewNotice(`Enrollment ${status}.`)
    setReviewingId(null)
  }

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
      return 'Not provided'
    }

    const heightInMeters = heightInCentimeters / 100
    const heightSquared = heightInMeters * heightInMeters
    const bmi = weightInKilograms / heightSquared

    return bmi.toFixed(1)
  }

  async function saveEnrollmentWindow(event) {
    event.preventDefault()
    setMessage('')
    setReviewNotice('')

    const minimumOpeningTime = toDateTimeLocalValue(new Date(Date.now() + 60000))
    const keepingCurrentOpening = opensAt === savedOpensAt
    if (!opensAt || !closesAt || (!keepingCurrentOpening && opensAt < minimumOpeningTime) || opensAt >= closesAt) {
      setMessage('Choose a valid opening and closing date.')
      return
    }

    setSavingWindow(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('enrollment_settings')
      .update({
        opens_at: new Date(opensAt).toISOString(),
        closes_at: new Date(closesAt).toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: user?.id || null,
      })
      .eq('id', true)

    setSavingWindow(false)
    if (error) {
      setMessage(error.message)
      return
    }

    setSavedOpensAt(opensAt)
    setSavedClosesAt(closesAt)
    setEditingWindow(false)
    setReviewNotice('Enrollment schedule updated.')
  }

  const nextTimeSlot = new Date()
  nextTimeSlot.setSeconds(0, 0)
  nextTimeSlot.setMinutes(Math.ceil((nextTimeSlot.getMinutes() + 1) / 30) * 30)
  const minimumOpeningTime = toDateTimeLocalValue(nextTimeSlot)
  const minimumOpeningDate = minimumOpeningTime.slice(0, 10)
  const minimumOpeningClock = minimumOpeningTime.slice(11, 16)
  const openingDate = opensAt.slice(0, 10)
  const openingTime = opensAt.slice(11, 16)
  const closingDate = closesAt.slice(0, 10)
  const closingTime = closesAt.slice(11, 16)
  const currentOpeningIsPast = savedOpensAt && savedOpensAt < minimumOpeningTime

  function updateDateTime(setter, currentValue, nextDate, nextTime) {
    const currentDate = currentValue.slice(0, 10)
    const currentTime = currentValue.slice(11, 16)
    setter(`${nextDate ?? currentDate}T${nextTime ?? currentTime}`)
  }

  function formatScheduleParts(value) {
    if (!value) return { date: 'Not scheduled', time: 'Set a date and time' }
    const date = new Date(value)
    return {
      date: date.toLocaleDateString('en-PH', { dateStyle: 'long', timeZone: 'Asia/Manila' }),
      time: `${date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' })} PHT`,
    }
  }

  function cancelWindowEdit() {
    setOpensAt(savedOpensAt)
    setClosesAt(savedClosesAt)
    setMessage('')
    setEditingWindow(false)
  }

  function toggleRejectedSelection(id) {
    setSelectedRejectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id])
  }

  async function deleteRejected() {
    const ids = pendingRejectedDelete
    if (!ids.length) return
    setDeletingRejected(true)
    setMessage('')
    setReviewNotice('')
    const { error } = await supabase
      .from('enrollments')
      .delete()
      .eq('status', 'rejected')
      .in('id', ids)

    setDeletingRejected(false)
    if (error) {
      setMessage(error.message)
      return
    }

    setStudentRecords((current) => current.filter((item) => !ids.includes(item.id)))
    setSelectedRejectedIds((current) => current.filter((id) => !ids.includes(id)))
    setReviewNotice(ids.length === 1 ? 'Rejected application deleted.' : 'Selected rejected applications deleted.')
    setPendingRejectedDelete([])
  }

  const studentDirectoryRecords = studentRecords.filter((enrollment) => enrollment.status !== 'pending')
  const filteredStudentRecords = studentFilter === 'all'
    ? studentDirectoryRecords
    : studentDirectoryRecords.filter((enrollment) => enrollment.status === studentFilter)
  const studentSearchTerm = studentSearch.trim().toLocaleLowerCase()
  const visibleStudentRecords = studentSearchTerm
    ? filteredStudentRecords.filter((enrollment) => [getChildName(enrollment), enrollment.parent_full_name, enrollment.reference_code].some((value) => String(value || '').toLocaleLowerCase().includes(studentSearchTerm)))
    : filteredStudentRecords
  const requestSearchTerm = requestSearch.trim().toLocaleLowerCase()
  const visibleRequests = requestSearchTerm
    ? enrollments.filter((enrollment) => [getChildName(enrollment), enrollment.parent_full_name, enrollment.reference_code].some((value) => String(value || '').toLocaleLowerCase().includes(requestSearchTerm)))
    : enrollments
  const rejectedStudentRecords = studentDirectoryRecords.filter((enrollment) => enrollment.status === 'rejected')
  const visibleRejectedStudentRecords = visibleStudentRecords.filter((enrollment) => enrollment.status === 'rejected')
  const schedule = { opens_at: opensAt, closes_at: closesAt }
  const openingSchedule = formatScheduleParts(savedOpensAt)
  const closingSchedule = formatScheduleParts(savedClosesAt)

  if (loading) {
    return <DashboardLoadingShell label="Loading teacher dashboard..." />
  }

  return (
    <div className="teacher-dashboard-page teacher-aide-dashboard-page">
      <AppHeader />
      <AuthToast message={reviewNotice} onDismiss={() => setReviewNotice('')} duration={5000} variant="success" />
      {pendingRejectedDelete.length > 0 && <ConfirmDialog title={pendingRejectedDelete.length === 1 ? 'Delete rejected application?' : `Delete ${pendingRejectedDelete.length} rejected applications?`} message="The selected enrollment records will be permanently removed. This action cannot be undone." confirmLabel="Delete" busy={deletingRejected} onConfirm={deleteRejected} onCancel={() => setPendingRejectedDelete([])} />}

      <main className="teacher-dashboard-scroll">
        <div className="teacher-dashboard-content">
          <section className="aide-dashboard-intro" aria-labelledby="teacher-dashboard-title">
            <div className="aide-intro-copy">
              <p className="aide-context-label">Teacher workspace</p>
              <h1 id="teacher-dashboard-title">Welcome, {teacherName}</h1>
              <p>Review enrollment decisions and manage center records.</p>
            </div>
            <dl className="aide-workload-summary" aria-label="Current record totals">
              <div><dt>Waiting for review</dt><dd>{enrollments.length}</dd></div>
              <div><dt>Student records</dt><dd>{studentDirectoryRecords.length}</dd></div>
            </dl>
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
                  <i className="app-icon app-icon-calendar-due" aria-hidden="true" /><span>Enrollment Schedule</span>
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
              <HealthGrowthPanel enrollments={studentRecords} canManage />
            ) : activeTab === 'student-report' ? (
              <StudentReportPanel enrollments={studentRecords.filter((enrollment) => enrollment.id === reportEnrollmentId)} onBack={() => { setReportEnrollmentId(null); setActiveTab('students') }} />
            ) : activeTab === 'calendar' ? (
              <CalendarPanel canManage listView />
            ) : activeTab === 'announcements' ? (
              <AnnouncementsPanel canManage />
            ) : activeTab === 'attendance' ? (
              <AttendanceRoster enrollments={studentRecords} loading={loading} attendanceDate={attendanceDate} onDateChange={setAttendanceDate} canEdit />
            ) : activeTab === 'students' ? (
              <section className="pending-approvals-panel student-records-panel">
                <div className="pending-approvals-header">
                  <div><h2>Enrolled Students</h2></div>
                  <span className="waiting-badge">{visibleStudentRecords.length} records</span>
                </div>
                <div className="student-status-filters" aria-label="Filter student records by status">
                  {[['all', 'All'], ['approved', 'Enrolled'], ['rejected', 'Rejected']].map(([value, label]) => <button type="button" key={value} className={studentFilter === value ? 'active' : ''} onClick={() => { setStudentFilter(value); if (value !== 'rejected') setSelectedRejectedIds([]) }}>{label}</button>)}
                </div>
                <label className="dashboard-search"><span className="visually-hidden">Search student records</span><input type="search" value={studentSearch} onChange={(event) => { setStudentSearch(event.target.value); setSelectedRejectedIds([]) }} placeholder="Search student, parent, or reference code" /></label>
                {message && <p className="teacher-dashboard-message" role="status">{message}</p>}
                {!loading && studentFilter === 'rejected' && rejectedStudentRecords.length > 0 && <div className="rejected-toolbar compact-rejected-toolbar">
                  <label><input type="checkbox" checked={visibleRejectedStudentRecords.length > 0 && visibleRejectedStudentRecords.every((item) => selectedRejectedIds.includes(item.id))} disabled={visibleRejectedStudentRecords.length === 0} onChange={(event) => setSelectedRejectedIds(event.target.checked ? [...new Set([...selectedRejectedIds, ...visibleRejectedStudentRecords.map((item) => item.id)])] : selectedRejectedIds.filter((id) => !visibleRejectedStudentRecords.some((item) => item.id === id)))} /> Select visible</label>
                  <button type="button" className="bulk-delete-button" disabled={!selectedRejectedIds.length || deletingRejected} onClick={() => setPendingRejectedDelete(selectedRejectedIds)} aria-label={`Delete ${selectedRejectedIds.length} selected records`} title={`Delete selected (${selectedRejectedIds.length})`}><i className="app-icon app-icon-trash" aria-hidden="true" /></button>
                </div>}
                {loading ? <div className="teacher-empty-state"><LoadingSpinner label="Loading student records..." compact /></div> : visibleStudentRecords.length === 0 ? <p className="teacher-empty-state">{studentSearchTerm ? 'No students match your search.' : `No ${studentFilter === 'all' ? '' : studentFilter} student records found.`}</p> : <div className="records-table-shell">
                  <table className="records-table student-records-table">
                    <caption className="visually-hidden">Student enrollment records</caption>
                    <thead><tr>
                      {studentFilter === 'rejected' && <th className="records-select-column" scope="col"><span className="visually-hidden">Select</span></th>}
                      <th scope="col">Student</th><th scope="col">Age</th><th scope="col">Sex</th><th scope="col">Parent</th><th scope="col">BMI</th><th scope="col">Status</th><th scope="col">Student Report</th><th scope="col" className="records-actions-column"><span className="visually-hidden">Actions</span></th>
                    </tr></thead>
                    <tbody>{visibleStudentRecords.map((enrollment) => <tr key={enrollment.id}>
                      {studentFilter === 'rejected' && <td className="records-select-column" data-label="Select"><label className="rejected-select"><input type="checkbox" checked={selectedRejectedIds.includes(enrollment.id)} onChange={() => toggleRejectedSelection(enrollment.id)} /><span className="visually-hidden">Select {getChildName(enrollment)}</span></label></td>}
                      <td data-label="Student"><strong className="records-student-name">{getChildName(enrollment)}</strong></td>
                      <td data-label="Age">{calculateAge(enrollment.birth_date)}</td>
                      <td data-label="Sex">{formatSex(enrollment.sex)}</td>
                      <td data-label="Parent">{enrollment.parent_full_name || 'Not provided'}</td>
                      <td data-label="BMI">{calculateBmi(enrollment.height_cm, enrollment.weight_kg)}</td>
                      <td data-label="Status"><span className={`enrollment-status ${enrollment.status}`}>{enrollment.status === 'approved' ? 'accepted' : enrollment.status}</span></td>
                      <td className="records-report-cell" data-label="Student Report">{enrollment.status === 'approved' ? <button type="button" className="student-report-link" onClick={() => { setReportEnrollmentId(enrollment.id); setActiveTab('student-report') }}>View report</button> : <span aria-hidden="true">—</span>}</td>
                      <td className="records-actions-column" data-label="Actions">{enrollment.status === 'rejected' && <button type="button" className="delete-record-button" disabled={deletingRejected} onClick={() => setPendingRejectedDelete([enrollment.id])} aria-label={`Delete rejected record for ${getChildName(enrollment)}`} title="Delete rejected record"><i className="app-icon app-icon-trash" aria-hidden="true" /></button>}</td>
                    </tr>)}</tbody>
                  </table>
                </div>}
              </section>
            ) : activeTab === 'enrollment-window' ? (
              <section className="pending-approvals-panel enrollment-window-panel">
                <div className="pending-approvals-header">
                  <div><h2>Enrollment Schedule</h2></div>
                  <span className={`enrollment-window-badge ${getEnrollmentWindowStatus(schedule)}`}>
                    {getEnrollmentWindowStatusLabel(schedule)}
                  </span>
                </div>
                {!editingWindow ? <div className="enrollment-window-summary">
                  <dl className="schedule-visual-grid">
                    <div className="schedule-visual-card"><span className="schedule-icon"><i className="app-icon app-icon-clock" aria-hidden="true" /></span><div><dt>Enrollment opens</dt><dd><strong>{openingSchedule.date}</strong><span>{openingSchedule.time}</span></dd></div></div>
                    <div className="schedule-visual-card"><span className="schedule-icon"><i className="app-icon app-icon-clock" aria-hidden="true" /></span><div><dt>Enrollment closes</dt><dd><strong>{closingSchedule.date}</strong><span>{closingSchedule.time}</span></dd></div></div>
                  </dl>
                </div> : <form className="enrollment-window-form" onSubmit={saveEnrollmentWindow}>
                  <div className="enrollment-window-range">
                    <fieldset className="enrollment-window-group">
                      <legend>Opens</legend>
                      <div className="enrollment-window-fields">
                        <label>Date<input type="date" value={openingDate} min={currentOpeningIsPast ? undefined : minimumOpeningDate} onChange={(event) => updateDateTime(setOpensAt, opensAt, event.target.value, openingTime || minimumOpeningClock)} required /></label>
                        <label>Time<input type="time" value={openingTime} min={!currentOpeningIsPast && openingDate === minimumOpeningDate ? minimumOpeningClock : undefined} onChange={(event) => updateDateTime(setOpensAt, opensAt, openingDate || minimumOpeningDate, event.target.value)} required /></label>
                      </div>
                    </fieldset>
                    <fieldset className="enrollment-window-group">
                      <legend>Closes</legend>
                      <div className="enrollment-window-fields">
                        <label>Date<input type="date" value={closingDate} min={openingDate || minimumOpeningDate} onChange={(event) => updateDateTime(setClosesAt, closesAt, event.target.value, closingTime)} required /></label>
                        <label>Time<input type="time" value={closingTime} min={closingDate && closingDate === openingDate ? openingTime : undefined} onChange={(event) => updateDateTime(setClosesAt, closesAt, closingDate || openingDate || minimumOpeningDate, event.target.value)} required /></label>
                      </div>
                    </fieldset>
                  </div>
                  <div className="enrollment-window-actions"><button type="button" className="button-secondary" onClick={cancelWindowEdit} disabled={savingWindow}>Cancel</button><button type="submit" className="approve-button" disabled={savingWindow}>{savingWindow ? <LoadingSpinner label="Saving..." inline /> : 'Save Schedule'}</button></div>
                </form>}
                <EnrollmentBatchControls
                  batches={batches}
                  currentBatchId={currentBatchId}
                  selectedBatchId={selectedBatchId}
                  scheduleEditing={editingWindow}
                  onUpdateSchedule={() => { setMessage(''); setEditingWindow(true) }}
                  onSelect={setSelectedBatchId}
                  onChanged={setSelectedBatchId}
                  onNotice={setReviewNotice}
                  onError={setMessage}
                />
                {message && <p className="teacher-dashboard-message" role="status">{message}</p>}
                <p className="enrollment-window-note">Dates are inclusive and follow Philippine time. New enrollment submissions are blocked outside this range.</p>
              </section>
            ) : <section className="pending-approvals-panel">
            <div className="pending-approvals-header">
              <div><h2>Enrollment Requests</h2></div>
              <div className="requests-header-actions">
                <span className="waiting-badge">
                  {enrollments.length} waiting
                </span>
              </div>
            </div>

            {message && <p className="teacher-dashboard-message" role="status">{message}</p>}
            <label className="dashboard-search"><span className="visually-hidden">Search enrollment requests</span><input type="search" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Search student, parent, or reference code" /></label>

            {loading ? (
              <div className="teacher-empty-state"><LoadingSpinner label="Loading applications..." compact /></div>
            ) : visibleRequests.length === 0 ? (
              <p className="teacher-empty-state">{requestSearchTerm ? 'No requests match your search.' : 'No pending applications.'}</p>
            ) : (
              <div className="records-table-shell">
                <table className="records-table approvals-table">
                  <caption className="visually-hidden">Pending enrollment requests</caption>
                  <thead><tr><th scope="col">Student</th><th scope="col">Age</th><th scope="col">Sex</th><th scope="col">Parent</th><th scope="col">BMI</th><th scope="col">Review</th></tr></thead>
                  <tbody>{visibleRequests.map((enrollment) => (
                    <tr key={enrollment.id}>
                      <td data-label="Student"><strong className="records-student-name">{getChildName(enrollment)}</strong></td>
                      <td data-label="Age">{calculateAge(enrollment.birth_date)}</td>
                      <td data-label="Sex">{formatSex(enrollment.sex)}</td>
                      <td data-label="Parent">{enrollment.parent_full_name || 'Not provided'}</td>
                      <td data-label="BMI">{calculateBmi(enrollment.height_cm, enrollment.weight_kg)}</td>
                      <td data-label="Review"><div className="review-actions">
                        <button type="button" className="approve-button" disabled={reviewingId === enrollment.id} onClick={() => updateStatus(enrollment.id, 'approved')}>Accept</button>
                        <button type="button" className="reject-button" disabled={reviewingId === enrollment.id} onClick={() => updateStatus(enrollment.id, 'rejected')}>Reject</button>
                      </div></td>
                    </tr>
                  ))}</tbody>
                </table>
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
