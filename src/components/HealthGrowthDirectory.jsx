import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import AuthToast from './AuthToast'
import ConfirmDialog from './ConfirmDialog'
import PaginatedDropdown from './PaginatedDropdown'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import { classifyChildBmi } from '../lib/bmiClassification'
import { getAgeInYears, getPhilippineDateValue as localDateValue } from '../lib/philippineDate'

const PAGE_SIZE = 10
const CLASSIFICATION_OPTIONS = [
  { value: 'all', label: 'All classifications' },
  { value: 'normal', label: 'Normal' },
  { value: 'underweight', label: 'Underweight' },
  { value: 'overweight', label: 'Overweight' },
  { value: 'obese', label: 'Obese' },
  { value: 'not recorded', label: 'Not recorded' },
]

function childName(student) {
  const lastName = String(student?.child_last_name || '').trim()
  const givenNames = [student?.child_first_name, student?.child_middle_name, student?.child_suffix]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')

  if (lastName && givenNames) return `${lastName}, ${givenNames}`
  return lastName || givenNames || 'Unnamed student'
}

function calculateBmi(heightCm, weightKg) {
  const height = Number(heightCm)
  const weight = Number(weightKg)
  if (!Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) return '—'
  return (weight / ((height / 100) ** 2)).toFixed(1)
}

function calculateAge(birthDate) {
  return getAgeInYears(birthDate) ?? '—'
}

function formatGender(value) {
  const normalized = String(value || '').trim().toLocaleLowerCase()
  if (normalized === 'male') return 'Male'
  if (normalized === 'female') return 'Female'
  return '—'
}

function bmiClassification(student, measurement) {
  const bmi = calculateBmi(measurement?.height_cm, measurement?.weight_kg)
  if (bmi === '—') return null
  return classifyChildBmi({
    bmi,
    sex: student.sex,
    birthDate: student.birth_date,
    measuredAt: measurement.measured_on,
  })
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function paginationItems(currentPage, totalPages) {
  if (totalPages <= 3) return Array.from({ length: totalPages }, (_, index) => index + 1)
  if (currentPage <= 2) return [1, 2, 3, 'end-ellipsis', totalPages]
  if (currentPage >= totalPages - 1) return [1, 'start-ellipsis', totalPages - 2, totalPages - 1, totalPages]
  return [1, 'start-ellipsis', currentPage, 'end-ellipsis', totalPages]
}

function HealthGrowthDirectory({ enrollments, canManage = false, rowsClickable = true }) {
  const students = useMemo(
    () => enrollments.filter((item) => item.status === 'approved'),
    [enrollments],
  )
  const activeStudents = useMemo(
    () => students.filter((student) => (student.student_state || 'enrolled') === 'enrolled'),
    [students],
  )
  const [latestMeasurements, setLatestMeasurements] = useState({})
  const [search, setSearch] = useState('')
  const [classificationFilter, setClassificationFilter] = useState('all')
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [updateOpen, setUpdateOpen] = useState(false)
  const [updateSearch, setUpdateSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [saving, setSaving] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [historyStudent, setHistoryStudent] = useState(null)
  const [historyRecords, setHistoryRecords] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMessage, setHistoryMessage] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const loadLatestMeasurements = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
      setMessage('')
    }

    if (students.length === 0) {
      setLatestMeasurements({})
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('growth_records')
      .select('id, enrollment_id, measured_on, height_cm, weight_kg')
      .in('enrollment_id', students.map((student) => student.id))
      .order('measured_on', { ascending: false })

    if (error) {
      setMessage('Health and growth records are temporarily unavailable.')
      setLatestMeasurements({})
    } else {
      const nextMeasurements = {}
      for (const record of data || []) {
        if (!nextMeasurements[record.enrollment_id]) nextMeasurements[record.enrollment_id] = record
      }
      setLatestMeasurements(nextMeasurements)
    }
    setLoading(false)
  }, [students])

  useEffect(() => {
    const loadTimer = window.setTimeout(loadLatestMeasurements, 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadLatestMeasurements])

  useRealtimeRefresh(() => loadLatestMeasurements({ silent: true }), {
    channelName: 'health-growth-directory',
    tables: ['growth_records'],
    enabled: students.length > 0,
  })

  const rows = useMemo(() => students.map((student) => {
    const measurement = latestMeasurements[student.id] || null
    const bmi = calculateBmi(measurement?.height_cm, measurement?.weight_kg)
    const classification = bmiClassification(student, measurement)
    return { student, measurement, bmi, classification }
  }).sort((first, second) => {
    const dateComparison = String(second.measurement?.measured_on || '').localeCompare(String(first.measurement?.measured_on || ''))
    return dateComparison || childName(first.student).localeCompare(childName(second.student))
  }), [latestMeasurements, students])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return rows.filter((row) => {
      const label = row.classification?.label || 'Not recorded'
      const matchesClassification = classificationFilter === 'all'
        || label.toLocaleLowerCase().includes(classificationFilter)
      if (!matchesClassification) return false
      if (!term) return true
      const age = calculateAge(row.student.birth_date)
      const gender = formatGender(row.student.sex).toLocaleLowerCase()
      const matchesDetails = [childName(row.student), age, age === '—' ? '' : `age ${age}`, row.measurement?.measured_on, formatDate(row.measurement?.measured_on)]
        .some((value) => String(value || '').toLocaleLowerCase().includes(term))
      return matchesDetails || (gender !== '—' && gender.startsWith(term))
    })
  }, [classificationFilter, rows, search])

  const sortedRows = useMemo(() => {
    const valueFor = (row) => {
      if (sortConfig.key === 'name') return childName(row.student)
      if (sortConfig.key === 'age') {
        const age = calculateAge(row.student.birth_date)
        return age === '—' ? null : age
      }
      if (sortConfig.key === 'gender') {
        const gender = formatGender(row.student.sex)
        return gender === '—' ? null : gender
      }
      if (sortConfig.key === 'height') return row.measurement ? Number(row.measurement.height_cm) : null
      if (sortConfig.key === 'weight') return row.measurement ? Number(row.measurement.weight_kg) : null
      if (sortConfig.key === 'bmi') return row.bmi === '—' ? null : Number(row.bmi)
      if (sortConfig.key === 'classification') return row.classification?.label || 'Not recorded'
      return row.measurement?.measured_on || null
    }

    return [...filteredRows].sort((first, second) => {
      const firstValue = valueFor(first)
      const secondValue = valueFor(second)
      if (firstValue == null && secondValue == null) return 0
      if (firstValue == null) return 1
      if (secondValue == null) return -1

      const comparison = typeof firstValue === 'number' && typeof secondValue === 'number'
        ? firstValue - secondValue
        : String(firstValue).localeCompare(String(secondValue), undefined, { numeric: true, sensitivity: 'base' })
      return sortConfig.direction === 'asc' ? comparison : -comparison
    })
  }, [filteredRows, sortConfig])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const firstIndex = (safePage - 1) * PAGE_SIZE
  const visibleRows = sortedRows.slice(firstIndex, firstIndex + PAGE_SIZE)
  const shownStart = filteredRows.length === 0 ? 0 : firstIndex + 1
  const shownEnd = Math.min(firstIndex + PAGE_SIZE, filteredRows.length)
  const selectedStudent = activeStudents.find((student) => student.id === selectedStudentId) || null
  const updateSuggestions = useMemo(() => {
    const term = updateSearch.trim().toLocaleLowerCase()
    return activeStudents.filter((student) => !term || [childName(student), student.reference_code, student.parent_full_name]
      .some((value) => String(value || '').toLocaleLowerCase().includes(term)))
      .slice(0, 5)
  }, [activeStudents, updateSearch])

  function changeSort(key) {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
    setCurrentPage(1)
  }

  function sortableHeading(key, label) {
    const active = sortConfig.key === key
    const direction = active ? sortConfig.direction : null
    return <th scope="col" aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className={`growth-sort-button${active ? ' active' : ''}`} onClick={() => changeSort(key)}>{label}<i className={`app-icon ${active && direction === 'desc' ? 'app-icon-sort-za' : 'app-icon-sort-az'} growth-sort-icon`} aria-hidden="true" /></button></th>
  }

  function openUpdateDialog() {
    setUpdateSearch('')
    setSelectedStudentId('')
    setHeightCm('')
    setWeightKg('')
    setFormMessage('')
    setSuggestionsOpen(false)
    setUpdateOpen(true)
  }

  function closeUpdateDialog() {
    if (saving) return
    setUpdateOpen(false)
    setSuggestionsOpen(false)
    setFormMessage('')
  }

  function selectUpdateStudent(student) {
    setSelectedStudentId(student.id)
    setUpdateSearch(childName(student))
    setSuggestionsOpen(false)
    setFormMessage('')
  }

  async function saveRecord(event) {
    event.preventDefault()
    const height = Number(heightCm)
    const weight = Number(weightKg)

    if (!selectedStudent) {
      setFormMessage('Select a student from the suggestions first.')
      return
    }
    if (height < 30 || height > 200 || weight < 1 || weight > 150) {
      setFormMessage('Enter a height from 30–200 cm and weight from 1–150 kg.')
      return
    }

    setSaving(true)
    setFormMessage('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSaving(false)
      setFormMessage('You must be logged in to save a health record.')
      return
    }

    const measuredOn = localDateValue()
    const { data, error } = await supabase
      .from('growth_records')
      .insert({
        enrollment_id: selectedStudent.id,
        measured_on: measuredOn,
        height_cm: height,
        weight_kg: weight,
        recorded_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'enrollment_id,measured_on' })
      .select('measured_on, height_cm, weight_kg')
      .single()

    setSaving(false)
    if (error) {
      setFormMessage(error.message)
      return
    }

    setLatestMeasurements((current) => ({ ...current, [selectedStudent.id]: data }))
    setUpdateOpen(false)
    setSuggestionsOpen(false)
    setNotice(`${childName(selectedStudent)}’s health record was updated.`)
  }

  async function openStudentHistory(student) {
    setHistoryStudent(student)
    setHistoryRecords([])
    setHistoryMessage('')
    setHistoryLoading(true)

    const { data, error } = await supabase
      .from('growth_records')
      .select('id, measured_on, height_cm, weight_kg, updated_at')
      .eq('enrollment_id', student.id)
      .order('measured_on', { ascending: false })

    if (error) {
      setHistoryMessage('This student’s health history is temporarily unavailable.')
    } else {
      setHistoryRecords(data || [])
    }
    setHistoryLoading(false)
  }

  function closeStudentHistory() {
    setHistoryStudent(null)
    setHistoryRecords([])
    setHistoryMessage('')
  }

  async function deleteGrowthRecord() {
    if (!pendingDelete?.record?.id) return
    setDeleting(true)
    const { error } = await supabase
      .from('growth_records')
      .delete()
      .eq('id', pendingDelete.record.id)

    setDeleting(false)
    if (error) {
      setPendingDelete(null)
      setFormMessage(error.message)
      return
    }

    const deletedStudentName = childName(pendingDelete.student)
    const deletedRecordId = pendingDelete.record.id
    setPendingDelete(null)
    setHistoryRecords((current) => current.filter((record) => record.id !== deletedRecordId))
    await loadLatestMeasurements({ silent: true })
    setNotice(`${deletedStudentName}’s health record was deleted.`)
  }

  return (
    <section className="growth-panel growth-directory-panel">
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      <AuthToast message={formMessage} onDismiss={() => setFormMessage('')} variant="error" />
      {pendingDelete && <ConfirmDialog title="Delete health record?" message={`This removes only ${childName(pendingDelete.student)}’s measurement from ${formatDate(pendingDelete.record.measured_on)}. The student and enrollment will remain.`} confirmLabel="Delete Record" busy={deleting} onConfirm={deleteGrowthRecord} onCancel={() => setPendingDelete(null)} />}

      {updateOpen && <div className="semester-dialog-overlay growth-update-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeUpdateDialog() }}>
        <section className="semester-dialog growth-update-dialog" role="dialog" aria-modal="true" aria-labelledby="growth-update-title">
          <header className="semester-dialog-header">
            <div><h2 id="growth-update-title">Update health record</h2><p>Record the student’s latest height and weight.</p></div>
            <button type="button" className="popup-close-button" onClick={closeUpdateDialog} disabled={saving} aria-label="Close health record dialog"><i className="app-icon app-icon-close" aria-hidden="true" /></button>
          </header>
          <form className="growth-update-form" onSubmit={saveRecord}>
            <div className="growth-update-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSuggestionsOpen(false) }}>
              <label htmlFor="growth-update-student">Student name</label>
              <input
                id="growth-update-student"
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestionsOpen}
                aria-controls="growth-update-suggestions"
                value={updateSearch}
                placeholder="Search student name or reference code"
                autoComplete="off"
                onFocus={() => setSuggestionsOpen(true)}
                onChange={(event) => { setUpdateSearch(event.target.value); setSelectedStudentId(''); setSuggestionsOpen(true) }}
                required
              />
              {suggestionsOpen && <div id="growth-update-suggestions" className="growth-update-suggestions" role="listbox">
                {updateSuggestions.length === 0 ? <p>No enrolled students found.</p> : updateSuggestions.map((student) => <button type="button" role="option" aria-selected={student.id === selectedStudentId} key={student.id} onClick={() => selectUpdateStudent(student)}><span>{childName(student)}</span><small>{student.reference_code || student.parent_full_name || 'Enrolled student'}</small></button>)}
              </div>}
            </div>

            <div className="growth-update-measurements">
              <label><span>Height</span><div className="growth-unit-input"><input type="number" min="30" max="200" step="0.1" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} placeholder="0.0" required /><span>cm</span></div></label>
              <label><span>Weight</span><div className="growth-unit-input"><input type="number" min="1" max="150" step="0.1" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="0.0" required /><span>kg</span></div></label>
            </div>

            <p className="semester-time-note"><i className="app-icon app-icon-calendar-dates" aria-hidden="true" /> The record date will be added automatically when you save.</p>
            <div className="semester-dialog-actions"><button type="button" className="button-secondary" onClick={closeUpdateDialog} disabled={saving}>Cancel</button><button type="submit" className="approve-button" disabled={saving || !selectedStudent}>Save Record</button></div>
          </form>
        </section>
      </div>}

      {historyStudent && <div className="semester-dialog-overlay growth-history-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeStudentHistory() }}>
        <section className="semester-dialog growth-history-dialog" role="dialog" aria-modal="true" aria-labelledby="growth-history-title">
          <header className="semester-dialog-header">
            <div><h2 id="growth-history-title">{childName(historyStudent)}</h2><p>Complete height, weight, and BMI history.</p></div>
            <button type="button" className="popup-close-button" onClick={closeStudentHistory} aria-label="Close student health history"><i className="app-icon app-icon-close" aria-hidden="true" /></button>
          </header>
          <div className="growth-history-body">
            {historyMessage && <p className="growth-message" role="status">{historyMessage}</p>}
            {historyLoading ? <p className="growth-empty app-loading" role="status">Loading health history...</p> : historyRecords.length === 0 ? <p className="growth-empty">No health measurements have been recorded for this student.</p> : <div className="records-table-shell growth-history-table-shell">
              <table className="records-table growth-history-table">
                <caption className="visually-hidden">Health and growth history for {childName(historyStudent)}</caption>
                <thead><tr><th scope="col">Date Recorded</th><th scope="col">Height (cm)</th><th scope="col">Weight (kg)</th><th scope="col">BMI</th><th scope="col">Classification</th><th scope="col" className="records-actions-column"><span className="visually-hidden">Actions</span></th></tr></thead>
                <tbody>{historyRecords.map((record) => {
                  const classification = bmiClassification(historyStudent, record)
                  return <tr key={record.id}>
                    <td data-label="Date Recorded">{formatDate(record.measured_on)}</td>
                    <td data-label="Height (cm)">{Number(record.height_cm).toFixed(1)}</td>
                    <td data-label="Weight (kg)">{Number(record.weight_kg).toFixed(1)}</td>
                    <td data-label="BMI">{calculateBmi(record.height_cm, record.weight_kg)}</td>
                    <td data-label="Classification">{classification?.label || 'Unavailable'}</td>
                    <td data-label="Actions" className="records-actions-column"><button type="button" className="growth-record-delete icon-delete-button" disabled={deleting} onClick={() => setPendingDelete({ student: historyStudent, record })} aria-label={`Delete health record from ${formatDate(record.measured_on)}`} title="Delete health record"><i className="app-icon app-icon-trash" aria-hidden="true" /></button></td>
                  </tr>
                })}</tbody>
              </table>
            </div>}
          </div>
        </section>
      </div>}

      <header className="growth-header"><h2>Health &amp; Growth</h2></header>

      <div className="growth-directory-heading">
        <span>Latest Records</span>
        <strong>{filteredRows.length} students</strong>
      </div>
      {rowsClickable && <p className="growth-directory-instruction">Click a student row to view their complete health history.</p>}

      <div className="growth-directory-toolbar">
        <label className="growth-directory-search">
          <span className="visually-hidden">Filter health and growth records</span>
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1) }} placeholder="Filter by name, age, gender, or date" />
        </label>
        <div className="growth-directory-filter">
          <PaginatedDropdown options={CLASSIFICATION_OPTIONS} value={classificationFilter} onChange={(value) => { setClassificationFilter(value); setCurrentPage(1) }} ariaLabel="BMI classification" pageSize={10} />
        </div>
        {canManage && <button type="button" className="growth-update-button" onClick={openUpdateDialog} disabled={activeStudents.length === 0}>Add Record</button>}
      </div>

      {message && <p className="growth-message" role="status">{message}</p>}

      {loading ? <p className="growth-empty app-loading" role="status">Loading health and growth records...</p> : (
        <div className="records-table-shell growth-table-shell">
          <table className="records-table growth-records-table">
            <caption className="visually-hidden">Latest student health and growth records</caption>
            <thead><tr>{sortableHeading('name', 'Name')}{sortableHeading('age', 'Age')}{sortableHeading('gender', 'Gender')}{sortableHeading('height', 'Height (cm)')}{sortableHeading('weight', 'Weight (kg)')}{sortableHeading('bmi', 'BMI')}{sortableHeading('classification', 'Classification')}{sortableHeading('date', 'Date Recorded')}</tr></thead>
            <tbody>{visibleRows.length === 0 ? (
              <tr className="growth-table-empty-row"><td colSpan="8">No health and growth records match this filter.</td></tr>
            ) : visibleRows.map(({ student, measurement, bmi, classification }) => <tr key={student.id} className={`growth-student-row ${rowsClickable ? 'interactive' : 'readonly'}`} tabIndex={rowsClickable ? 0 : undefined} aria-label={rowsClickable ? `View health history for ${childName(student)}` : undefined} onClick={rowsClickable ? () => openStudentHistory(student) : undefined} onKeyDown={rowsClickable ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openStudentHistory(student) } } : undefined}>
              <td data-label="Name"><strong className="records-student-name">{childName(student)}</strong></td>
              <td data-label="Age">{calculateAge(student.birth_date)}</td>
              <td data-label="Gender">{formatGender(student.sex)}</td>
              <td data-label="Height (cm)">{measurement ? Number(measurement.height_cm).toFixed(1) : '—'}</td>
              <td data-label="Weight (kg)">{measurement ? Number(measurement.weight_kg).toFixed(1) : '—'}</td>
              <td data-label="BMI"><strong className="growth-table-bmi">{bmi}</strong></td>
              <td data-label="Classification"><span className="growth-table-classification">{classification?.label || 'Not recorded'}</span></td>
              <td data-label="Date Recorded">{formatDate(measurement?.measured_on)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}

      <footer className="growth-table-footer">
        <span>Showing {shownStart}–{shownEnd} of {filteredRows.length}</span>
        <nav className="growth-pagination" aria-label="Health and growth record pages">
          <button type="button" onClick={() => setCurrentPage(Math.max(1, safePage - 1))} disabled={safePage === 1} aria-label="Previous page">‹</button>
          {paginationItems(safePage, totalPages).map((item) => typeof item === 'number'
            ? <button type="button" key={item} className={item === safePage ? 'active' : ''} aria-current={item === safePage ? 'page' : undefined} onClick={() => setCurrentPage(item)}>{item}</button>
            : <span key={item} aria-hidden="true">…</span>)}
          <button type="button" onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} aria-label="Next page">›</button>
        </nav>
      </footer>

      <p className="growth-classification-note"><strong>BMI classification used:</strong> Underweight (below −2 SD), Normal (−2 to +2 SD), Overweight (above +2 to +3 SD), and Obese (above +3 SD).</p>
    </section>
  )
}

export default HealthGrowthDirectory
