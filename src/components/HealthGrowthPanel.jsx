import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from './LoadingSpinner'

function localDateValue() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

function childName(student) {
  return [student.child_first_name, student.child_middle_name, student.child_last_name, student.child_suffix]
    .filter(Boolean)
    .join(' ')
}

function calculateBmi(heightCm, weightKg) {
  const height = Number(heightCm)
  const weight = Number(weightKg)
  if (!Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) return '—'
  return (weight / ((height / 100) ** 2)).toFixed(1)
}

function HealthGrowthPanel({ enrollments, canManage = false }) {
  const students = enrollments.filter((item) => item.status === 'approved')
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(null)
  const [records, setRecords] = useState([])
  const [measuredOn, setMeasuredOn] = useState(localDateValue)
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const activeEnrollmentId = students.some((item) => item.id === selectedEnrollmentId)
    ? selectedEnrollmentId
    : students[0]?.id || null
  const activeStudent = students.find((item) => item.id === activeEnrollmentId)

  useEffect(() => {
    let active = true

    async function loadRecords() {
      if (!activeEnrollmentId) {
        setRecords([])
        setLoading(false)
        return
      }

      setLoading(true)
      setMessage('')
      const { data, error } = await supabase
        .from('growth_records')
        .select('id, enrollment_id, measured_on, height_cm, weight_kg, updated_at')
        .eq('enrollment_id', activeEnrollmentId)
        .order('measured_on', { ascending: false })

      if (!active) return
      if (error) {
        setRecords([])
        setMessage('Health and growth records are unavailable until the Supabase migration is applied.')
      } else {
        setRecords(data || [])
      }
      setLoading(false)
    }

    loadRecords()
    return () => { active = false }
  }, [activeEnrollmentId])

  function selectStudent(id) {
    setSelectedEnrollmentId(id)
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
      setMessage('Growth measurement saved. BMI was calculated automatically.')
    }
    setSaving(false)
  }

  return (
    <section className="growth-panel">
      <header className="growth-header">
        <div><h2>Health &amp; Growth</h2><p>{canManage ? 'Record height and weight to monitor each student’s BMI.' : 'View recorded growth measurements and calculated BMI.'}</p></div>
      </header>

      {students.length === 0 ? <p className="growth-empty">No accepted students are available yet.</p> : <>
        <div className="growth-student-picker">
          <label htmlFor="growth-student">Student</label>
          <select id="growth-student" value={activeEnrollmentId || ''} onChange={(event) => selectStudent(event.target.value)}>
            {students.map((student) => <option key={student.id} value={student.id}>{childName(student)}</option>)}
          </select>
        </div>

        {canManage && <form className="growth-form" onSubmit={saveMeasurement}>
          <label>Date<input type="date" value={measuredOn} max={localDateValue()} onChange={(event) => setMeasuredOn(event.target.value)} required /></label>
          <label>Height<div className="growth-unit-input"><input type="number" min="30" max="200" step="0.1" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} placeholder="0.0" required /><span>cm</span></div></label>
          <label>Weight<div className="growth-unit-input"><input type="number" min="1" max="150" step="0.1" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder="0.0" required /><span>kg</span></div></label>
          <div className="growth-bmi-preview"><span>Calculated BMI</span><strong>{calculateBmi(heightCm, weightKg)}</strong></div>
          <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Measurement'}</button>
        </form>}

        {message && <p className="growth-message">{message}</p>}

        <div className="growth-record-heading"><h3>{activeStudent ? `${childName(activeStudent)}’s records` : 'Growth records'}</h3><span>{records.length} entries</span></div>
        {loading ? <div className="growth-empty"><LoadingSpinner label="Loading growth records..." compact /></div> : records.length === 0 ? <p className="growth-empty">No growth measurements have been recorded.</p> : <div className="growth-record-list">
          {records.map((record) => <article key={record.id}>
            <div><span>Measured</span><strong>{new Date(`${record.measured_on}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</strong></div>
            <div><span>Height</span><strong>{Number(record.height_cm).toFixed(1)} cm</strong></div>
            <div><span>Weight</span><strong>{Number(record.weight_kg).toFixed(1)} kg</strong></div>
            <div><span>BMI</span><strong>{calculateBmi(record.height_cm, record.weight_kg)}</strong></div>
            {canManage && <button type="button" onClick={() => editRecord(record)}>Edit</button>}
          </article>)}
        </div>}
      </>}
    </section>
  )
}

export default HealthGrowthPanel
