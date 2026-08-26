import { useState } from 'react'
import { supabase } from '../lib/supabase'

function StaffReferenceSearch() {
  const [referenceCode, setReferenceCode] = useState('')
  const [result, setResult] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSearch(event) {
    event.preventDefault()
    const cleanedCode = referenceCode.trim().toUpperCase()
    setResult(null)
    setMessage('')

    if (!cleanedCode) {
      setMessage('Enter a reference code.')
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        id,
        child_first_name,
        child_middle_name,
        child_last_name,
        child_suffix,
        birth_date,
        sex,
        status,
        reference_code,
        submitted_at
      `)
      .eq('reference_code', cleanedCode)
      .maybeSingle()
    setLoading(false)

    if (error) {
      setMessage('Unable to search applications right now.')
      return
    }

    if (!data) {
      setMessage('No application found with that reference code.')
      return
    }

    setResult(data)
  }

  const childName = result
    ? [
        result.child_first_name,
        result.child_middle_name,
        result.child_last_name,
        result.child_suffix,
      ].filter(Boolean).join(' ')
    : ''

  return (
    <section className="pending-approvals-panel staff-reference-panel">
      <div className="pending-approvals-header">
        <div>
          <h2>Find an Application</h2>
          <p>Search using the child’s enrollment reference code.</p>
        </div>
      </div>

      <form className="staff-reference-form" onSubmit={handleSearch}>
        <input
          type="text"
          value={referenceCode}
          onChange={(event) => setReferenceCode(event.target.value)}
          placeholder="ENR-2026-ABC123"
          aria-label="Enrollment reference code"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {message && <p className="teacher-dashboard-message">{message}</p>}

      {result && (
        <article className="staff-reference-result">
          <div>
            <span>Child</span>
            <strong>{childName}</strong>
          </div>
          <div>
            <span>Reference Code</span>
            <strong>{result.reference_code}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong className={`enrollment-status ${result.status}`}>
              {result.status}
            </strong>
          </div>
        </article>
      )}
    </section>
  )
}

export default StaffReferenceSearch
