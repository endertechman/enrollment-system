import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import { classifyChildBmi } from '../lib/bmiClassification'
import { getAgeInYears, getPhilippineDateValue } from '../lib/philippineDate'
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
  return getAgeInYears(birthDate) ?? '—'
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
  return String(value).trim()
}

function StudentReportPanel({ enrollments, allowStudentSelection = false, includeUnapproved = false, parentName = '', parentEmail = '', title = 'Student Report', onBack = null, onClose = null, canManageStatus = false, updatingStatusId = null, onStatusChange = null, canEditStudentInfo = false, onStudentInfoUpdated = null }) {
  const students = useMemo(
    () => enrollments.filter((item) => includeUnapproved || item.status === 'approved'),
    [enrollments, includeUnapproved],
  )
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [attendance, setAttendance] = useState([])
  const [attendanceUnavailable, setAttendanceUnavailable] = useState(false)
  const [growthRecords, setGrowthRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingStatus, setPendingStatus] = useState('')
  const [editingStudentInfo, setEditingStudentInfo] = useState(false)
  const [studentInfoDraft, setStudentInfoDraft] = useState(null)
  const [confirmStudentInfo, setConfirmStudentInfo] = useState(false)
  const [savingStudentInfo, setSavingStudentInfo] = useState(false)
  const [studentInfoError, setStudentInfoError] = useState('')
  const reportRequestId = useRef(0)

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
    setEditingStudentInfo(false)
    setStudentInfoDraft(null)
    setConfirmStudentInfo(false)
    setStudentInfoError('')
  }

  const loadReport = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++reportRequestId.current
    if (!activeEnrollmentId || student?.status !== 'approved') {
      setAttendance([])
      setAttendanceUnavailable(false)
      setGrowthRecords([])
      setMessage('')
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

    if (requestId !== reportRequestId.current) return

    const attendanceFailed = Boolean(attendanceResult.error || nonSchoolResult.error)
    const excludedDates = new Set((nonSchoolResult.data || []).map((row) => row.attendance_date))
    setAttendance(attendanceFailed ? [] : (attendanceResult.data || []).filter((record) => !excludedDates.has(record.attendance_date)))
    setAttendanceUnavailable(attendanceFailed)
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
    return () => {
      window.clearTimeout(loadTimer)
      reportRequestId.current += 1
    }
  }, [loadReport])

  useEffect(() => {
    if (!onClose) return undefined
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !confirmStudentInfo && !pendingStatus && !savingStudentInfo) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [confirmStudentInfo, onClose, pendingStatus, savingStudentInfo])

  useRealtimeRefresh(() => loadReport({ silent: true }), {
    channelName: `student-report-${activeEnrollmentId || 'none'}`,
    tables: ['attendance_records', 'attendance_non_school_days', 'growth_records'],
    enabled: Boolean(activeEnrollmentId && student?.status === 'approved'),
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
  const studentBadgeTone = student?.status === 'approved' && ['withdrawn', 'dropped'].includes(student?.student_state)
    ? student.student_state
    : student?.status || 'pending'

  async function confirmStatusChange() {
    if (!student || !pendingStatus || !onStatusChange) return
    await onStatusChange(student.id, pendingStatus)
    setPendingStatus('')
  }

  function beginStudentInfoEdit() {
    if (!student || !canEditStudentInfo) return
    setStudentInfoDraft({
      child_first_name: student.child_first_name || '',
      child_middle_name: student.child_middle_name || '',
      child_last_name: student.child_last_name || '',
      child_suffix: student.child_suffix || '',
      birth_date: student.birth_date || '',
      sex: student.sex || '',
      place_of_birth: formatPlaceOfBirth(student.place_of_birth) === '—' ? '' : formatPlaceOfBirth(student.place_of_birth),
      is_registered: typeof student.is_registered === 'boolean' ? String(student.is_registered) : '',
      mother_tongue: student.mother_tongue || '',
      other_dialect: student.other_dialect || '',
    })
    setStudentInfoError('')
    setEditingStudentInfo(true)
  }

  function updateStudentInfoDraft(field, value) {
    setStudentInfoDraft((current) => ({ ...current, [field]: value }))
  }

  function requestStudentInfoSave() {
    const requiredFields = [
      ['child_first_name', 'First name'],
      ['child_last_name', 'Last name'],
      ['birth_date', 'Date of birth'],
      ['sex', 'Gender'],
      ['place_of_birth', 'Place of birth'],
      ['is_registered', 'Registration status'],
      ['mother_tongue', 'Mother tongue'],
    ]
    const missingField = requiredFields.find(([field]) => !String(studentInfoDraft?.[field] ?? '').trim())
    if (missingField) {
      setStudentInfoError(`${missingField[1]} is required.`)
      return
    }
    if (studentInfoDraft.birth_date > getPhilippineDateValue()) {
      setStudentInfoError('Date of birth cannot be in the future.')
      return
    }
    setStudentInfoError('')
    setConfirmStudentInfo(true)
  }

  async function saveStudentInfo() {
    if (!student || !studentInfoDraft || savingStudentInfo) return
    setSavingStudentInfo(true)

    const updates = {
      child_first_name: studentInfoDraft.child_first_name.trim(),
      child_middle_name: studentInfoDraft.child_middle_name.trim() || null,
      child_last_name: studentInfoDraft.child_last_name.trim(),
      child_suffix: studentInfoDraft.child_suffix.trim() || null,
      birth_date: studentInfoDraft.birth_date,
      sex: studentInfoDraft.sex,
      place_of_birth: studentInfoDraft.place_of_birth.trim(),
      is_registered: studentInfoDraft.is_registered === 'true',
      mother_tongue: studentInfoDraft.mother_tongue.trim(),
      other_dialect: studentInfoDraft.other_dialect.trim() || null,
    }

    const { data, error } = await supabase
      .from('enrollments')
      .update(updates)
      .eq('id', student.id)
      .eq('status', 'approved')
      .select('id, child_first_name, child_middle_name, child_last_name, child_suffix, birth_date, sex, place_of_birth, is_registered, mother_tongue, other_dialect')
      .maybeSingle()

    if (error || !data) {
      setStudentInfoError(error?.message || 'Student information could not be updated.')
      setConfirmStudentInfo(false)
      setSavingStudentInfo(false)
      return
    }

    onStudentInfoUpdated?.(student.id, data)
    setEditingStudentInfo(false)
    setStudentInfoDraft(null)
    setConfirmStudentInfo(false)
    setSavingStudentInfo(false)
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
        tone: pendingStatus === 'withdrawn' ? 'primary' : 'danger',
        icon: 'app-icon-user-list',
      }

  const reportPanel = (
    <section className={onClose ? 'semester-dialog student-report-dialog' : 'student-report-panel'} role={onClose ? 'dialog' : undefined} aria-modal={onClose ? 'true' : undefined} aria-labelledby="student-report-title">
      <header className={onClose ? 'semester-dialog-header' : 'student-report-header'}>
        <div><h2 id="student-report-title">{onClose ? 'Full Details' : title}</h2>{onClose && <p>Complete student information and latest records.</p>}</div>
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
            <span className={`enrollment-status ${studentBadgeTone}`}>{student?.status === 'approved' ? student.student_state || 'enrolled' : student?.status === 'rejected' ? 'needs changes' : 'pending review'}</span>
          </div>}

          {message && <p className="student-report-message">{message}</p>}
          {loading ? (
            <p className="student-report-empty app-loading" role="status">Preparing student report...</p>
          ) : (
            <div className="student-report-body">
              <section className="student-report-section">
                <div className="student-report-section-heading">
                  <h3>Child Information</h3>
                  {canEditStudentInfo && !editingStudentInfo && <button type="button" className="student-info-edit-button" onClick={beginStudentInfoEdit} aria-label="Edit student information"><i className="app-icon app-icon-pen" aria-hidden="true" /><span>Edit</span></button>}
                </div>
                <dl className="student-report-grid">
                  <div><dt>Last Name</dt><dd>{editingStudentInfo ? <input value={studentInfoDraft?.child_last_name || ''} onChange={(event) => updateStudentInfoDraft('child_last_name', event.target.value)} maxLength="50" aria-label="Last name" /> : formatValue(student?.child_last_name)}</dd></div>
                  <div><dt>First Name</dt><dd>{editingStudentInfo ? <input value={studentInfoDraft?.child_first_name || ''} onChange={(event) => updateStudentInfoDraft('child_first_name', event.target.value)} maxLength="50" aria-label="First name" /> : formatValue(student?.child_first_name)}</dd></div>
                  <div><dt>Middle Name</dt><dd>{editingStudentInfo ? <input value={studentInfoDraft?.child_middle_name || ''} onChange={(event) => updateStudentInfoDraft('child_middle_name', event.target.value)} maxLength="50" aria-label="Middle name" /> : formatValue(student?.child_middle_name)}</dd></div>
                  {editingStudentInfo && <div><dt>Suffix</dt><dd><input value={studentInfoDraft?.child_suffix || ''} onChange={(event) => updateStudentInfoDraft('child_suffix', event.target.value)} maxLength="20" aria-label="Suffix" /></dd></div>}
                  <div><dt>Reference Code</dt><dd>{formatValue(student?.reference_code)}</dd></div>
                  <div><dt>Age</dt><dd>{calculateAge(editingStudentInfo ? studentInfoDraft?.birth_date : student?.birth_date)}</dd></div>
                  <div><dt>Date of Birth</dt><dd>{editingStudentInfo ? <input type="date" value={studentInfoDraft?.birth_date || ''} max={getPhilippineDateValue()} onChange={(event) => updateStudentInfoDraft('birth_date', event.target.value)} aria-label="Date of birth" /> : formatDate(student?.birth_date)}</dd></div>
                  <div><dt>Gender</dt><dd>{editingStudentInfo ? <select value={studentInfoDraft?.sex || ''} onChange={(event) => updateStudentInfoDraft('sex', event.target.value)} aria-label="Gender"><option value="">Select</option><option value="male">Male</option><option value="female">Female</option></select> : student?.sex ? `${student.sex.charAt(0).toUpperCase()}${student.sex.slice(1)}` : '—'}</dd></div>
                  <div><dt>Student Status</dt><dd>{student?.status === 'approved' ? student?.student_state ? `${student.student_state.charAt(0).toUpperCase()}${student.student_state.slice(1)}` : 'Enrolled' : student?.status === 'rejected' ? 'Needs changes' : 'Pending review'}</dd></div>
                  <div><dt>Parent / Guardian</dt><dd>{student?.parent_full_name || parentName || '—'}</dd></div>
                  <div><dt>Parent Email</dt><dd>{student?.parent_email || parentEmail || '—'}</dd></div>
                  <div><dt>Place of Birth</dt><dd>{editingStudentInfo ? <input value={studentInfoDraft?.place_of_birth || ''} onChange={(event) => updateStudentInfoDraft('place_of_birth', event.target.value)} maxLength="100" aria-label="Place of birth" /> : formatPlaceOfBirth(student?.place_of_birth)}</dd></div>
                  <div><dt>Registered</dt><dd>{editingStudentInfo ? <select value={studentInfoDraft?.is_registered || ''} onChange={(event) => updateStudentInfoDraft('is_registered', event.target.value)} aria-label="Registered"><option value="">Select</option><option value="true">Yes</option><option value="false">No</option></select> : typeof student?.is_registered === 'boolean' ? (student.is_registered ? 'Yes' : 'No') : '—'}</dd></div>
                  <div><dt>Mother Tongue</dt><dd>{editingStudentInfo ? <input value={studentInfoDraft?.mother_tongue || ''} onChange={(event) => updateStudentInfoDraft('mother_tongue', event.target.value)} maxLength="50" aria-label="Mother tongue" /> : formatValue(student?.mother_tongue)}</dd></div>
                  <div><dt>Other Dialect</dt><dd>{editingStudentInfo ? <input value={studentInfoDraft?.other_dialect || ''} onChange={(event) => updateStudentInfoDraft('other_dialect', event.target.value)} maxLength="50" aria-label="Other dialect" /> : formatValue(student?.other_dialect)}</dd></div>
                </dl>
                {editingStudentInfo && <div className="student-info-edit-footer">
                  {studentInfoError && <p role="alert">{studentInfoError}</p>}
                  <div><button type="button" className="student-info-cancel" onClick={() => { setEditingStudentInfo(false); setStudentInfoDraft(null); setStudentInfoError('') }}>Cancel</button><button type="button" className="student-info-save" onClick={requestStudentInfoSave}>Save Changes</button></div>
                </div>}
                {canManageStatus && !editingStudentInfo && <div className="student-status-actions" aria-label="Update student status">
                  {currentStudentStatus === 'enrolled' ? <>
                    <button type="button" className="student-status-action withdraw" disabled={updatingStatusId === student?.id} onClick={() => setPendingStatus('withdrawn')}>Withdraw Student</button>
                    <button type="button" className="student-status-action danger" disabled={updatingStatusId === student?.id} onClick={() => setPendingStatus('dropped')}>Drop Student</button>
                  </> : <button type="button" className="student-status-action primary" disabled={updatingStatusId === student?.id} onClick={() => setPendingStatus('enrolled')}>Enroll Student Again</button>}
                </div>}
              </section>

              {student?.status === 'approved' && <section className="student-report-section">
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
              </section>}

              {student?.status === 'approved' && <section className="student-report-section">
                <div className="student-report-section-heading">
                  <h3>Attendance Summary</h3>
                  <span>{attendanceUnavailable ? 'Unavailable' : `${totalAttendanceDays} school days`}</span>
                </div>
                {attendanceUnavailable ? <p className="student-report-empty">Attendance totals are temporarily unavailable.</p> : <dl className="student-report-metrics attendance">
                  <div><dt>Present</dt><dd>{attendanceCounts.present}</dd></div>
                  <div><dt>Absent</dt><dd>{attendanceCounts.absent}</dd></div>
                  <div><dt>Total Days</dt><dd>{totalAttendanceDays}</dd></div>
                  <div><dt>Present / Total</dt><dd>{presentAttendanceFraction}</dd></div>
                </dl>}
              </section>}
            </div>
          )}
        </>
      )}
      </div>
    </section>
  )

  if (!onClose) return reportPanel

  return <div className="semester-dialog-overlay student-report-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !confirmStudentInfo) onClose() }}>{reportPanel}{pendingStatus && <ConfirmDialog title={pendingStatusCopy.title} message={pendingStatusCopy.message} confirmLabel={pendingStatusCopy.label} tone={pendingStatusCopy.tone} iconClass={pendingStatusCopy.icon} busy={updatingStatusId === student?.id} onConfirm={confirmStatusChange} onCancel={() => setPendingStatus('')} />}{confirmStudentInfo && <ConfirmDialog title="Save student information?" message={`Apply these changes to ${childName(student)}'s student record?`} confirmLabel="Save Changes" tone="primary" iconClass="app-icon-pen" busy={savingStudentInfo} onConfirm={saveStudentInfo} onCancel={() => { if (!savingStudentInfo) setConfirmStudentInfo(false) }} />}</div>
}

export default StudentReportPanel
