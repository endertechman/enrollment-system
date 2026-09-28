import { useMemo, useState } from 'react'
import PaginatedDropdown from './PaginatedDropdown'
import TablePagination from './TablePagination'
import { getAgeInYears } from '../lib/philippineDate'

const PAGE_SIZE = 10

function formatStudentName(student) {
  const lastName = String(student?.child_last_name || '').trim()
  const givenNames = [student?.child_first_name, student?.child_middle_name, student?.child_suffix]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')

  if (lastName && givenNames) return `${lastName}, ${givenNames}`
  return lastName || givenNames || 'Unnamed student'
}

function calculateAge(birthDate) {
  return getAgeInYears(birthDate)
}

function formatGender(value) {
  const gender = String(value || '').trim().toLocaleLowerCase()
  if (gender === 'male') return 'Male'
  if (gender === 'female') return 'Female'
  return '—'
}

function formatBirthDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

const STUDENT_STATES = ['enrolled', 'withdrawn', 'dropped']
const STATE_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...STUDENT_STATES.map((state) => ({ value: state, label: `${state.charAt(0).toUpperCase()}${state.slice(1)}` })),
]

function formatStudentState(value) {
  const state = STUDENT_STATES.includes(value) ? value : 'enrolled'
  return `${state.charAt(0).toUpperCase()}${state.slice(1)}`
}

function StudentReportsDirectory({ enrollments, onOpenReport }) {
  const students = useMemo(() => enrollments.filter((item) => item.status === 'approved'), [enrollments])
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('all')
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
  const [currentPage, setCurrentPage] = useState(1)

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return students.filter((student) => {
      const studentState = STUDENT_STATES.includes(student.student_state) ? student.student_state : 'enrolled'
      if (stateFilter !== 'all' && studentState !== stateFilter) return false
      if (!term) return true
      return [
        formatStudentName(student),
        formatStudentState(student.student_state),
        calculateAge(student.birth_date),
        formatGender(student.sex),
        student.parent_full_name,
        formatBirthDate(student.birth_date),
      ].some((value) => String(value ?? '').toLocaleLowerCase().includes(term))
    })
  }, [search, stateFilter, students])

  const sortedStudents = useMemo(() => {
    const valueFor = (student) => {
      if (sortConfig.key === 'name') return formatStudentName(student)
      if (sortConfig.key === 'state') return student.student_state || 'enrolled'
      if (sortConfig.key === 'age') return calculateAge(student.birth_date)
      if (sortConfig.key === 'gender') return formatGender(student.sex)
      if (sortConfig.key === 'parent') return student.parent_full_name || ''
      if (sortConfig.key === 'birthDate') return student.birth_date ? new Date(`${student.birth_date}T00:00:00`).getTime() : null
      return ''
    }

    return [...filteredStudents].sort((first, second) => {
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
  }, [filteredStudents, sortConfig])

  const totalPages = Math.max(1, Math.ceil(sortedStudents.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const visibleStudents = sortedStudents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

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

  return (
    <section className="growth-panel growth-directory-panel student-reports-directory">
      <header className="growth-header"><h2>Student Reports</h2></header>
      <div className="growth-directory-heading"><span>Enrolled Students</span><strong>{filteredStudents.length} students</strong></div>
      <p className="growth-directory-instruction">Click a student row to view their complete reports.</p>
      <div className="growth-directory-toolbar student-reports-toolbar">
        <label className="growth-directory-search"><span className="visually-hidden">Filter enrolled students</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1) }} placeholder="Filter by name, status, age, gender, parent, or birth date" /></label>
        <div className="growth-directory-filter"><PaginatedDropdown options={STATE_FILTER_OPTIONS} value={stateFilter} onChange={(value) => { setStateFilter(value); setCurrentPage(1) }} ariaLabel="Filter students by status" pageSize={10} /></div>
      </div>

      <div className="records-table-shell growth-table-shell">
        <table className="records-table growth-records-table student-records-table">
          <caption className="visually-hidden">Enrolled student reports</caption>
          <thead><tr>{sortableHeading('name', 'Name')}{sortableHeading('age', 'Age')}{sortableHeading('gender', 'Gender')}{sortableHeading('parent', 'Parent')}{sortableHeading('birthDate', 'Birth Date')}{sortableHeading('state', 'Status')}</tr></thead>
          <tbody>{visibleStudents.length === 0 ? <tr className="growth-table-empty-row"><td colSpan="6">{search.trim() || stateFilter !== 'all' ? 'No students match your filters.' : 'No enrolled students found.'}</td></tr> : visibleStudents.map((student) => <tr key={student.id} className="student-report-row interactive" tabIndex="0" onClick={() => onOpenReport(student.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenReport(student.id) } }}>
            <td data-label="Name"><strong className="records-student-name">{formatStudentName(student)}</strong></td>
            <td data-label="Age">{calculateAge(student.birth_date) ?? '—'}</td>
            <td data-label="Gender">{formatGender(student.sex)}</td>
            <td data-label="Parent">{student.parent_full_name || '—'}</td>
            <td data-label="Birth Date">{formatBirthDate(student.birth_date)}</td>
            <td data-label="Status">{formatStudentState(student.student_state)}</td>
          </tr>)}</tbody>
        </table>
      </div>

      <TablePagination currentPage={safePage} totalItems={filteredStudents.length} onPageChange={setCurrentPage} pageSize={PAGE_SIZE} ariaLabel="Student report pages" />
    </section>
  )
}

export default StudentReportsDirectory
