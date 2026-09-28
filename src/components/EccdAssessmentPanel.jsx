import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getPhilippineDateValue } from '../lib/philippineDate'
import { STANDARD_SCORE_CATEGORIES, computeAge, formatAge, getAgeGroup } from '../lib/eccd/scoring'
import PaginatedDropdown from './PaginatedDropdown'
import TablePagination from './TablePagination'
import ConfirmDialog from './ConfirmDialog'
import AuthToast from './AuthToast'
import EccdAssessmentDialog from './EccdAssessmentDialog'
import EccdResultCard from './EccdResultCard'
import EccdTrendChart from './EccdTrendChart'
import { formatResultDate, resultFromRow, standardScoreLabel } from '../lib/eccd/resultFormat'

const PAGE_SIZE = 10
const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'significant', label: 'Significant Delay' },
  { value: 'slight', label: 'Slight Delay' },
  { value: 'average', label: 'Average' },
  { value: 'advanced', label: 'Slightly Advanced' },
  { value: 'high', label: 'Highly Advanced' },
  { value: 'pending', label: 'Not Yet Assessed' },
]
// responses is left out of list queries; it is only needed to audit a single assessment.
const LIST_FIELDS = 'id, enrollment_id, assessor_name, assessment_date, age_years, age_months, age_days, age_group, gross_motor_raw, fine_motor_raw, self_help_raw, receptive_language_raw, expressive_language_raw, cognitive_raw, socio_emotional_raw, gross_motor_scaled, fine_motor_scaled, self_help_scaled, receptive_language_scaled, expressive_language_scaled, cognitive_scaled, socio_emotional_scaled, total_scaled_score, standard_score, score_range, interpretation'

function childName(student) {
  const lastName = String(student?.child_last_name || '').trim()
  const givenNames = [student?.child_first_name, student?.child_middle_name, student?.child_suffix]
    .map((part) => String(part || '').trim()).filter(Boolean).join(' ')
  return lastName && givenNames ? `${lastName}, ${givenNames}` : lastName || givenNames || 'Unnamed student'
}

function EccdAssessmentPanel({ enrollments }) {
  const students = useMemo(
    () => enrollments.filter((item) => item.status === 'approved' && (item.student_state || 'enrolled') === 'enrolled'),
    [enrollments],
  )
  const [assessments, setAssessments] = useState({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [assessing, setAssessing] = useState(null)
  const [historyStudent, setHistoryStudent] = useState(null)
  const [historyId, setHistoryId] = useState('')
  const [historyView, setHistoryView] = useState('result')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (students.length === 0) { setAssessments({}); setLoading(false); return }
    const { data, error } = await supabase
      .from('eccd_assessments')
      .select(LIST_FIELDS)
      .in('enrollment_id', students.map((student) => student.id))
      .order('assessment_date', { ascending: false })

    if (error) {
      setMessage('Developmental assessments are temporarily unavailable.')
      setAssessments({})
    } else {
      const grouped = {}
      for (const row of data || []) (grouped[row.enrollment_id] ||= []).push(row)
      setAssessments(grouped)
      setMessage('')
    }
    setLoading(false)
  }, [students])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const today = getPhilippineDateValue()
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return students
      .map((student) => {
        const history = assessments[student.id] || []
        const age = computeAge(student.birth_date, today)
        return { student, history, latest: history[0] || null, age }
      })
      .filter(({ student, latest }) => {
        if (filter === 'pending' && latest) return false
        if (filter !== 'all' && filter !== 'pending') {
          const category = STANDARD_SCORE_CATEGORIES.find((item) => item.key === filter)
          if (!latest || latest.interpretation !== category?.label) return false
        }
        return !term || childName(student).toLocaleLowerCase().includes(term)
      })
  }, [students, assessments, search, filter, today])

  const sortedRows = useMemo(() => {
    const valueFor = ({ student, latest, age }) => {
      if (sortConfig.key === 'age') return age ? age.years * 372 + age.months * 31 + age.days : null
      if (sortConfig.key === 'date') return latest?.assessment_date || null
      if (sortConfig.key === 'score') return latest ? (latest.standard_score ?? latest.total_scaled_score ?? null) : null
      if (sortConfig.key === 'result') return latest?.interpretation ? (latest.standard_score ?? latest.total_scaled_score ?? null) : null
      return childName(student)
    }
    return [...rows].sort((first, second) => {
      const firstValue = valueFor(first)
      const secondValue = valueFor(second)
      if (firstValue == null && secondValue == null) return childName(first.student).localeCompare(childName(second.student))
      if (firstValue == null) return 1
      if (secondValue == null) return -1
      const comparison = typeof firstValue === 'number' && typeof secondValue === 'number'
        ? firstValue - secondValue
        : String(firstValue).localeCompare(String(secondValue), undefined, { numeric: true, sensitivity: 'base' })
      return sortConfig.direction === 'asc' ? comparison : -comparison
    })
  }, [rows, sortConfig])

  function changeSort(key) {
    setSortConfig((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  function sortableHeading(key, label) {
    const active = sortConfig.key === key
    const direction = active ? sortConfig.direction : null
    return <th scope="col" aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className={`growth-sort-button${active ? ' active' : ''}`} onClick={() => changeSort(key)}>{label}<i className={`app-icon ${active && direction === 'desc' ? 'app-icon-sort-za' : 'app-icon-sort-az'} growth-sort-icon`} aria-hidden="true" /></button></th>
  }

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visibleRows = sortedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const historyRows = historyStudent ? (assessments[historyStudent.id] || []) : []
  const trendResults = useMemo(() => historyRows.map(resultFromRow), [historyRows])
  const canReassess = historyStudent ? Boolean(getAgeGroup(computeAge(historyStudent.birth_date, today))) : false
  const shownHistory = historyRows.find((row) => row.id === historyId) || historyRows[0]

  function openStudent(student) {
    if ((assessments[student.id] || []).length > 0) { setHistoryStudent(student); setHistoryId(''); setHistoryView('result') }
    else setAssessing(student)
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    const { error } = await supabase.from('eccd_assessments').delete().eq('id', pendingDelete.id)
    setDeleting(false)
    if (error) { setMessage('Unable to delete this assessment.'); setPendingDelete(null); return }
    setPendingDelete(null)
    setHistoryId('')
    setNotice('Assessment deleted.')
    load()
  }

  return (
    <section className="growth-panel growth-directory-panel eccd-panel">
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={4000} variant="success" />
      {assessing && <EccdAssessmentDialog student={assessing} onClose={() => setAssessing(null)} onSaved={() => { setNotice('Assessment saved.'); load() }} />}
      {pendingDelete && <ConfirmDialog title="Delete this assessment?" message={`The ${formatResultDate(pendingDelete.assessment_date)} assessment will be removed for you and the parent. This cannot be undone.`} confirmLabel="Delete" busy={deleting} onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />}

      {historyStudent && (
        <div className="semester-dialog-overlay eccd-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryStudent(null) }}>
          <section className="semester-dialog eccd-dialog" role="dialog" aria-modal="true" aria-labelledby="eccd-history-title">
            <header className="semester-dialog-header">
              <div><h2 id="eccd-history-title">{childName(historyStudent)}</h2><p>Developmental assessment results</p></div>
              <button type="button" className="popup-close-button" onClick={() => setHistoryStudent(null)} aria-label="Close results"><i className="app-icon app-icon-close" aria-hidden="true" /></button>
            </header>
            <div className="eccd-dialog-body">
              {!shownHistory ? <p className="growth-empty">No assessment has been recorded for this student.</p> : <>
                <div className="eccd-view-toggle" role="group" aria-label="Result view">
                  <button type="button" className={historyView === 'result' ? 'active' : ''} aria-pressed={historyView === 'result'} onClick={() => setHistoryView('result')}>Result</button>
                  <button type="button" className={historyView === 'progress' ? 'active' : ''} aria-pressed={historyView === 'progress'} onClick={() => setHistoryView('progress')}>Progress Graph</button>
                </div>
                {historyView === 'progress' ? <EccdTrendChart results={trendResults} /> : <>
                  <div className="eccd-history-picker">
                    {historyRows.map((row) => (
                      <button key={row.id} type="button" className={row.id === shownHistory.id ? 'active' : ''} onClick={() => setHistoryId(row.id)}>{formatResultDate(row.assessment_date)}</button>
                    ))}
                  </div>
                  <EccdResultCard result={resultFromRow(shownHistory)} showRaw />
                  <p className="eccd-note">Assessed by {shownHistory.assessor_name}. Parents see only the result above (scaled scores, standard score and interpretation), not the raw scores.</p>
                </>}
                <div className="semester-dialog-actions">
                  {historyView === 'result' && <button type="button" className="button-secondary eccd-delete-button" onClick={() => setPendingDelete(shownHistory)}>Delete Assessment</button>}
                  <button type="button" className="approve-button" disabled={!canReassess} title={canReassess ? undefined : 'No ECCD table is loaded for this age'} onClick={() => { const student = historyStudent; setHistoryStudent(null); setAssessing(student) }}>New Assessment</button>
                </div>
              </>}
            </div>
          </section>
        </div>
      )}

      <header className="growth-header"><h2>Developmental Assessment</h2></header>
      <div className="growth-directory-heading">
        <span>Latest Assessments</span>
        <strong>{rows.length} students</strong>
      </div>
      <p className="growth-directory-instruction">Click a student row to record an assessment or view their results. ECCD Checklist (Child&apos;s Record 2, ages 3.1 to 5.11).</p>

      <div className="growth-directory-toolbar">
        <label className="growth-directory-search">
          <span className="visually-hidden">Filter students</span>
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Filter by student name" />
        </label>
        <div className="growth-directory-filter">
          <PaginatedDropdown options={CATEGORY_OPTIONS} value={filter} onChange={(value) => { setFilter(value); setPage(1) }} ariaLabel="Category" />
        </div>
      </div>

      {message && <p className="growth-message" role="status">{message}</p>}

      {loading ? <p className="growth-empty app-loading" role="status">Loading developmental assessments...</p> : (
        <div className="records-table-shell growth-table-shell">
          <table className="records-table growth-records-table eccd-directory-table">
            <caption className="visually-hidden">Student developmental assessments</caption>
            <thead><tr>{sortableHeading('name', 'Name')}{sortableHeading('age', 'Age')}{sortableHeading('date', 'Last assessed')}{sortableHeading('score', 'Standard score')}{sortableHeading('result', 'Result')}</tr></thead>
            <tbody>{visibleRows.length === 0 ? (
              <tr className="growth-table-empty-row"><td colSpan="5">No students match this category.</td></tr>
            ) : visibleRows.map(({ student, latest, age }) => (
              <tr key={student.id} className="growth-student-row interactive" tabIndex={0} aria-label={`${latest ? 'View or add' : 'Start'} developmental assessment for ${childName(student)}`} onClick={() => openStudent(student)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openStudent(student) } }}>
                <td data-label="Name"><strong className="records-student-name">{childName(student)}</strong></td>
                <td data-label="Age">{formatAge(age)}</td>
                <td data-label="Last assessed">{latest ? formatResultDate(latest.assessment_date) : 'Not yet'}</td>
                <td data-label="Standard score">{latest ? standardScoreLabel(resultFromRow(latest)) : '—'}</td>
                <td data-label="Result">{latest?.interpretation || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <TablePagination currentPage={safePage} totalItems={rows.length} pageSize={PAGE_SIZE} onPageChange={setPage} ariaLabel="Developmental assessment pages" />
    </section>
  )
}

export default EccdAssessmentPanel
