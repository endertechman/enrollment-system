import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import AuthToast from './AuthToast'
import ConfirmDialog from './ConfirmDialog'
import TablePagination from './TablePagination'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import { getPhilippineDateValue as getLocalDateValue } from '../lib/philippineDate'

const DAY_MS = 24 * 60 * 60 * 1000
function dateToUtcMs(value) {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}
// Every Monday-Friday from start to end (inclusive). Weekends are skipped because the
// roster only records school weekdays.
function listWeekdays(start, end) {
  const days = []
  for (let time = dateToUtcMs(start); time <= dateToUtcMs(end); time += DAY_MS) {
    const weekday = new Date(time).getUTCDay()
    if (weekday !== 0 && weekday !== 6) days.push(new Date(time).toISOString().slice(0, 10))
  }
  return days
}

const PAGE_SIZE = 10

function parseLocalDate(value) {
  const date = new Date(`${value || getLocalDateValue()}T00:00:00`)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function formatDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getWeekDays(value) {
  const anchor = parseLocalDate(value)
  const monday = new Date(anchor)
  monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7))
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return { value: formatDateValue(date), date }
  })
}

function formatWeekRange(weekDays) {
  if (weekDays.length === 0) return 'Week unavailable'
  const start = weekDays[0].date
  const end = weekDays[weekDays.length - 1].date
  const startLabel = start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

function getChildName(enrollment) {
  const lastName = String(enrollment?.child_last_name || '').trim()
  const givenNames = [enrollment?.child_first_name, enrollment?.child_middle_name, enrollment?.child_suffix]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
  if (lastName && givenNames) return `${lastName}, ${givenNames}`
  return lastName || givenNames || 'Unnamed student'
}

function AttendanceRoster({ enrollments, loading, attendanceDate, onDateChange, batch = null, canEdit = false }) {
  const batchId = batch?.id || ''
  const students = useMemo(
    () => enrollments.filter((enrollment) => enrollment.status === 'approved' && (enrollment.student_state || 'enrolled') === 'enrolled'),
    [enrollments],
  )
  const weekDays = useMemo(() => getWeekDays(attendanceDate), [attendanceDate])
  const [search, setSearch] = useState('')
  const [nameSortDirection, setNameSortDirection] = useState('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const [records, setRecords] = useState({})
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [selectingDay, setSelectingDay] = useState('')
  const [pendingMarkAllDate, setPendingMarkAllDate] = useState('')
  const [selectedSummaryStudent, setSelectedSummaryStudent] = useState(null)
  const [summaryRecords, setSummaryRecords] = useState([])
  const [summaryClassDates, setSummaryClassDates] = useState(() => new Set())
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryMessage, setSummaryMessage] = useState('')
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    if (!term) return students
    return students.filter((student) => getChildName(student).toLocaleLowerCase().includes(term))
  }, [search, students])
  const sortedStudents = useMemo(() => [...filteredStudents].sort((first, second) => {
    const comparison = getChildName(first).localeCompare(getChildName(second), undefined, { sensitivity: 'base' })
    return nameSortDirection === 'asc' ? comparison : -comparison
  }), [filteredStudents, nameSortDirection])
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const visibleStudents = sortedStudents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const loadAttendance = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setRecordsLoading(true)
      setMessage('')
    }

    const attendanceResult = await supabase
      .from('attendance_records')
      .select('enrollment_id, attendance_date, status')
      .gte('attendance_date', weekDays[0].value)
      .lte('attendance_date', weekDays[weekDays.length - 1].value)

    if (attendanceResult.error) {
      setRecords({})
      setMessage('Attendance records are temporarily unavailable.')
    } else {
      setRecords(Object.fromEntries((attendanceResult.data || []).map((record) => [
        `${record.enrollment_id}:${record.attendance_date}`,
        record.status === 'present' ? 'present' : 'absent',
      ])))
    }

    setRecordsLoading(false)
  }, [weekDays])

  useEffect(() => {
    const loadTimer = window.setTimeout(loadAttendance, 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadAttendance])

  useRealtimeRefresh(() => loadAttendance({ silent: true }), {
    channelName: 'attendance-roster',
    tables: ['attendance_records', 'attendance_non_school_days'],
  })

  const today = getLocalDateValue()
  const semesterStart = batch?.starts_on || ''
  const semesterEnd = batch?.ends_on || ''
  const semesterHasStarted = !semesterStart || semesterStart <= today
  const minimumWeekStart = semesterStart ? getWeekDays(semesterStart)[0].value : ''
  const latestAllowedDate = semesterEnd && semesterEnd < today ? semesterEnd : today
  const maximumWeekStart = getWeekDays(latestAllowedDate)[0].value
  const previousWeekDisabled = !semesterHasStarted || Boolean(minimumWeekStart && weekDays[0].value <= minimumWeekStart)
  const nextWeekDisabled = !semesterHasStarted || weekDays[0].value >= maximumWeekStart

  useEffect(() => {
    if (!batchId) return
    const selectedWeekStart = getWeekDays(attendanceDate)[0].value
    const beforeSemester = semesterHasStarted && minimumWeekStart && selectedWeekStart < minimumWeekStart
    const afterAvailableWeeks = selectedWeekStart > maximumWeekStart
    if (beforeSemester) onDateChange(semesterStart)
    else if (afterAvailableWeeks) onDateChange(latestAllowedDate)
  }, [attendanceDate, batchId, latestAllowedDate, maximumWeekStart, minimumWeekStart, onDateChange, semesterHasStarted, semesterStart])

  useEffect(() => {
    if (!selectedSummaryStudent) return undefined
    function closeOnEscape(event) {
      if (event.key === 'Escape') setSelectedSummaryStudent(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedSummaryStudent])

  function isAttendanceDateAvailable(value) {
    return value <= today
      && (!semesterStart || value >= semesterStart)
      && (!semesterEnd || value <= semesterEnd)
  }

  async function syncCountedSchoolDay(recordDate, userId, hasPresentStudent) {
    if (!batchId) return null
    if (hasPresentStudent) {
      const { error } = await supabase
        .from('attendance_non_school_days')
        .delete()
        .eq('batch_id', batchId)
        .eq('attendance_date', recordDate)
      return error
    }

    const { error: clearError } = await supabase
      .from('attendance_non_school_days')
      .delete()
      .eq('batch_id', batchId)
      .eq('attendance_date', recordDate)
    if (clearError) return clearError

    const { error: insertError } = await supabase
      .from('attendance_non_school_days')
      .insert({ batch_id: batchId, attendance_date: recordDate, created_by: userId })
    return insertError
  }

  async function markAttendance(enrollmentId, recordDate, status) {
    if (!canEdit || savingKey || !isAttendanceDateAvailable(recordDate)) return

    const recordKey = `${enrollmentId}:${recordDate}`
    setSavingKey(recordKey)
    setMessage('')
    setNotice('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setMessage('You must be logged in to record attendance.')
      setSavingKey('')
      return
    }

    const nextStatuses = students.map((student) => ({
      enrollment_id: student.id,
      attendance_date: recordDate,
      status: student.id === enrollmentId ? status : records[`${student.id}:${recordDate}`] === 'present' ? 'present' : 'absent',
      recorded_by: user.id,
      updated_at: new Date().toISOString(),
    }))
    const dayAlreadyCounted = students.some((student) => records[`${student.id}:${recordDate}`] === 'present')
    const hasPresentStudent = nextStatuses.some((record) => record.status === 'present')
    const recordsToSave = !dayAlreadyCounted && hasPresentStudent
      ? nextStatuses
      : nextStatuses.filter((record) => record.enrollment_id === enrollmentId)
    const { error } = await supabase
      .from('attendance_records')
      .upsert(recordsToSave, { onConflict: 'enrollment_id,attendance_date' })

    if (error) {
      setMessage(error.message)
    } else {
      const dayStatusError = await syncCountedSchoolDay(recordDate, user.id, hasPresentStudent)
      setRecords((current) => {
        const next = { ...current }
        for (const record of recordsToSave) next[`${record.enrollment_id}:${recordDate}`] = record.status
        return next
      })
      if (dayStatusError) setMessage('Attendance was saved, but the day count could not be updated.')
      else setNotice(hasPresentStudent ? `Attendance marked ${status}.` : 'No students are present, so this day is not counted.')
    }

    setSavingKey('')
  }

  function changeWeek(dayOffset) {
    const nextWeek = new Date(weekDays[0].date)
    nextWeek.setDate(nextWeek.getDate() + dayOffset)
    onDateChange(formatDateValue(nextWeek))
  }

  async function markAllPresent(recordDate) {
    if (!canEdit || selectingDay || students.length === 0 || !isAttendanceDateAvailable(recordDate)) return

    setSelectingDay(recordDate)
    setMessage('')
    setNotice('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setMessage('You must be logged in to record attendance.')
      setSelectingDay('')
      return
    }

    const updatedAt = new Date().toISOString()
    const { error } = await supabase
      .from('attendance_records')
      .upsert(students.map((student) => ({
        enrollment_id: student.id,
        attendance_date: recordDate,
        status: 'present',
        recorded_by: user.id,
        updated_at: updatedAt,
      })), { onConflict: 'enrollment_id,attendance_date' })

    if (error) {
      setMessage(error.message)
    } else {
      const dayStatusError = await syncCountedSchoolDay(recordDate, user.id, true)
      setRecords((current) => {
        const next = { ...current }
        for (const student of students) next[`${student.id}:${recordDate}`] = 'present'
        return next
      })
      if (dayStatusError) setMessage('Attendance was saved, but the day count could not be updated.')
      else setNotice('All active students marked present for this school day.')
    }
    setSelectingDay('')
  }

  async function confirmMarkAllPresent() {
    const recordDate = pendingMarkAllDate
    if (!recordDate) return
    await markAllPresent(recordDate)
    setPendingMarkAllDate('')
  }

  async function openAttendanceSummary(student) {
    setSelectedSummaryStudent(student)
    setSummaryRecords([])
    setSummaryClassDates(new Set())
    setSummaryMessage('')
    setSummaryLoading(true)

    const [attendanceResult, nonSchoolResult, classDaysResult] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('attendance_date, status')
        .eq('enrollment_id', student.id)
        .order('attendance_date', { ascending: false }),
      batchId
        ? supabase.from('attendance_non_school_days').select('attendance_date').eq('batch_id', batchId)
        : Promise.resolve({ data: [], error: null }),
      // The same real class-day list the parent's own Attendance tab uses, so the two totals match.
      batchId
        ? supabase.rpc('list_class_days', { p_batch_id: batchId })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (attendanceResult.error || nonSchoolResult.error || classDaysResult.error) {
      setSummaryMessage('This attendance summary is temporarily unavailable.')
    } else {
      const excludedDates = new Set((nonSchoolResult.data || []).map((row) => row.attendance_date))
      setSummaryRecords((attendanceResult.data || []).filter((record) => !excludedDates.has(record.attendance_date)))
      setSummaryClassDates(new Set((classDaysResult.data || []).map((row) => row.attendance_date)))
    }
    setSummaryLoading(false)
  }

  // Follows the whole semester's schedule, same as the parent's own Attendance tab: days before
  // this child was admitted aren't absences, and a day with no class at all isn't either.
  const summaryDays = useMemo(() => {
    if (!batch?.starts_on || !batch?.ends_on || !selectedSummaryStudent) return []
    const today = getLocalDateValue()
    const approvedOn = selectedSummaryStudent.reviewed_at ? getLocalDateValue(selectedSummaryStudent.reviewed_at) : ''
    const start = batch.starts_on
    const end = today < batch.ends_on ? today : batch.ends_on
    if (start > end) return []
    const recordsByDate = new Map(summaryRecords.map((record) => [record.attendance_date, record]))
    return listWeekdays(start, end).map((date) => {
      if (!summaryClassDates.has(date)) return { date, status: 'no-classes' }
      if (approvedOn && date < approvedOn) return { date, status: 'not-enrolled' }
      return { date, status: recordsByDate.get(date)?.status === 'present' ? 'present' : 'absent' }
    })
  }, [batch, selectedSummaryStudent, summaryClassDates, summaryRecords])
  const summaryCounts = summaryDays.reduce((counts, day) => {
    if (day.status === 'present' || day.status === 'absent') counts[day.status] += 1
    else if (day.status === 'no-classes') counts.noClasses += 1
    return counts
  }, { present: 0, absent: 0, noClasses: 0 })
  const summaryTotalDays = summaryCounts.present + summaryCounts.absent

  return (
    <section className="growth-panel growth-directory-panel attendance-panel">
      {pendingMarkAllDate && <ConfirmDialog
        title="Mark everyone present?"
        message={`This will mark all ${students.length} active students present for ${parseLocalDate(pendingMarkAllDate).toLocaleDateString('en-PH', { dateStyle: 'long' })}.`}
        confirmLabel="Mark All Present"
        tone="primary"
        iconClass="app-icon-check-o"
        busy={selectingDay === pendingMarkAllDate}
        onConfirm={confirmMarkAllPresent}
        onCancel={() => setPendingMarkAllDate('')}
      />}
      {selectedSummaryStudent && <div className="semester-dialog-overlay student-report-overlay attendance-summary-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedSummaryStudent(null) }}>
        <section className="semester-dialog student-report-dialog attendance-summary-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-summary-title">
          <header className="semester-dialog-header">
            <div><h2 id="attendance-summary-title">Attendance Summary</h2><p>Complete recorded attendance for this student.</p></div>
            <button type="button" className="popup-close-button" onClick={() => setSelectedSummaryStudent(null)} aria-label="Close attendance summary"><i className="app-icon app-icon-close" aria-hidden="true" /></button>
          </header>
          <div className="student-report-dialog-body attendance-summary-body">
            {/* Same identity block as the parent's Attendance tab and Child Summary, so the student's
                name sits in the body rather than the dialog header, consistently across all three. */}
            <div className="student-report-identity">
              <div className="student-report-avatar" aria-hidden="true">{selectedSummaryStudent?.child_first_name?.[0] || ''}{selectedSummaryStudent?.child_last_name?.[0] || ''}</div>
              <div><span>Student</span><h3>{getChildName(selectedSummaryStudent)}</h3><p>{selectedSummaryStudent?.reference_code || '—'}</p></div>
            </div>
            {summaryLoading ? <p className="student-report-empty app-loading" role="status">Loading attendance summary...</p> : summaryMessage ? <p className="student-report-message">{summaryMessage}</p> : <section className="student-report-section">
              <div className="student-report-section-heading"><h3>Recorded Days</h3><span>{summaryTotalDays} class {summaryTotalDays === 1 ? 'day' : 'days'}</span></div>
              <dl className="student-report-metrics attendance">
                <div><dt>Present</dt><dd>{summaryCounts.present}</dd></div>
                <div><dt>Absent</dt><dd>{summaryCounts.absent}</dd></div>
                <div><dt>Class Days</dt><dd>{summaryTotalDays}</dd></div>
                <div><dt>No Classes</dt><dd>{summaryCounts.noClasses}</dd></div>
              </dl>
            </section>}
          </div>
        </section>
      </div>}
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      <header className="growth-header"><h2>Attendance</h2></header>
      <div className="growth-directory-heading">
        <span>Weekly Records</span>
      </div>
      <p className="growth-directory-instruction">Record attendance from Monday through Friday. Click a student row to view their attendance summary.</p>

      <div className="growth-directory-toolbar attendance-directory-toolbar">
        <label className="growth-directory-search"><span className="visually-hidden">Filter attendance students</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1) }} placeholder="Filter by student name" /></label>
        <div className="attendance-week-controls" aria-label="Select attendance week">
          <button type="button" onClick={() => changeWeek(-7)} disabled={previousWeekDisabled} aria-label="Previous week" title="Previous week"><i className="app-icon app-icon-chevron-left" aria-hidden="true" /></button>
          <span className="attendance-current-week" aria-live="polite">{formatWeekRange(weekDays)}</span>
          <button type="button" onClick={() => changeWeek(7)} disabled={nextWeekDisabled} aria-label="Next week" title="Next week"><i className="app-icon app-icon-chevron-right" aria-hidden="true" /></button>
        </div>
      </div>

      {message && <p className="teacher-dashboard-message">{message}</p>}

      {loading || recordsLoading ? (
        <p className="teacher-empty-state app-loading" role="status">Loading attendance roster...</p>
      ) : filteredStudents.length === 0 ? (
        <p className="teacher-empty-state">{search.trim() ? 'No students match your filter.' : 'No actively enrolled students are available for attendance.'}</p>
      ) : (
        <div className="records-table-shell attendance-table-shell">
          <table className="records-table growth-records-table attendance-table">
            <caption className="visually-hidden">Attendance roster for {formatWeekRange(weekDays)}</caption>
            <thead><tr><th scope="col" aria-sort={nameSortDirection === 'asc' ? 'ascending' : 'descending'}><button type="button" className="attendance-name-sort" onClick={() => { setNameSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); setCurrentPage(1) }}><span>Name</span><i className={`app-icon ${nameSortDirection === 'asc' ? 'app-icon-sort-az' : 'app-icon-sort-za'}`} aria-hidden="true" /></button></th>{weekDays.map(({ value, date }) => {
              const outsideSemester = Boolean((semesterStart && value < semesterStart) || (semesterEnd && value > semesterEnd))
              const isFuture = value > today
              const hasPresentStudent = students.some((student) => records[`${student.id}:${value}`] === 'present')
              const headerClass = outsideSemester || isFuture ? 'attendance-day-unavailable' : hasPresentStudent ? 'attendance-day-recorded' : 'attendance-day-unrecorded'
              const headerDisabled = !canEdit || outsideSemester || isFuture || !batchId || Boolean(selectingDay)
              return <th scope="col" className={headerClass} key={value}><button type="button" className="attendance-day-toggle" disabled={headerDisabled} onClick={() => setPendingMarkAllDate(value)} aria-label={`${date.toLocaleDateString('en-PH', { dateStyle: 'full' })}. ${hasPresentStudent ? 'This day is counted.' : 'No students are marked present, so this day is not counted.'} Open confirmation to mark all active students present.`}><span>{date.toLocaleDateString('en-PH', { weekday: 'short' })}</span><small>{date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</small></button></th>
            })}</tr></thead>
            <tbody>{visibleStudents.map((student) => <tr className="attendance-student-row" key={student.id} role="button" tabIndex="0" onClick={() => openAttendanceSummary(student)} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAttendanceSummary(student) } }} aria-label={`View attendance summary for ${getChildName(student)}`}>
              <td data-label="Name"><strong className="records-student-name">{getChildName(student)}</strong></td>
              {weekDays.map(({ value, date }) => {
                const recordKey = `${student.id}:${value}`
                const currentStatus = records[recordKey] || ''
                const dayLabel = date.toLocaleDateString('en-PH', { weekday: 'long' })
                const attendanceAvailable = isAttendanceDateAvailable(value)
                return <td data-label={dayLabel} key={value}>
                  {canEdit ? <label className="attendance-checkbox" onClick={(event) => event.stopPropagation()}>
                    <input type="checkbox" checked={attendanceAvailable && currentStatus === 'present'} disabled={!attendanceAvailable || savingKey === recordKey} onChange={(event) => markAttendance(student.id, value, event.target.checked ? 'present' : 'absent')} aria-label={`Mark ${getChildName(student)} present on ${dayLabel}`} />
                  </label> : <input className="attendance-readonly-checkbox" type="checkbox" checked={attendanceAvailable && currentStatus === 'present'} disabled aria-label={`${getChildName(student)} ${currentStatus === 'present' ? 'present' : 'not present'} on ${dayLabel}`} />}
                </td>
              })}
            </tr>)}</tbody>
          </table>
        </div>
      )}

      <TablePagination currentPage={safePage} totalItems={filteredStudents.length} onPageChange={setCurrentPage} pageSize={PAGE_SIZE} ariaLabel="Attendance roster pages" />
      <p className="attendance-note">{canEdit ? 'Check students who are present, or click a date heading and confirm to mark everyone present. A day is counted only when at least one active student is marked present; otherwise it is excluded from attendance totals.' : 'A day is counted only when at least one active student is marked present.'}</p>
    </section>
  )
}

export default AttendanceRoster
