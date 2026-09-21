import { useEffect, useMemo, useState } from 'react'
import PaginatedDropdown from './PaginatedDropdown'
import TablePagination from './TablePagination'

const PAGE_SIZE = 10
const REQUEST_TYPE_OPTIONS = [
  { value: 'all', label: 'All requests' },
  { value: 'new', label: 'New requests' },
  { value: 'resubmission', label: 'Resubmissions' },
]

function formatStudentName(student) {
  const lastName = String(student?.child_last_name || '').trim()
  const givenNames = [student?.child_first_name, student?.child_middle_name, student?.child_suffix]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')

  if (lastName && givenNames) return `${lastName}, ${givenNames}`
  return lastName || givenNames || 'Unnamed student'
}

function formatDate(value, includeTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
}

function formatBirthDate(value) {
  if (!value) return '—'
  return formatDate(`${value}T00:00:00`)
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
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

function formatValue(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

function formatSex(value) {
  if (!value) return '—'
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function formatPlaceOfBirth(value) {
  if (!value) return '—'
  return String(value).replace(/,\s*Philippines\s*$/i, '').trim()
}

function EnrollmentRequestsDirectory({ enrollments, canReview = false, reviewingId = null, onReview }) {
  const requests = useMemo(() => enrollments.filter((item) => item.status === 'pending'), [enrollments])
  const [search, setSearch] = useState('')
  const [requestTypeFilter, setRequestTypeFilter] = useState('all')
  const [sortConfig, setSortConfig] = useState({ key: 'submitted', direction: 'desc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [reviewReason, setReviewReason] = useState('')
  const [reviewError, setReviewError] = useState('')
  const selectedRequest = requests.find((item) => item.id === selectedId) || null

  useEffect(() => {
    if (!selectedRequest) return undefined
    function closeOnEscape(event) {
      if (event.key === 'Escape') setSelectedId(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedRequest])

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return requests.filter((request) => {
      const requestType = request.resubmitted_at ? 'resubmission' : 'new'
      if (requestTypeFilter !== 'all' && requestType !== requestTypeFilter) return false
      if (!term) return true
      return [
        formatStudentName(request),
        calculateAge(request.birth_date),
        formatSex(request.sex),
        request.parent_full_name,
        request.resubmitted_at ? 'Resubmission' : 'New Request',
        request.reference_code,
        formatDate(request.submitted_at, true),
      ].some((value) => String(value || '').toLocaleLowerCase().includes(term))
    })
  }, [requestTypeFilter, requests, search])

  const sortedRequests = useMemo(() => [...filteredRequests].sort((first, second) => {
    const valueFor = (request) => {
      if (sortConfig.key === 'name') return formatStudentName(request)
      if (sortConfig.key === 'age') return calculateAge(request.birth_date)
      if (sortConfig.key === 'gender') return formatSex(request.sex)
      if (sortConfig.key === 'type') return request.resubmitted_at ? 'Resubmission' : 'New Request'
      return request.submitted_at ? new Date(request.submitted_at).getTime() : null
    }
    const firstValue = valueFor(first)
    const secondValue = valueFor(second)

    if (firstValue == null && secondValue == null) return 0
    if (firstValue == null) return 1
    if (secondValue == null) return -1
    const comparison = typeof firstValue === 'number' && typeof secondValue === 'number'
      ? firstValue - secondValue
      : String(firstValue).localeCompare(String(secondValue), undefined, { numeric: true, sensitivity: 'base' })
    return sortConfig.direction === 'asc' ? comparison : -comparison
  }), [filteredRequests, sortConfig])

  const totalPages = Math.max(1, Math.ceil(sortedRequests.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const visibleRequests = sortedRequests.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function changeSort(key) {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
    setCurrentPage(1)
  }

  function openRequest(requestId) {
    setReviewReason('')
    setReviewError('')
    setSelectedId(requestId)
  }

  function sortableHeading(key, label) {
    const active = sortConfig.key === key
    const direction = active ? sortConfig.direction : null
    return <th scope="col" aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className={`growth-sort-button${active ? ' active' : ''}`} onClick={() => changeSort(key)}>{label}<i className={`app-icon ${active && direction === 'desc' ? 'app-icon-sort-za' : 'app-icon-sort-az'} growth-sort-icon`} aria-hidden="true" /></button></th>
  }

  async function requestResubmission() {
    const reason = reviewReason.trim()
    if (reason.length < 5) {
      setReviewError('Add a clear reason using at least 5 characters.')
      return
    }

    setReviewError('')
    await onReview(selectedRequest.id, 'rejected', reason)
  }

  return (
    <>
      <section className="growth-panel growth-directory-panel student-reports-directory enrollment-requests-directory">
        <header className="growth-header"><h2>Enrollment Requests</h2></header>
        <div className="growth-directory-heading"><span>Pending Applications</span><strong>{filteredRequests.length} requests</strong></div>
        <p className="growth-directory-instruction">Click an application row to view its complete information.</p>
        <div className="growth-directory-toolbar enrollment-requests-toolbar">
          <label className="growth-directory-search"><span className="visually-hidden">Filter enrollment requests</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1) }} placeholder="Filter by name, age, gender, parent, request type, reference code, or date" /></label>
          <div className="growth-directory-filter"><PaginatedDropdown options={REQUEST_TYPE_OPTIONS} value={requestTypeFilter} onChange={(value) => { setRequestTypeFilter(value); setCurrentPage(1) }} ariaLabel="Filter by request type" pageSize={10} /></div>
        </div>

        <div className="records-table-shell growth-table-shell">
          <table className="records-table growth-records-table enrollment-requests-table">
            <caption className="visually-hidden">Pending enrollment requests</caption>
            <thead><tr>{sortableHeading('name', 'Name')}{sortableHeading('age', 'Age')}{sortableHeading('gender', 'Gender')}<th scope="col">Reference Code</th>{sortableHeading('type', 'Request Type')}{sortableHeading('submitted', 'Date Submitted')}</tr></thead>
            <tbody>{visibleRequests.length === 0 ? <tr className="growth-table-empty-row"><td colSpan="6">{search.trim() || requestTypeFilter !== 'all' ? 'No requests match your filters.' : 'No pending applications.'}</td></tr> : visibleRequests.map((request) => (
              <tr key={request.id} className="student-report-row interactive" tabIndex="0" onClick={() => openRequest(request.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRequest(request.id) } }}>
                <td data-label="Name"><strong className="records-student-name">{formatStudentName(request)}</strong></td>
                <td data-label="Age">{calculateAge(request.birth_date)}</td>
                <td data-label="Gender">{formatSex(request.sex)}</td>
                <td data-label="Reference Code">{request.reference_code || '—'}</td>
                <td data-label="Request Type">{request.resubmitted_at ? 'Resubmission' : 'New Request'}</td>
                <td data-label="Date Submitted">{formatDate(request.submitted_at)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        <TablePagination currentPage={safePage} totalItems={filteredRequests.length} onPageChange={setCurrentPage} pageSize={PAGE_SIZE} ariaLabel="Enrollment request pages" />
      </section>

      {selectedRequest && (
        <div className="semester-dialog-overlay student-report-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null) }}>
          <section className="semester-dialog student-report-dialog enrollment-request-dialog" role="dialog" aria-modal="true" aria-labelledby="enrollment-request-title">
            <header className="semester-dialog-header">
              <div><h2 id="enrollment-request-title">Full Details</h2><p>Complete enrollment application information.</p></div>
              <button type="button" className="popup-close-button" onClick={() => setSelectedId(null)} aria-label="Close application details"><i className="app-icon app-icon-close" aria-hidden="true" /></button>
            </header>
            <div className="student-report-dialog-body">
              <div className="student-report-body">
                <section className="student-report-section">
                  <div className="student-report-section-heading"><h3>Application Details</h3></div>
                  <dl className="student-report-grid">
                    <div><dt>Date Submitted</dt><dd>{formatDate(selectedRequest.submitted_at)}</dd></div>
                    <div><dt>Time</dt><dd>{formatTime(selectedRequest.submitted_at)}</dd></div>
                    <div><dt>Parent</dt><dd>{formatValue(selectedRequest.parent_full_name)}</dd></div>
                    <div><dt>Email</dt><dd>{formatValue(selectedRequest.parent_email)}</dd></div>
                  </dl>
                </section>
                <section className="student-report-section">
                  <div className="student-report-section-heading"><h3>Child Information</h3></div>
                  <dl className="student-report-grid">
                    <div><dt>Last Name</dt><dd>{formatValue(selectedRequest.child_last_name)}</dd></div>
                    <div><dt>First Name</dt><dd>{formatValue(selectedRequest.child_first_name)}</dd></div>
                    <div><dt>Middle Name</dt><dd>{formatValue(selectedRequest.child_middle_name)}</dd></div>
                    <div><dt>Reference Code</dt><dd>{formatValue(selectedRequest.reference_code)}</dd></div>
                    <div><dt>Age</dt><dd>{calculateAge(selectedRequest.birth_date)}</dd></div>
                    <div><dt>Date of Birth</dt><dd>{formatBirthDate(selectedRequest.birth_date)}</dd></div>
                    <div><dt>Gender</dt><dd>{formatSex(selectedRequest.sex)}</dd></div>
                    <div><dt>Place of Birth</dt><dd>{formatPlaceOfBirth(selectedRequest.place_of_birth)}</dd></div>
                    <div><dt>Previously Registered</dt><dd>{typeof selectedRequest.is_registered === 'boolean' ? (selectedRequest.is_registered ? 'Yes' : 'No') : '—'}</dd></div>
                    <div><dt>Mother Tongue</dt><dd>{formatValue(selectedRequest.mother_tongue)}</dd></div>
                    <div><dt>Other Dialect</dt><dd>{formatValue(selectedRequest.other_dialect)}</dd></div>
                  </dl>
                </section>
              </div>
              {canReview && (
                <div className="enrollment-request-review">
                  <label htmlFor="resubmission-reason">Reason for resubmission</label>
                  <textarea id="resubmission-reason" value={reviewReason} onChange={(event) => { setReviewReason(event.target.value); setReviewError('') }} maxLength={500} rows={3} placeholder="Explain what information the parent needs to correct." />
                  <div className="enrollment-request-review-meta"><span>{reviewReason.length} / 500</span>{reviewError && <strong role="alert">{reviewError}</strong>}</div>
                  <div className="enrollment-request-review-actions">
                    <button type="button" className="reject-button" disabled={reviewingId === selectedRequest.id} onClick={requestResubmission}>Request Resubmission</button>
                    <button type="button" className="approve-button" disabled={reviewingId === selectedRequest.id} onClick={() => onReview(selectedRequest.id, 'approved', '')}>Accept</button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  )
}

export default EnrollmentRequestsDirectory
