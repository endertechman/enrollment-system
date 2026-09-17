import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from './LoadingSpinner'
import AuthToast from './AuthToast'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import { classifyChildBmi } from '../lib/bmiClassification'

function localDateValue() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

function childName(student) {
  return [student.child_first_name, student.child_last_name, student.child_suffix]
    .filter(Boolean)
    .join(' ')
}

function calculateBmi(heightCm, weightKg) {
  const height = Number(heightCm)
  const weight = Number(weightKg)
  if (!Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) return '—'
  return (weight / ((height / 100) ** 2)).toFixed(1)
}

function bmiClassification(student, heightCm, weightKg, measuredAt = new Date()) {
  const bmi = calculateBmi(heightCm, weightKg)
  if (bmi === '—' || !student) return null
  return classifyChildBmi({
    bmi,
    sex: student.sex,
    birthDate: student.birth_date,
    measuredAt,
  })
}

function HealthGrowthPanel({ enrollments, canManage = false }) {
  const students = useMemo(() => enrollments.filter((item) => item.status === 'approved'), [enrollments])
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [classificationFilter, setClassificationFilter] = useState('all')
  const [latestMeasurements, setLatestMeasurements] = useState({})
  const [records, setRecords] = useState([])
  const [measuredOn, setMeasuredOn] = useState(localDateValue)
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')

  const activeEnrollmentId = useMemo(
    () => students.some((item) => item.id === selectedEnrollmentId)
      ? selectedEnrollmentId
      : students[0]?.id || null,
    [selectedEnrollmentId, students],
  )
  const activeStudent = students.find((item) => item.id === activeEnrollmentId)
  const studentsWithClassification = useMemo(() => students.map((student) => {
    const latest = latestMeasurements[student.id]
    const classification = bmiClassification(
      student,
      latest?.height_cm ?? student.height_cm,
      latest?.weight_kg ?? student.weight_kg,
      latest?.measured_on ?? student.submitted_at ?? new Date(),
    )
    return { student, classification }
  }), [latestMeasurements, students])
  const filteredStudents = useMemo(() => studentsWithClassification.filter(({ classification }) => {
    if (classificationFilter === 'all') return true
    if (classificationFilter === 'follow-up') return classification?.tone === 'warning' || classification?.tone === 'alert'
    if (classificationFilter === 'normal') return classification?.label === 'Normal'
    if (classificationFilter === 'underweight') return classification?.label.toLocaleLowerCase().includes('underweight')
    if (classificationFilter === 'overweight') return classification?.label === 'Overweight'
    if (classificationFilter === 'obese') return classification?.label === 'Obese'
    return true
  }).map(({ student }) => student), [classificationFilter, studentsWithClassification])
  const studentSuggestions = useMemo(() => {
    const searchTerm = studentSearch.trim().toLocaleLowerCase()
    const matches = searchTerm
      ? filteredStudents.filter((student) => [childName(student), student.parent_full_name, student.reference_code]
          .some((value) => String(value || '').toLocaleLowerCase().includes(searchTerm)))
      : filteredStudents
    return matches.slice(0, 8)
  }, [filteredStudents, studentSearch])

  const loadLatestMeasurements = useCallback(async () => {
    if (!canManage || students.length === 0) {
      setLatestMeasurements({})
      return
    }

    const { data, error } = await supabase
      .from('enrollments')
      .select('id, growth_records(measured_on, height_cm, weight_kg)')
      .eq('status', 'approved')
      .order('measured_on', { referencedTable: 'growth_records', ascending: false })
      .limit(1, { referencedTable: 'growth_records' })

    if (error) return
    const nextMeasurements = {}
    for (const enrollment of data || []) {
      if (enrollment.growth_records?.[0]) nextMeasurements[enrollment.id] = enrollment.growth_records[0]
    }
    setLatestMeasurements(nextMeasurements)
  }, [canManage, students.length])

  const loadRecords = useCallback(async ({ silent = false } = {}) => {
    if (!activeEnrollmentId) {
      setRecords([])
      setLoading(false)
      return
    }

    if (!silent) {
      setLoading(true)
      setMessage('')
    }
    const { data, error } = await supabase
      .from('growth_records')
      .select('id, enrollment_id, measured_on, height_cm, weight_kg, updated_at')
      .eq('enrollment_id', activeEnrollmentId)
      .order('measured_on', { ascending: false })

    if (error) {
      setRecords([])
      setMessage('Health and growth records are unavailable until the Supabase migration is applied.')
    } else {
      setRecords(data || [])
    }
    setLoading(false)
  }, [activeEnrollmentId])

  useEffect(() => {
    const loadTimer = window.setTimeout(loadRecords, 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadRecords])

  useEffect(() => {
    const loadTimer = window.setTimeout(loadLatestMeasurements, 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadLatestMeasurements])

  useRealtimeRefresh(() => {
    loadRecords({ silent: true })
    loadLatestMeasurements()
  }, {
    channelName: `health-growth-${activeEnrollmentId || 'none'}`,
    tables: ['growth_records'],
    enabled: Boolean(activeEnrollmentId),
  })

  function selectStudent(id) {
    setSelectedEnrollmentId(id)
    setStudentSearch('')
    setPickerOpen(false)
    setMeasuredOn(localDateValue())
    setHeightCm('')
    setWeightKg('')
  }

  function editRecord(record) {
    setMeasuredOn(record.measured_on)
    setHeightCm(String(record.height_cm))
    setWeightKg(String(record.weight_kg))
    setMessage('Editing the measurement recorded for this date.')
  }

  async function saveMeasurement(event) {
    event.preventDefault()
    if (!activeEnrollmentId) return

    const height = Number(heightCm)
    const weight = Number(weightKg)
    if (height < 30 || height > 200 || weight < 1 || weight > 150) {
      setMessage('Enter a height from 30–200 cm and weight from 1–150 kg.')
      return
    }

    setSaving(true)
    setMessage('')
    setNotice('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setMessage('You must be logged in to save a measurement.')
      setSaving(false)
      return
    }

    const { data, error } = await supabase
      .from('growth_records')
      .upsert({
        enrollment_id: activeEnrollmentId,
        measured_on: measuredOn,
        height_cm: height,
        weight_kg: weight,
        recorded_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'enrollment_id,measured_on' })
      .select('id, enrollment_id, measured_on, height_cm, weight_kg, updated_at')
      .single()

    if (error) {
      setMessage(error.message)
    } else {
      setRecords((current) => [data, ...current.filter((item) => item.measured_on !== data.measured_on)]
        .sort((a, b) => b.measured_on.localeCompare(a.measured_on)))
      setHeightCm('')
      setWeightKg('')
      setMeasuredOn(localDateValue())
      setNotice('Growth measurement saved. BMI was calculated automatically.')
    }
    setSaving(false)
  }

  const previewBmi = calculateBmi(heightCm, weightKg)
  const previewClassification = bmiClassification(activeStudent, heightCm, weightKg, measuredOn)

  return (
    <section className="growth-panel">
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      <header className="growth-header">
        <div><h2>Health &amp; Growth</h2></div>
        <span className="dashboard-header-detail">{students.length} students</span>
      </header>
      <p className="growth-formula"><strong>BMI formula:</strong> weight (kg) ÷ [height (m)]²</p>

      {students.length === 0 ? <p className="growth-empty">No accepted students are available yet.</p> : <>
        {canManage && students.length > 1 && <div className="growth-classification-filters" aria-label="Filter students by BMI classification">
          {[
            ['all', 'All'],
            ['follow-up', 'Needs follow-up'],
            ['normal', 'Normal'],
            ['underweight', 'Underweight'],
            ['overweight', 'Overweight'],
            ['obese', 'Obese'],
          ].map(([value, label]) => <button type="button" key={value} className={classificationFilter === value ? 'active' : ''} onClick={() => {
            setClassificationFilter(value)
            setStudentSearch('')
            setPickerOpen(true)
          }}>{label}</button>)}
        </div>}
        {students.length > 1 && <div className="growth-student-picker">
          <label htmlFor="growth-student">Student</label>
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
                id="growth-student"
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={pickerOpen}
                aria-controls="growth-student-suggestions"
                value={pickerOpen ? studentSearch : childName(activeStudent)}
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
                    selectStudent(studentSuggestions[0].id)
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
            {pickerOpen && <div id="growth-student-suggestions" className="student-report-suggestions" role="listbox">
              {studentSuggestions.length === 0 ? <p>No students match this classification.</p> : studentSuggestions.map((student) => <button
                type="button"
                role="option"
                aria-selected={student.id === activeEnrollmentId}
                key={student.id}
                onClick={() => selectStudent(student.id)}
              >
                <span>{childName(student)}</span>
                <small>{studentsWithClassification.find((item) => item.student.id === student.id)?.classification?.label || student.parent_full_name || student.reference_code || 'Classification unavailable'}</small>
              </button>)}
            </div>}
          </div>
        </div>}

        {canManage && <form className="growth-form" onSubmit={saveMeasurement}>
          <label>Date<input type="date" value={measuredOn} max={localDateValue()} onChange={(event) => setMeasuredOn(event.target.value)} required /></label>
          <label>Height<div className="growth-unit-input"><input type="number" min="30" max="200" step="0.1" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} placeholder="0.0" required /><span>cm</span></div></label>
          <label>Weight<div className="growth-unit-input"><input type="number" min="1" max="150" step="0.1" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="0.0" required /><span>kg</span></div></label>
          <div className="growth-bmi-preview">
            <span>Calculated BMI</span>
            <strong>{previewBmi}</strong>
            {previewBmi !== '—' && <small data-tone={previewClassification?.tone || 'unavailable'}>{previewClassification?.label || 'Classification unavailable'}</small>}
          </div>
          <button type="submit" disabled={saving}>{saving ? <LoadingSpinner label="Saving..." inline /> : 'Save Measurement'}</button>
        </form>}

        {message && <p className="growth-message">{message}</p>}

        <div className="growth-record-heading"><h3>{activeStudent ? `${childName(activeStudent)}’s records` : 'Growth records'}</h3><span>{records.length} entries</span></div>
        {loading ? <div className="growth-empty"><LoadingSpinner label="Loading growth records..." compact /></div> : records.length === 0 ? <p className="growth-empty">No growth measurements have been recorded.</p> : <div className="growth-record-list">
          {records.map((record) => {
            const classification = bmiClassification(activeStudent, record.height_cm, record.weight_kg, record.measured_on)
            return <article key={record.id}>
              <div><span>Measured</span><strong>{new Date(`${record.measured_on}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</strong></div>
              <div><span>Height</span><strong>{Number(record.height_cm).toFixed(1)} cm</strong></div>
              <div><span>Weight</span><strong>{Number(record.weight_kg).toFixed(1)} kg</strong></div>
              <div className="growth-record-bmi"><span>BMI</span><strong>{calculateBmi(record.height_cm, record.weight_kg)}</strong><small data-tone={classification?.tone || 'unavailable'}>{classification?.label || 'Classification unavailable'}</small></div>
              {canManage && <button type="button" onClick={() => editRecord(record)}>Edit</button>}
            </article>
          })}
        </div>}
        <p className="growth-classification-note">BMI-for-age is a screening classification based on Philippine use of WHO child growth standards and is not a medical diagnosis.</p>
      </>}
    </section>
  )
}

export default HealthGrowthPanel
