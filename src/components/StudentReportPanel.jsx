import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import { classifyChildBmi } from '../lib/bmiClassification'
import ConfirmDialog from './ConfirmDialog'

function childName(student) {
  const lastName = String(student?.child_last_name || '').trim()
  const givenNames = [student?.child_first_name, student?.child_middle_name, student?.child_suffix]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
  if (lastName && givenNames) return `${lastName}, ${givenNames}`
  return lastName || givenNames || 'Unnamed student'
}

function calculateAge(birthDate) {
  if (!birthDate) return '—'
  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return '—'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDifference = today.getMonth() - birth.getMonth()
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) age -= 1
  return Math.max(age, 0)
}

function calculateBmi(heightCm, weightKg) {
  const height = Number(heightCm)
  const weight = Number(weightKg)
  if (!Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) return '—'
  return (weight / ((height / 100) ** 2)).toFixed(1)
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatValue(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

function formatPlaceOfBirth(value) {
  if (value === null || value === undefined || value === '') return '—'
  return String(value).replace(/,\s*Philippines\s*$/i, '').trim()
}

function StudentReportPanel({ enrollments, allowStudentSelection = false, parentName = '', parentEmail = '', onBack = null, onClose = null, canManageStatus = false, updatingStatusId = null, onStatusChange = null }) {
  const students = useMemo(
    () => enrollments.filter((item) => item.status === 'approved'),
    [enrollments],
  )
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [attendance, setAttendance] = useState([])
  const [growthRecords, setGrowthRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingStatus, setPendingStatus] = useState('')

  const activeEnrollmentId = useMemo(
    () => students.some((item) => item.id === selectedEnrollmentId)
      ? selectedEnrollmentId
      : students[0]?.id || null,
    [selectedEnrollmentId, students],
  )
  const student = students.find((item) => item.id === activeEnrollmentId) || null
  const studentSuggestions = useMemo(() => {
    const searchTerm = studentSearch.trim().toLocaleLowerCase()
    const matches = searchTerm
      ? students.filter((item) => [childName(item), item.parent_full_name, item.reference_code]
          .some((value) => String(value || '').toLocaleLowerCase().includes(searchTerm)))
      : students
    return matches.slice(0, 8)
  }, [studentSearch, students])

  function selectStudent(item) {
    setSelectedEnrollmentId(item.id)
    setStudentSearch('')
    setPickerOpen(false)
  }

  const loadReport = useCallback(async ({ silent = false } = {}) => {
    if (!activeEnrollmentId) {
      setAttendance([])
      setGrowthRecords([])
      setLoading(false)
      return
    }

    if (!silent) {
      setLoading(true)
      setMessage('')
    }

    const [attendanceResult, growthResult, nonSchoolResult] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('id, attendance_date, status')
        .eq('enrollment_id', activeEnrollmentId)
        .order('attendance_date', { ascending: false }),
      supabase
        .from('growth_records')
        .select('id, measured_on, height_cm, weight_kg')
        .eq('enrollment_id', activeEnrollmentId)
        .order('measured_on', { ascending: false }),
      student?.batch_id
        ? supabase
          .from('attendance_non_school_days')
          .select('attendance_date')
          .eq('batch_id', student.batch_id)
        : Promise.resolve({ data: [], error: null }),
    ])

    const excludedDates = new Set((nonSchoolResult.data || []).map((row) => row.attendance_date))
    setAttendance((attendanceResult.data || []).filter((record) => !excludedDates.has(record.attendance_date)))
    setGrowthRecords(growthResult.data || [])
    if (attendanceResult.error || growthResult.error || nonSchoolResult.error) {
      setMessage('Some report details are temporarily unavailable.')
    } else {
      setMessage('')
    }
    setLoading(false)
  }, [activeEnrollmentId, student])

  useEffect(() => {
    const loadTimer = window.setTimeout(loadReport, 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadReport])

  useEffect(() => {
    if (!onClose) return undefined
    function closeOnEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useRealtimeRefresh(() => loadReport({ silent: true }), {
    channelName: `student-report-${activeEnrollmentId || 'none'}`,
    tables: ['attendance_records', 'attendance_non_school_days', 'growth_records'],
    enabled: Boolean(activeEnrollmentId),
  })

  const attendanceCounts = attendance.reduce((counts, record) => {
    const status = record.status === 'present' ? 'present' : 'absent'
    counts[status] += 1
    return counts
  }, { present: 0, absent: 0 })
  const totalAttendanceDays = attendance.length
  const presentAttendanceFraction = totalAttendanceDays > 0
    ? `${attendanceCounts.present} / ${totalAttendanceDays}`
    : '—'
  const latestGrowth = growthRecords[0] || null
  const reportHeight = latestGrowth?.height_cm
  const reportWeight = latestGrowth?.weight_kg
  const reportBmi = calculateBmi(reportHeight, reportWeight)
  const reportClassification = reportBmi === '—' ? null : classifyChildBmi({
    bmi: reportBmi,
    sex: student?.sex,
    birthDate: student?.birth_date,
    measuredAt: latestGrowth?.measured_on ?? student?.submitted_at ?? new Date(),
  })
  const currentStudentStatus = student?.student_state || 'enrolled'

  async function confirmStatusChange() {
    if (!student || !pendingStatus || !onStatusChange) return
    await onStatusChange(student.id, pendingStatus)
    setPendingStatus('')
  }

  const pendingStatusCopy = pendingStatus === 'enrolled'
    ? {
        title: 'Enroll student again?',
        message: `${childName(student)} will return to active enrolled status. Their existing records will remain available.`,
        label: 'Enroll Student Again',
        tone: 'primary',
        icon: 'app-icon-check-o',
      }
    : {
        title: pendingStatus === 'withdrawn' ? 'Withdraw student?' : 'Drop student?',
        message: `${childName(student)} will be marked as ${pendingStatus || 'inactive'}. Their enrollment and historical records will not be deleted.`,
        label: pendingStatus === 'withdrawn' ? 'Withdraw Student' : 'Drop Student',
        tone: 'danger',
        icon: 'app-icon-user-list',
      }

  const reportPanel = (
    <section className={onClose ? 'semester-dialog student-report-dialog' : 'student-report-panel'} role={onClose ? 'dialog' : undefined} aria-modal={onClose ? 'true' : undefined} aria-labelledby="student-report-title">
      <header className={onClose ? 'semester-dialog-header' : 'student-report-header'}>
        <div><h2 id="student-report-title">{onClose ? 'Full Details' : 'Student Report'}</h2>{onClose && <p>Complete student information and latest records.</p>}</div>
        {onClose ? <button type="button" className="popup-close-button" onClick={onClose} aria-label="Close student report"><i className="app-icon app-icon-close" aria-hidden="true" /></button> : onBack && <button type="button" className="student-report-back" onClick={onBack}>Back to students</button>}
      </header>

      <div className={onClose ? 'student-report-dialog-body' : undefined}>
      {students.length === 0 ? (
        <p className="student-report-empty">No enrolled student is available for a report yet.</p>
      ) : (
        <>
          {allowStudentSelection && (
            <div className="student-report-picker">
              <label htmlFor="report-student">Student</label>
              <div
                className="student-report-search"
                onBlur={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget)) return
                  setStudentSearch('')
                  setPickerOpen(false)
                }}
              >
                <div className="student-report-search-control">
                  <input
                    id="report-student"
                    type="search"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={pickerOpen}
                    aria-controls="report-student-suggestions"
                    value={pickerOpen ? studentSearch : childName(student)}
                    placeholder="Search by student, parent, or reference code"
                    autoComplete="off"
                    onFocus={() => {
                      setStudentSearch('')
                      setPickerOpen(true)
                    }}
                    onClick={() => {
                      setStudentSearch('')
                      setPickerOpen(true)
                    }}
                    onChange={(event) => {
                      setStudentSearch(event.target.value)
                      setPickerOpen(true)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.currentTarget.blur()
                      } else if (event.key === 'Enter' && studentSuggestions.length > 0) {
                        event.preventDefault()
                        selectStudent(studentSuggestions[0])
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setStudentSearch('')
                      setPickerOpen(true)
                    }}
                  >Change</button>
                </div>
                {pickerOpen && (
                  <div id="report-student-suggestions" className="student-report-suggestions" role="listbox">
                    {studentSuggestions.length === 0 ? (
                      <p>No enrolled students found.</p>
                    ) : studentSuggestions.map((item) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={item.id === activeEnrollmentId}
                        key={item.id}
                        onClick={() => selectStudent(item)}
                      >
                        <span>{childName(item)}</span>
                        <small>{item.parent_full_name || item.reference_code || 'Enrolled student'}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!onClose && <div className="student-report-identity">
            <div className="student-report-avatar" aria-hidden="true">
              {(student?.child_first_name?.[0] || '')}{(student?.child_last_name?.[0] || '')}
            </div>
            <div>
              <span>Student summary</span>
              <h3>{childName(student)}</h3>
              <p>{formatValue(student?.reference_code)}</p>
            </div>
            <span className="enrollment-status approved">enrolled</span>
          </div>}

          {message && <p className="student-report-message">{message}</p>}
          {loading ? (
            <p className="student-report-empty app-loading" role="status">Preparing student report...</p>
          ) : (
            <div className="student-report-body">
              <section className="student-report-section">
                <div className="student-report-section-heading"><h3>Child Information</h3></div>
                <dl className="student-report-grid">
                  <div><dt>Last Name</dt><dd>{formatValue(student?.child_last_name)}</dd></div>
                  <div><dt>First Name</dt><dd>{formatValue(student?.child_first_name)}</dd></div>
                  <div><dt>Middle Name</dt><dd>{formatValue(student?.child_middle_name)}</dd></div>
                  <div><dt>Reference Code</dt><dd>{formatValue(student?.reference_code)}</dd></div>
                  <div><dt>Age</dt><dd>{calculateAge(student?.birth_date)}</dd></div>
                  <div><dt>Date of Birth</dt><dd>{formatDate(student?.birth_date)}</dd></div>
                  <div><dt>Gender</dt><dd>{student?.sex ? `${student.sex.charAt(0).toUpperCase()}${student.sex.slice(1)}` : '—'}</dd></div>
                  <div><dt>Student Status</dt><dd>{student?.student_state ? `${student.student_state.charAt(0).toUpperCase()}${student.student_state.slice(1)}` : 'Enrolled'}</dd></div>
                  <div><dt>Parent / Guardian</dt><dd>{student?.parent_full_name || parentName || '—'}</dd></div>
                  <div><dt>Parent Email</dt><dd>{student?.parent_email || parentEmail || '—'}</dd></div>
                  <div><dt>Place of Birth</dt><dd>{formatPlaceOfBirth(student?.place_of_birth)}</dd></div>
                  <div><dt>Registered</dt><dd>{typeof student?.is_registered === 'boolean' ? (student.is_registered ? 'Yes' : 'No') : '—'}</dd></div>
                  <div><dt>Mother Tongue</dt><dd>{formatValue(student?.mother_tongue)}</dd></div>
                  <div><dt>Other Dialect</dt><dd>{formatValue(student?.other_dialect)}</dd></div>
                </dl>
                {canManageStatus && <div className="student-status-actions" aria-label="Update student status">
                  {currentStudentStatus === 'enrolled' ? <>
                    <button type="button" className="student-status-action danger" disabled={updatingStatusId === student?.id} onClick={() => setPendingStatus('withdrawn')}>Withdraw Student</button>
                    <button type="button" className="student-status-action danger" disabled={updatingStatusId === student?.id} onClick={() => setPendingStatus('dropped')}>Drop Student</button>
                  </> : <button type="button" className="student-status-action primary" disabled={updatingStatusId === student?.id} onClick={() => setPendingStatus('enrolled')}>Enroll Student Again</button>}
                </div>}
              </section>

              <section className="student-report-section">
                <div className="student-report-section-heading">
                  <h3>Health &amp; Growth</h3>
                  <span>{latestGrowth ? `Updated ${formatDate(latestGrowth.measured_on)}` : 'Enrollment measurement'}</span>
                </div>
                <dl className="student-report-metrics">
                  <div><dt>Height</dt><dd>{reportHeight ? `${Number(reportHeight).toFixed(1)} cm` : '—'}</dd></div>
                  <div><dt>Weight</dt><dd>{reportWeight ? `${Number(reportWeight).toFixed(1)} kg` : '—'}</dd></div>
                  <div className="student-report-bmi"><dt>BMI</dt><dd>{reportBmi}<small data-tone={reportClassification?.tone || 'unavailable'}>{reportClassification?.label || 'Classification unavailable'}</small></dd></div>
                  <div><dt>Measurements</dt><dd>{growthRecords.length}</dd></div>
                </dl>
                <p className="student-report-health-note">BMI-for-age is a screening classification based on Philippine use of WHO child growth standards.</p>
              </section>

              <section className="student-report-section">
                <div className="student-report-section-heading">
                  <h3>Attendance Summary</h3>
                  <span>{totalAttendanceDays} recorded days</span>
                </div>
                <dl className="student-report-metrics attendance">
                  <div><dt>Present</dt><dd>{attendanceCounts.present}</dd></div>
                  <div><dt>Absent</dt><dd>{attendanceCounts.absent}</dd></div>
                  <div><dt>Total Days Recorded</dt><dd>{totalAttendanceDays}</dd></div>
                  <div><dt>Present / Total</dt><dd>{presentAttendanceFraction}</dd></div>
                </dl>
              </section>
            </div>
          )}
        </>
      )}
      </div>
    </section>
  )

  if (!onClose) return reportPanel

  return <div className="semester-dialog-overlay student-report-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>{reportPanel}{pendingStatus && <ConfirmDialog title={pendingStatusCopy.title} message={pendingStatusCopy.message} confirmLabel={pendingStatusCopy.label} tone={pendingStatusCopy.tone} iconClass={pendingStatusCopy.icon} busy={updatingStatusId === student?.id} onConfirm={confirmStatusChange} onCancel={() => setPendingStatus('')} />}</div>
}

export default StudentReportPanel
