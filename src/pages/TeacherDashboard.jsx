import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StaffReferenceSearch from '../components/StaffReferenceSearch'
import AppHeader from '../components/AppHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import { getEnrollmentWindow, getEnrollmentWindowStatus, toDateTimeLocalValue } from '../lib/enrollmentWindow'

function TeacherDashboard() {
  const navigate = useNavigate()

  const [enrollments, setEnrollments] = useState([])
  const [studentRecords, setStudentRecords] = useState([])
  const [rejectedEnrollments, setRejectedEnrollments] = useState([])
  const [selectedRejectedIds, setSelectedRejectedIds] = useState([])
  const [teacherName, setTeacherName] = useState('Teacher')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState(null)
  const [activeTab, setActiveTab] = useState('approvals')
  const [opensAt, setOpensAt] = useState('')
  const [closesAt, setClosesAt] = useState('')
  const [savingWindow, setSavingWindow] = useState(false)
  const [editingWindow, setEditingWindow] = useState(false)
  const [savedOpensAt, setSavedOpensAt] = useState('')
  const [savedClosesAt, setSavedClosesAt] = useState('')
  const [deletingRejected, setDeletingRejected] = useState(false)
  const [studentFilter, setStudentFilter] = useState('all')

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
      setRejectedEnrollments(records.filter((enrollment) => enrollment.status === 'rejected'))
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
  }

  async function updateStatus(id, status) {
    setMessage('')
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

    const reviewedEnrollment = enrollments.find((enrollment) => enrollment.id === id)
    setEnrollments((current) => current.filter((enrollment) => enrollment.id !== id))
    setStudentRecords((current) => current.map((enrollment) => enrollment.id === id
      ? { ...enrollment, status, reviewed_at: new Date().toISOString(), reviewed_by: user.id }
      : enrollment))
    if (status === 'rejected' && reviewedEnrollment) {
      setRejectedEnrollments((current) => [{
        ...reviewedEnrollment,
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      }, ...current])
    }
    setMessage(`Enrollment ${status}.`)
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

    setRejectedEnrollments((current) => current.filter((item) => !ids.includes(item.id)))
    setStudentRecords((current) => current.filter((item) => !ids.includes(item.id)))
    setSelectedRejectedIds((current) => current.filter((id) => !ids.includes(id)))
    setMessage(ids.length === 1 ? 'Rejected application deleted.' : 'Selected rejected applications deleted.')
  }

  const visibleStudentRecords = studentFilter === 'all'
    ? studentRecords
    : studentRecords.filter((enrollment) => enrollment.status === studentFilter)

  return (
    <div className="teacher-dashboard-page">
      <AppHeader />

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
              <button type="button" className={`teacher-tab${activeTab === 'approvals' ? ' active' : ''}`} onClick={() => setActiveTab('approvals')}>
                Approvals
              </button>
              <button type="button" className={`teacher-tab${activeTab === 'reference' ? ' active' : ''}`} onClick={() => setActiveTab('reference')}>
                Reference Search
              </button>
              <button type="button" className={`teacher-tab${activeTab === 'enrollment-window' ? ' active' : ''}`} onClick={() => setActiveTab('enrollment-window')}>
                Enrollment Status
              </button>
              <button type="button" className={`teacher-tab${activeTab === 'rejected' ? ' active' : ''}`} onClick={() => setActiveTab('rejected')}>
                Rejected
              </button>
              <button type="button" className={`teacher-tab${activeTab === 'students' ? ' active' : ''}`} onClick={() => setActiveTab('students')}>
                Students
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

            {activeTab === 'reference' ? <StaffReferenceSearch /> : activeTab === 'students' ? (
              <section className="pending-approvals-panel student-records-panel">
                <div className="pending-approvals-header">
                  <div><h2>Student Records</h2></div>
                  <span className="waiting-badge">{visibleStudentRecords.length} records</span>
                </div>
                <div className="student-status-filters" aria-label="Filter student records by status">
                  {[['all', 'All'], ['approved', 'Accepted'], ['pending', 'Pending'], ['rejected', 'Rejected']].map(([value, label]) => <button type="button" key={value} className={studentFilter === value ? 'active' : ''} onClick={() => setStudentFilter(value)}>{label}</button>)}
                </div>
                {message && <p className="teacher-dashboard-message">{message}</p>}
                {loading ? <div className="teacher-empty-state"><LoadingSpinner label="Loading student records..." compact /></div> : visibleStudentRecords.length === 0 ? <p className="teacher-empty-state">No {studentFilter === 'all' ? '' : studentFilter} student records found.</p> : <div className="approval-list">
                  {visibleStudentRecords.map((enrollment) => <article className="approval-row student-record-row" key={enrollment.id}>
                    <div className="approval-details"><h3>{getChildName(enrollment)}</h3><div className="application-meta"><p>Age: {calculateAge(enrollment.birth_date)} | Sex: {formatSex(enrollment.sex)} | Parent: {enrollment.parent_full_name || '—'}</p><p>BMI: {calculateBmi(enrollment.height_cm, enrollment.weight_kg)}</p></div></div>
                    <span className={`enrollment-status ${enrollment.status}`}>{enrollment.status === 'approved' ? 'accepted' : enrollment.status}</span>
                  </article>)}
                </div>}
              </section>
            ) : activeTab === 'rejected' ? (
              <section className="pending-approvals-panel rejected-applications-panel">
                <div className="pending-approvals-header">
                  <div><h2>Rejected Applications</h2></div>
                  <span className="waiting-badge">{rejectedEnrollments.length} rejected</span>
                </div>
                {message && <p className="teacher-dashboard-message">{message}</p>}
                {!loading && rejectedEnrollments.length > 0 && <div className="rejected-toolbar">
                  <label><input type="checkbox" checked={selectedRejectedIds.length === rejectedEnrollments.length} onChange={(event) => setSelectedRejectedIds(event.target.checked ? rejectedEnrollments.map((item) => item.id) : [])} /> Select all</label>
                  <button type="button" className="bulk-delete-button" disabled={!selectedRejectedIds.length || deletingRejected} onClick={() => deleteRejected(selectedRejectedIds)}>{deletingRejected ? 'Deleting...' : `Delete Selected (${selectedRejectedIds.length})`}</button>
                </div>}
                {loading ? <div className="teacher-empty-state"><LoadingSpinner label="Loading rejected applications..." compact /></div> : rejectedEnrollments.length === 0 ? <p className="teacher-empty-state">No rejected applications.</p> : <div className="approval-list">
                  {rejectedEnrollments.map((enrollment) => <article className="approval-row rejected-row" key={enrollment.id}>
                    <label className="rejected-select"><input type="checkbox" checked={selectedRejectedIds.includes(enrollment.id)} onChange={() => toggleRejectedSelection(enrollment.id)} /><span className="visually-hidden">Select {getChildName(enrollment)}</span></label>
                    <div className="approval-details"><h3>{getChildName(enrollment)}</h3><div className="application-meta"><p>Age: {calculateAge(enrollment.birth_date)} | Sex: {formatSex(enrollment.sex)} | Parent: {enrollment.parent_full_name || '—'}</p><p>BMI: {calculateBmi(enrollment.height_cm, enrollment.weight_kg)}</p></div></div>
                    <button type="button" className="delete-record-button" disabled={deletingRejected} onClick={() => deleteRejected([enrollment.id])}>Delete</button>
                  </article>)}
                </div>}
              </section>
            ) : activeTab === 'enrollment-window' ? (
              <section className="pending-approvals-panel enrollment-window-panel">
                <div className="pending-approvals-header">
                  <div><h2>Enrollment Status</h2></div>
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
                  <div className="enrollment-window-actions"><button type="button" className="button-secondary" onClick={cancelWindowEdit} disabled={savingWindow}>Cancel</button><button type="submit" className="approve-button" disabled={savingWindow}>{savingWindow ? 'Saving...' : 'Save Schedule'}</button></div>
                </form>}
                {message && <p className="teacher-dashboard-message">{message}</p>}
                <p className="enrollment-window-note">Dates are inclusive and follow Philippine time. New enrollment submissions are blocked outside this range.</p>
              </section>
            ) : <section className="pending-approvals-panel">
            <div className="pending-approvals-header">
              <h2>Pending Approvals</h2>
              <span className="waiting-badge">
                {enrollments.length} waiting
              </span>
            </div>

            {message && <p className="teacher-dashboard-message">{message}</p>}

            {loading ? (
              <div className="teacher-empty-state"><LoadingSpinner label="Loading applications..." compact /></div>
            ) : enrollments.length === 0 ? (
              <p className="teacher-empty-state">No pending applications.</p>
            ) : (
              <div className="approval-list">
                {enrollments.map((enrollment) => (
                  <article className="approval-row" key={enrollment.id}>
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

                    <div className="review-actions">
                      <button
                        type="button"
                        className="approve-button"
                        disabled={reviewingId === enrollment.id}
                        onClick={() =>
                          updateStatus(enrollment.id, 'approved')
                        }
                      >
                        Accept
                      </button>

                      <button
                        type="button"
                        className="reject-button"
                        disabled={reviewingId === enrollment.id}
                        onClick={() =>
                          updateStatus(enrollment.id, 'rejected')
                        }
                      >
                        Reject
                      </button>
                    </div>
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

export default TeacherDashboard
