import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import EccdResultCard from './EccdResultCard'
import { formatResultDate, resultFromRow, standardScoreLabel } from '../lib/eccd/resultFormat'

function childName(student) {
  const lastName = String(student?.child_last_name || '').trim()
  const givenNames = [student?.child_first_name, student?.child_middle_name, student?.child_suffix]
    .map((part) => String(part || '').trim()).filter(Boolean).join(' ')
  return lastName && givenNames ? `${lastName}, ${givenNames}` : lastName || givenNames || 'Unnamed child'
}

// Parents only ever receive final results (scaled scores, standard score, interpretation)
// from get_parent_eccd_results. The checklist answers and raw scores are never sent to them.
function ParentEccdPanel({ student }) {
  const [results, setResults] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const requestRef = useRef(0)
  const enrollmentId = student?.id || ''

  const load = useCallback(async () => {
    const requestId = ++requestRef.current
    if (!enrollmentId) { setResults([]); setLoading(false); return }
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase.rpc('get_parent_eccd_results', { p_enrollment_id: enrollmentId })
    if (requestId !== requestRef.current) return
    if (error) {
      setMessage('Developmental results are temporarily unavailable.')
      setResults([])
    } else {
      const rows = (data || []).map(resultFromRow)
      setResults(rows)
      setSelectedId(rows[0]?.id || '')
    }
    setLoading(false)
  }, [enrollmentId])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => { window.clearTimeout(timer); requestRef.current += 1 }
  }, [load])

  const selected = results.find((result) => result.id === selectedId) || results[0]

  return (
    <section className="student-report-panel parent-health-panel" aria-labelledby="parent-eccd-title">
      <header className="student-report-header"><h2 id="parent-eccd-title">Development</h2></header>
      <div className="student-report-identity">
        <div className="student-report-avatar" aria-hidden="true">{student?.child_first_name?.[0] || ''}{student?.child_last_name?.[0] || ''}</div>
        <div><span>ECCD developmental results</span><h3>{childName(student)}</h3><p>{student?.reference_code || '—'}</p></div>
      </div>

      {message && <p className="student-report-message" role="status">{message}</p>}
      {loading ? <p className="student-report-empty app-loading" role="status">Loading developmental results...</p> : !selected ? (
        <div className="student-report-body"><p className="student-report-empty">No developmental assessment has been completed for this child yet. Results will appear here after your child&apos;s teacher records one.</p></div>
      ) : (
        <div className="student-report-body">
          <section className="student-report-section">
            <div className="student-report-section-heading"><h3>Summary</h3><span>Assessed by {selected.assessor}</span></div>
            <EccdResultCard result={selected} summaryOnly />
            <p className="student-report-health-note">The ECCD Checklist is a screening tool that shows how a child is developing compared with other children of the same age. It is not a diagnosis or an intelligence test. Please talk to your child&apos;s teacher about the results.</p>
          </section>

          {results.length > 1 && <section className="student-report-section">
            <div className="student-report-section-heading"><h3>Past Records</h3><span>{results.length} assessments</span></div>
            <div className="records-table-shell">
              <table className="records-table">
                <caption className="visually-hidden">Developmental assessment history</caption>
                <thead><tr><th scope="col">Date</th><th scope="col">Standard score</th><th scope="col">Result</th><th scope="col"><span className="visually-hidden">View</span></th></tr></thead>
                <tbody>{results.map((result) => (
                  <tr key={result.id}>
                    <td data-label="Date">{formatResultDate(result.date)}</td>
                    <td data-label="Standard score">{standardScoreLabel(result)}</td>
                    <td data-label="Result">{result.interpretation}</td>
                    <td data-label="View"><button type="button" className="eccd-link-button" onClick={() => setSelectedId(result.id)} disabled={result.id === selected.id}>{result.id === selected.id ? 'Showing' : 'View'}</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>}
        </div>
      )}
    </section>
  )
}

export default ParentEccdPanel
