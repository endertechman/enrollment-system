import { useState } from 'react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from './LoadingSpinner'

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
      .select('child_first_name, child_last_name, child_suffix, status, reference_code, submitted_at')
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
    ? [result.child_first_name, result.child_last_name, result.child_suffix]
        .filter(Boolean)
        .join(' ')
    : ''

  return (
    <section className="home-staff-tracker">
      <div className="hero-card-header">
        <div>
          <span>Live Enrollment Status</span>
          <small>Search using the parent&apos;s reference code</small>
        </div>
        <span className="status-dot" />
      </div>

      <form className="home-tracker-form" onSubmit={handleSearch}>
        <label htmlFor="home-reference-code">Reference code</label>
        <div>
          <input
            id="home-reference-code"
            type="text"
            value={referenceCode}
            onChange={(event) => setReferenceCode(event.target.value)}
            placeholder="ENR-2026-ABC123"
            autoComplete="off"
          />
          <button type="submit" disabled={loading}>
            {loading ? <LoadingSpinner label="Searching..." inline /> : 'Check Status'}
          </button>
        </div>
      </form>

      {message && <p className="home-tracker-message">{message}</p>}

      {result && (
        <article className="home-tracker-result">
          <div>
            <span>Child</span>
            <strong>{childName}</strong>
          </div>
          <div>
            <span>Reference</span>
            <strong>{result.reference_code}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong className={`enrollment-status ${result.status}`}>
              {result.status === 'approved' ? 'accepted' : result.status}
            </strong>
          </div>
        </article>
      )}
    </section>
  )
}

export default StaffReferenceSearch
