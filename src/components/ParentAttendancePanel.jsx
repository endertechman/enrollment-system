import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import TablePagination from './TablePagination'
import { getPhilippineDateValue } from '../lib/philippineDate'

const PAGE_SIZE = 10
const DAY_MS = 24 * 60 * 60 * 1000

const STATUS_LABELS = {
  present: 'Present',
  absent: 'Absent',
  'no-classes': 'No classes',
  pending: 'Not yet recorded',
}

function childName(student) {
  const lastName = String(student?.child_last_name || '').trim()
  const givenNames = [student?.child_first_name, student?.child_middle_name, student?.child_suffix]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
  return lastName && givenNames ? `${lastName}, ${givenNames}` : lastName || givenNames || 'Unnamed child'
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    weekday: 'short', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function dateToUtcMs(value) {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

// Every Monday–Friday from start to end (inclusive), newest first.
// Weekends are skipped because the teacher roster only records school weekdays.
function listWeekdays(start, end) {
  const days = []
  for (let time = dateToUtcMs(end); time >= dateToUtcMs(start); time -= DAY_MS) {
    const date = new Date(time)
    const weekday = date.getUTCDay()
    if (weekday !== 0 && weekday !== 6) days.push(date.toISOString().slice(0, 10))
  }
  return days
}

function ParentAttendancePanel({ student }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [records, setRecords] = useState([])
  const [nonSchoolDates, setNonSchoolDates] = useState(() => new Set())
  const [classDates, setClassDates] = useState(() => new Set())
  const [semester, setSemester] = useState(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const requestRef = useRef(0)
  const enrollmentId = student?.id || ''
  const batchId = student?.batch_id || ''

  const loadRecords = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestRef.current
    if (!enrollmentId || !batchId) {
      setRecords([])
      setMessage('Attendance records are unavailable for this child.')
      setLoading(false)
      return
    }

    if (!silent) {
      setLoading(true)
      setMessage('')
    }

    const [attendanceResult, nonSchoolResult, batchResult, classDaysResult] = await Promise.all([
      supabase.from('attendance_records')
        .select('id, attendance_date, status')
        .eq('enrollment_id', enrollmentId),
      supabase.from('attendance_non_school_days')
        .select('attendance_date')
        .eq('batch_id', batchId),
      supabase.from('enrollment_batches')
        .select('starts_on, ends_on')
        .eq('id', batchId)
        .maybeSingle(),
      supabase.rpc('list_class_days', { p_batch_id: batchId }),
    ])

    if (requestId !== requestRef.current) return
    if (attendanceResult.error || nonSchoolResult.error || batchResult.error || classDaysResult.error || !batchResult.data) {
      setRecords([])
      setMessage('Attendance records are temporarily unavailable.')
    } else {
      setRecords(attendanceResult.data || [])
      setNonSchoolDates(new Set((nonSchoolResult.data || []).map((row) => row.attendance_date)))
      setClassDates(new Set((classDaysResult.data || []).map((row) => row.attendance_date)))
      setSemester(batchResult.data)
      setMessage('')
    }
    setLoading(false)
  }, [batchId, enrollmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => loadRecords(), 0)
    return () => {
      window.clearTimeout(timer)
      requestRef.current += 1
    }
  }, [loadRecords])

  useRealtimeRefresh(() => loadRecords({ silent: true }), {
    channelName: `parent-attendance-${enrollmentId || 'none'}`,
    tables: ['attendance_records', 'attendance_non_school_days'],
    enabled: Boolean(enrollmentId && batchId),
    pollMs: 30000,
  })

  const days = useMemo(() => {
    if (!semester?.starts_on || !semester?.ends_on) return []

    const today = getPhilippineDateValue()
    const recordsByDate = new Map(records.map((record) => [record.attendance_date, record]))

    // Every child is measured against the semester's own dates, not the date they were admitted,
    // so a student who joins mid-semester is counted on every class day since the semester began.
    const start = semester.starts_on
    const end = today < semester.ends_on ? today : semester.ends_on
    if (start > end) return []

    return listWeekdays(start, end).map((date) => {
      // A day is a class day only when at least one student in the class was present.
      // On a class day, anyone not marked present is absent (even without a saved row).
      let status = 'no-classes'
      if (!nonSchoolDates.has(date)) {
        if (classDates.has(date)) status = recordsByDate.get(date)?.status === 'present' ? 'present' : 'absent'
        else if (date === today) status = 'pending'
      }
      return { date, status }
    })
  }, [classDates, nonSchoolDates, records, semester])

  const count = (status) => days.filter((day) => day.status === status).length
  const presentCount = count('present')
  const absentCount = count('absent')
  const noClassesCount = count('no-classes')
  const classDays = presentCount + absentCount
  const totalDays = days.length
  const pageCount = Math.max(1, Math.ceil(totalDays / PAGE_SIZE))
  const safePage = Math.min(currentPage, pageCount)
  const visibleDays = days.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <section className="student-report-panel parent-attendance-panel" aria-labelledby="parent-attendance-title">
      <header className="student-report-header"><h2 id="parent-attendance-title">Attendance</h2></header>
      <div className="student-report-identity">
        <div className="student-report-avatar" aria-hidden="true">{student?.child_first_name?.[0] || ''}{student?.child_last_name?.[0] || ''}</div>
        <div><span>Child attendance record</span><h3>{childName(student)}</h3><p>{student?.reference_code || '—'}</p></div>
      </div>

      {message && <p className="student-report-message" role="status">{message}</p>}
      {loading ? <p className="student-report-empty app-loading" role="status">Loading attendance records...</p> : !message && <div className="student-report-body">
        <section className="student-report-section">
          <div className="student-report-section-heading"><h3>Attendance Summary</h3><span>{classDays} class {classDays === 1 ? 'day' : 'days'}</span></div>
          <dl className="student-report-metrics attendance">
            <div><dt>Present</dt><dd>{presentCount}</dd></div>
            <div><dt>Absent</dt><dd>{absentCount}</dd></div>
            <div><dt>Class Days</dt><dd>{classDays}</dd></div>
            <div><dt>No Classes</dt><dd>{noClassesCount}</dd></div>
          </dl>
        </section>

        <section className="student-report-section parent-attendance-history">
          <div className="student-report-section-heading"><h3>Daily Attendance</h3><span>{totalDays} {totalDays === 1 ? 'day' : 'days'}</span></div>
          {days.length === 0 ? <p className="student-report-empty">Daily attendance will appear here once classes begin.</p> : <div className="records-table-shell parent-attendance-table-shell">
            <table className="records-table parent-attendance-table">
              <caption className="visually-hidden">Daily attendance for {childName(student)}</caption>
              <thead><tr><th scope="col">Date</th><th scope="col">Status</th></tr></thead>
              <tbody>{visibleDays.map((day) => <tr key={day.date} className={`parent-attendance-row parent-attendance-row-${day.status}`}>
                <td data-label="Date">{formatDate(day.date)}</td>
                <td data-label="Status"><span className={`attendance-status attendance-status-${day.status}`}>{STATUS_LABELS[day.status] || 'Absent'}</span></td>
              </tr>)}</tbody>
            </table>
          </div>}
          <TablePagination currentPage={safePage} totalItems={totalDays} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} ariaLabel="Daily attendance pages" />
          <p className="parent-attendance-note">Days when no student was present are shown as “No classes”. Weekends are not listed.</p>
        </section>
      </div>}
    </section>
  )
}

export default ParentAttendancePanel
