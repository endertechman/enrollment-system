import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import TablePagination from './TablePagination'

const PAGE_SIZE = 10

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
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function ParentAttendancePanel({ student }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [records, setRecords] = useState([])
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

    const [attendanceResult, nonSchoolResult] = await Promise.all([
      supabase.from('attendance_records')
        .select('id, attendance_date, status')
        .eq('enrollment_id', enrollmentId)
        .order('attendance_date', { ascending: false }),
      supabase.from('attendance_non_school_days')
        .select('attendance_date')
        .eq('batch_id', batchId),
    ])

    if (requestId !== requestRef.current) return
    if (attendanceResult.error || nonSchoolResult.error) {
      setRecords([])
      setMessage('Attendance records are temporarily unavailable.')
    } else {
      const excludedDates = new Set((nonSchoolResult.data || []).map((row) => row.attendance_date))
      setRecords((attendanceResult.data || []).filter((record) => !excludedDates.has(record.attendance_date)))
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
  })

  const presentCount = records.filter((record) => record.status === 'present').length
  const totalDays = records.length
  const absentCount = totalDays - presentCount
  const pageCount = Math.max(1, Math.ceil(totalDays / PAGE_SIZE))
  const safePage = Math.min(currentPage, pageCount)
  const visibleRecords = records.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

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
          <div className="student-report-section-heading"><h3>Attendance Summary</h3><span>{totalDays} school days</span></div>
          <dl className="student-report-metrics attendance">
            <div><dt>Present</dt><dd>{presentCount}</dd></div>
            <div><dt>Absent</dt><dd>{absentCount}</dd></div>
            <div><dt>Total Days</dt><dd>{totalDays}</dd></div>
            <div><dt>Present / Total</dt><dd>{totalDays ? `${presentCount} / ${totalDays}` : '—'}</dd></div>
          </dl>
        </section>

        <section className="student-report-section parent-attendance-history">
          <div className="student-report-section-heading"><h3>Attendance History</h3><span>{totalDays} {totalDays === 1 ? 'record' : 'records'}</span></div>
          {records.length === 0 ? <p className="student-report-empty">No attendance has been recorded for this child yet.</p> : <div className="records-table-shell parent-attendance-table-shell">
            <table className="records-table parent-attendance-table">
              <caption className="visually-hidden">Attendance history for {childName(student)}</caption>
              <thead><tr><th scope="col">Date Recorded</th><th scope="col">Status</th></tr></thead>
              <tbody>{visibleRecords.map((record) => <tr key={record.id}>
                <td data-label="Date Recorded">{formatDate(record.attendance_date)}</td>
                <td data-label="Status">{record.status === 'present' ? 'Present' : 'Absent'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <TablePagination currentPage={safePage} totalItems={totalDays} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} ariaLabel="Child attendance record pages" />
        </section>
      </div>}
    </section>
  )
}

export default ParentAttendancePanel
