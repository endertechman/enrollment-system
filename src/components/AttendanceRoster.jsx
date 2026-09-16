import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from './LoadingSpinner'
import AuthToast from './AuthToast'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

function getLocalDateValue() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

function getChildName(enrollment) {
  return [
    enrollment.child_first_name,
    enrollment.child_last_name,
    enrollment.child_suffix,
  ].filter(Boolean).join(' ')
}

const attendanceOptions = [
  ['present', 'Present'],
  ['absent', 'Absent'],
  ['late', 'Late'],
]

function AttendanceRoster({ enrollments, loading, attendanceDate, onDateChange, canEdit = false }) {
  const students = enrollments.filter((enrollment) => enrollment.status === 'approved')
  const [records, setRecords] = useState({})
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const loadAttendance = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setRecordsLoading(true)
      setMessage('')
    }

    const { data, error } = await supabase
      .from('attendance_records')
      .select('enrollment_id, status')
      .eq('attendance_date', attendanceDate)

    if (error) {
      setRecords({})
      setMessage('Attendance is unavailable until its Supabase migration is applied.')
    } else {
      setRecords(Object.fromEntries((data || []).map((record) => [record.enrollment_id, record.status])))
    }

    setRecordsLoading(false)
  }, [attendanceDate])

  useEffect(() => {
    const loadTimer = window.setTimeout(loadAttendance, 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadAttendance])

  useRealtimeRefresh(() => loadAttendance({ silent: true }), {
    channelName: 'attendance-roster',
    tables: ['attendance_records'],
  })

  async function markAttendance(enrollmentId, status) {
    if (!canEdit || savingId) return

    setSavingId(enrollmentId)
    setMessage('')
    setNotice('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setMessage('You must be logged in to record attendance.')
      setSavingId(null)
      return
    }

    const { error } = await supabase
      .from('attendance_records')
      .upsert({
        enrollment_id: enrollmentId,
        attendance_date: attendanceDate,
        status,
        recorded_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'enrollment_id,attendance_date' })

    if (error) {
      setMessage(error.message)
    } else {
      setRecords((current) => ({ ...current, [enrollmentId]: status }))
      setNotice(`Attendance marked ${status}.`)
    }

    setSavingId(null)
  }

  return (
    <section className="pending-approvals-panel attendance-panel">
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      <div className="pending-approvals-header attendance-header">
        <div><h2>Attendance</h2></div>
      </div>
      <div className="dashboard-panel-meta"><span className="waiting-badge">{students.length} students</span></div>

      <div className="attendance-toolbar">
        <label htmlFor="attendance-date">School day</label>
        <input
          id="attendance-date"
          type="date"
          value={attendanceDate || getLocalDateValue()}
          onChange={(event) => onDateChange(event.target.value)}
        />
      </div>

      {message && <p className="teacher-dashboard-message">{message}</p>}

      {loading || recordsLoading ? (
        <div className="teacher-empty-state"><LoadingSpinner label="Loading attendance roster..." compact /></div>
      ) : students.length === 0 ? (
        <p className="teacher-empty-state">No accepted students are available for attendance yet.</p>
      ) : (
        <div className="attendance-list">
          {students.map((student) => (
            <article className="attendance-row" key={student.id}>
              <div>
                <h3>{getChildName(student)}</h3>
                <p>{student.reference_code || 'No reference code'}</p>
              </div>
              {canEdit ? (
                <div className="attendance-options" aria-label={`Attendance for ${getChildName(student)}`}>
                  {attendanceOptions.map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      data-status={value}
                      className={records[student.id] === value ? 'active' : ''}
                      disabled={savingId === student.id}
                      onClick={() => markAttendance(student.id, value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <span className={`attendance-value ${records[student.id] || 'unrecorded'}`}>
                  {records[student.id] ? records[student.id][0].toUpperCase() + records[student.id].slice(1) : 'Not recorded'}
                </span>
              )}
            </article>
          ))}
        </div>
      )}

      <p className="attendance-note">{canEdit ? 'Changes save automatically for the selected school day.' : 'Teacher aides can view attendance but cannot change it.'}</p>
    </section>
  )
}

export default AttendanceRoster
