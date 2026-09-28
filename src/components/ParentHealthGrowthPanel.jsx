import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { classifyChildBmi } from '../lib/bmiClassification'
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

function calculateBmi(record) {
  const height = Number(record?.height_cm)
  const weight = Number(record?.weight_kg)
  if (!Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) return '—'
  return (weight / ((height / 100) ** 2)).toFixed(1)
}

function classificationFor(student, record) {
  const bmi = calculateBmi(record)
  return bmi === '—' ? null : classifyChildBmi({
    bmi,
    sex: student.sex,
    birthDate: student.birth_date,
    measuredAt: record.measured_on,
  })
}

function ParentHealthGrowthPanel({ student }) {
  const [currentPage, setCurrentPage] = useState(1)
  const [records, setRecords] = useState([])
  const [latestRecord, setLatestRecord] = useState(null)
  const [recordCount, setRecordCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const requestRef = useRef(0)
  const enrollmentId = student?.id || ''

  const loadRecords = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestRef.current
    if (!enrollmentId) {
      setRecords([])
      setLatestRecord(null)
      setRecordCount(0)
      setLoading(false)
      return
    }

    if (!silent) {
      setLoading(true)
      setMessage('')
    }

    const fields = 'id, measured_on, height_cm, weight_kg'
    const [pageResult, latestResult] = await Promise.all([
      supabase.from('growth_records')
        .select(fields, { count: 'exact' })
        .eq('enrollment_id', enrollmentId)
        .order('measured_on', { ascending: false })
        .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1),
      supabase.from('growth_records')
        .select(fields)
        .eq('enrollment_id', enrollmentId)
        .order('measured_on', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (requestId !== requestRef.current) return
    if (pageResult.error || latestResult.error) {
      setMessage('Health and growth records are temporarily unavailable.')
      if (!silent) {
        setRecords([])
        setLatestRecord(null)
        setRecordCount(0)
      }
    } else {
      setRecords(pageResult.data || [])
      setLatestRecord(latestResult.data || null)
      setRecordCount(pageResult.count ?? 0)
      setMessage('')
    }
    setLoading(false)
  }, [currentPage, enrollmentId])

  useEffect(() => {
    const timer = window.setTimeout(() => loadRecords(), 0)
    return () => {
      window.clearTimeout(timer)
      requestRef.current += 1
    }
  }, [loadRecords])

  useRealtimeRefresh(() => loadRecords({ silent: true }), {
    channelName: `parent-growth-${enrollmentId || 'none'}`,
    tables: ['growth_records'],
    enabled: Boolean(enrollmentId),
  })

  const latestBmi = calculateBmi(latestRecord)
  const latestClassification = latestRecord ? classificationFor(student, latestRecord) : null
  const safePage = Math.min(currentPage, Math.max(1, Math.ceil(recordCount / PAGE_SIZE)))

  return (
    <section className="student-report-panel parent-health-panel" aria-labelledby="parent-health-title">
      <header className="student-report-header"><h2 id="parent-health-title">Health &amp; Growth</h2></header>
      <div className="student-report-identity">
        <div className="student-report-avatar" aria-hidden="true">{student?.child_first_name?.[0] || ''}{student?.child_last_name?.[0] || ''}</div>
        <div><span>Child health record</span><h3>{childName(student)}</h3><p>{student?.reference_code || '—'}</p></div>
      </div>

      {message && <p className="student-report-message" role="status">{message}</p>}
      {loading ? <p className="student-report-empty app-loading" role="status">Loading health records...</p> : <div className="student-report-body">
        <section className="student-report-section">
          <div className="student-report-section-heading"><h3>Latest Measurement</h3><span>{latestRecord ? `Recorded ${formatDate(latestRecord.measured_on)}` : 'No measurement yet'}</span></div>
          <dl className="student-report-metrics">
            <div><dt>Height</dt><dd>{latestRecord ? `${Number(latestRecord.height_cm).toFixed(1)} cm` : '—'}</dd></div>
            <div><dt>Weight</dt><dd>{latestRecord ? `${Number(latestRecord.weight_kg).toFixed(1)} kg` : '—'}</dd></div>
            <div className="student-report-bmi"><dt>BMI</dt><dd>{latestBmi}<small data-tone={latestClassification?.tone || 'unavailable'}>{latestClassification?.label || 'Classification unavailable'}</small></dd></div>
            <div><dt>Measurements</dt><dd>{recordCount}</dd></div>
          </dl>
          <p className="student-report-health-note">BMI-for-age is a screening classification based on Philippine use of WHO child growth standards.</p>
        </section>

        <section className="student-report-section parent-health-history">
          <div className="student-report-section-heading"><h3>Measurement History</h3><span>{recordCount} {recordCount === 1 ? 'record' : 'records'}</span></div>
          {records.length === 0 ? <p className="student-report-empty">No health measurements have been recorded for this child.</p> : <div className="records-table-shell parent-health-table-shell">
            <table className="records-table parent-health-table">
              <caption className="visually-hidden">Health and growth history for {childName(student)}</caption>
              <thead><tr><th scope="col">Date Recorded</th><th scope="col">Height</th><th scope="col">Weight</th><th scope="col">BMI</th><th scope="col">Classification</th></tr></thead>
              <tbody>{records.map((record) => <tr key={record.id}>
                <td data-label="Date Recorded">{formatDate(record.measured_on)}</td>
                <td data-label="Height">{Number(record.height_cm).toFixed(1)} cm</td>
                <td data-label="Weight">{Number(record.weight_kg).toFixed(1)} kg</td>
                <td data-label="BMI">{calculateBmi(record)}</td>
                <td data-label="Classification">{classificationFor(student, record)?.label || 'Unavailable'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <TablePagination currentPage={safePage} totalItems={recordCount} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} ariaLabel="Child health record pages" />
        </section>
      </div>}
    </section>
  )
}

export default ParentHealthGrowthPanel
