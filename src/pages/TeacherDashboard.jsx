import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import AuthToast from '../components/AuthToast'
import LoadingSpinner from '../components/LoadingSpinner'
import AttendanceRoster from '../components/AttendanceRoster'
import AnnouncementsPanel from '../components/AnnouncementsPanel'
import CalendarPanel from '../components/CalendarPanel'
import HealthGrowthPanel from '../components/HealthGrowthPanel'
import { getEnrollmentWindow, getEnrollmentWindowStatus, toDateTimeLocalValue } from '../lib/enrollmentWindow'
import useAutoRefresh from '../hooks/useAutoRefresh'

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
    return ['approvals', 'students', 'enrollment-window', 'health-growth', 'attendance', 'announcements', 'calendar'].includes(requestedTab) ? requestedTab : 'approvals'
  })
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [savingWindow, setSavingWindow] = useState(false)
  const [editingWindow, setEditingWindow] = useState(false)
  const [savedOpensAt, setSavedOpensAt] = useState('')
  const [savedClosesAt, setSavedClosesAt] = useState('')
  const [deletingRejected, setDeletingRejected] = useState(false)
  const [studentFilter, setStudentFilter] = useState('all')
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

    const [profileResult, enrollmentResult, parentNamesResult, windowResult] =
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
      getEnrollmentWindow(),
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

    if (windowResult.error) {
      setMessage('The enrollment schedule is unavailable until its migration is applied.')
    } else {
      setOpensAt(toDateTimeLocalValue(windowResult.data?.opens_at))
      setClosesAt(toDateTimeLocalValue(windowResult.data?.closes_at))
      setSavedOpensAt(toDateTimeLocalValue(windowResult.data?.opens_at))
      setSavedClosesAt(toDateTimeLocalValue(windowResult.data?.closes_at))
    }

    setLoading(false)
  }, [navigate])

  useEffect(() => {
    const initialLoad = window.setTimeout(loadDashboard, 0)
    return () => window.clearTimeout(initialLoad)
  }, [loadDashboard])

  useAutoRefresh(() => loadDashboard({ silent: true }))

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

  async function saveEnrollmentWindow(event) {
    event.preventDefault()
    setMessage('')

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
    setMessage('Enrollment schedule updated.')
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

  function formatScheduleDate(value) {
    if (!value) return 'Not scheduled'
    return new Date(value).toLocaleString('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
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

  async function deleteRejected(ids) {
    if (!ids.length) return
    const label = ids.length === 1 ? 'this rejected application' : `${ids.length} rejected applications`
    if (!window.confirm(`Permanently delete ${label}? This cannot be undone.`)) return

    setDeletingRejected(true)
    setMessage('')
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
    setMessage(ids.length === 1 ? 'Rejected application deleted.' : 'Selected rejected applications deleted.')
  }

  const studentDirectoryRecords = studentRecords.filter((enrollment) => enrollment.status !== 'pending')
  const visibleStudentRecords = studentFilter === 'all'
    ? studentDirectoryRecords
    : studentDirectoryRecords.filter((enrollment) => enrollment.status === studentFilter)
  const rejectedStudentRecords = studentDirectoryRecords.filter((enrollment) => enrollment.status === 'rejected')

  return (
    <div className="teacher-dashboard-page">
      <AppHeader />
      <AuthToast message={reviewNotice} onDismiss={() => setReviewNotice('')} duration={5000} />

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
              <div className="teacher-tab-group">
                <span className="teacher-tab-group-title">Enrollment</span>
                <button type="button" className={`teacher-tab${activeTab === 'approvals' ? ' active' : ''}`} onClick={() => setActiveTab('approvals')}>
                  Enrollment Requests
                </button>
                <button type="button" className={`teacher-tab${activeTab === 'students' ? ' active' : ''}`} onClick={() => setActiveTab('students')}>
                  Enrolled Students
                </button>
                <button type="button" className={`teacher-tab${activeTab === 'enrollment-window' ? ' active' : ''}`} onClick={() => setActiveTab('enrollment-window')}>
                  Enrollment Schedule
                </button>
              </div>
              <div className="teacher-tab-group">
                <span className="teacher-tab-group-title">Center Tools</span>
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
              </div>
            </nav>

            {activeTab === 'health-growth' ? (
              <HealthGrowthPanel enrollments={studentRecords} canManage />
            ) : activeTab === 'calendar' ? (
              <CalendarPanel canManage />
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
                {message && <p className="teacher-dashboard-message">{message}</p>}
                {!loading && studentFilter === 'rejected' && rejectedStudentRecords.length > 0 && <div className="rejected-toolbar compact-rejected-toolbar">
                  <label><input type="checkbox" checked={selectedRejectedIds.length === rejectedStudentRecords.length} onChange={(event) => setSelectedRejectedIds(event.target.checked ? rejectedStudentRecords.map((item) => item.id) : [])} /> Select all</label>
                  <button type="button" className="bulk-delete-button" disabled={!selectedRejectedIds.length || deletingRejected} onClick={() => deleteRejected(selectedRejectedIds)} aria-label={`Delete ${selectedRejectedIds.length} selected records`} title={`Delete selected (${selectedRejectedIds.length})`}><i className="app-icon app-icon-trash" aria-hidden="true" /></button>
                </div>}
                {loading ? <div className="teacher-empty-state"><LoadingSpinner label="Loading student records..." compact /></div> : visibleStudentRecords.length === 0 ? <p className="teacher-empty-state">No {studentFilter === 'all' ? '' : studentFilter} student records found.</p> : <div className="records-table-shell">
                  <table className="records-table student-records-table">
                    <caption className="visually-hidden">Student enrollment records</caption>
                    <thead><tr>
                      {studentFilter === 'rejected' && <th className="records-select-column" scope="col"><span className="visually-hidden">Select</span></th>}
                      <th scope="col">Student</th><th scope="col">Age</th><th scope="col">Sex</th><th scope="col">Parent</th><th scope="col">BMI</th><th scope="col">Status</th>
                    </tr></thead>
                    <tbody>{visibleStudentRecords.map((enrollment) => <tr key={enrollment.id}>
                      {studentFilter === 'rejected' && <td className="records-select-column" data-label="Select"><label className="rejected-select"><input type="checkbox" checked={selectedRejectedIds.includes(enrollment.id)} onChange={() => toggleRejectedSelection(enrollment.id)} /><span className="visually-hidden">Select {getChildName(enrollment)}</span></label></td>}
                      <td data-label="Student"><strong className="records-student-name">{getChildName(enrollment)}</strong></td>
                      <td data-label="Age">{calculateAge(enrollment.birth_date)}</td>
                      <td data-label="Sex">{formatSex(enrollment.sex)}</td>
                      <td data-label="Parent">{enrollment.parent_full_name || '—'}</td>
                      <td data-label="BMI">{calculateBmi(enrollment.height_cm, enrollment.weight_kg)}</td>
                      <td data-label="Status"><div className="student-row-actions"><span className={`enrollment-status ${enrollment.status}`}>{enrollment.status === 'approved' ? 'accepted' : enrollment.status}</span>{enrollment.status === 'rejected' && <button type="button" className="delete-record-button" disabled={deletingRejected} onClick={() => deleteRejected([enrollment.id])} aria-label={`Delete rejected record for ${getChildName(enrollment)}`} title="Delete rejected record"><i className="app-icon app-icon-trash" aria-hidden="true" /></button>}</div></td>
                    </tr>)}</tbody>
                  </table>
                </div>}
              </section>
            ) : activeTab === 'enrollment-window' ? (
              <section className="pending-approvals-panel enrollment-window-panel">
                <div className="pending-approvals-header">
                  <div><h2>Enrollment Schedule</h2></div>
                  <span className={`enrollment-window-badge ${getEnrollmentWindowStatus({ opens_at: opensAt, closes_at: closesAt })}`}>
                    {getEnrollmentWindowStatus({ opens_at: opensAt, closes_at: closesAt })}
                  </span>
                </div>
                {!editingWindow ? <div className="enrollment-window-summary">
                  <dl>
                    <div><dt>Opens</dt><dd>{formatScheduleDate(savedOpensAt)}</dd></div>
                    <div><dt>Closes</dt><dd>{formatScheduleDate(savedClosesAt)}</dd></div>
                  </dl>
                  <button type="button" className="approve-button" onClick={() => { setMessage(''); setEditingWindow(true) }}>Update Schedule</button>
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
                {message && <p className="teacher-dashboard-message">{message}</p>}
                <p className="enrollment-window-note">Dates are inclusive and follow Philippine time. New enrollment submissions are blocked outside this range.</p>
              </section>
            ) : <section className="pending-approvals-panel">
            <div className="pending-approvals-header">
              <div><h2>Enrollment Requests</h2></div>
              <div className="requests-header-actions">
                <span className="waiting-badge">
                  {enrollments.length} waiting
                </span>
                <button type="button" className={`requests-refresh${loading ? ' is-loading' : ''}`} onClick={loadDashboard} disabled={loading} aria-label="Refresh enrollment requests" title="Refresh enrollment requests">
                  <i className="app-icon app-icon-redo" aria-hidden="true" />
                </button>
              </div>
            </div>

            {message && <p className="teacher-dashboard-message">{message}</p>}

            {loading ? (
              <div className="teacher-empty-state"><LoadingSpinner label="Loading applications..." compact /></div>
            ) : enrollments.length === 0 ? (
              <p className="teacher-empty-state">No pending applications.</p>
            ) : (
              <div className="records-table-shell">
                <table className="records-table approvals-table">
                  <caption className="visually-hidden">Pending enrollment requests</caption>
                  <thead><tr><th scope="col">Student</th><th scope="col">Age</th><th scope="col">Sex</th><th scope="col">Parent</th><th scope="col">BMI</th><th scope="col">Review</th></tr></thead>
                  <tbody>{enrollments.map((enrollment) => (
                    <tr key={enrollment.id}>
                      <td data-label="Student"><strong className="records-student-name">{getChildName(enrollment)}</strong></td>
                      <td data-label="Age">{calculateAge(enrollment.birth_date)}</td>
                      <td data-label="Sex">{formatSex(enrollment.sex)}</td>
                      <td data-label="Parent">{enrollment.parent_full_name || '—'}</td>
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
