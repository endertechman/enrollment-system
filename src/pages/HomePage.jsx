import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'

function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showDashboardChildPicker, setShowDashboardChildPicker] = useState(false)
  const [referenceCode, setReferenceCode] = useState('')
  const [trackedEnrollment, setTrackedEnrollment] = useState(null)
  const [trackMessage, setTrackMessage] = useState('')
  const [tracking, setTracking] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(checkUser)
    return () => subscription.unsubscribe()
  }, [])

  async function checkUser() {
    setLoading(true)
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      setUser(null); setRole(null); setEnrollments([]); setSelectedId(null); setLoading(false)
      return
    }

    setUser(currentUser)
    const { data: profile, error } = await supabase.from('profiles').select('role, full_name').eq('id', currentUser.id).single()
    if (error) { setLoading(false); return }
    setRole(profile.role)

    if (profile.role === 'parent') {
      const { data } = await supabase.from('enrollments')
        .select('id, child_first_name, child_last_name, status, reference_code, submitted_at')
        .eq('parent_id', currentUser.id).order('submitted_at', { ascending: false })
      const items = data || []
      setEnrollments(items)
      setSelectedId((current) => {
        if (items.some((item) => item.id === current)) return current
        return items.length === 1 ? items[0].id : null
      })
    } else setEnrollments([])
    setLoading(false)
  }

  function openParentDashboard() {
    if (enrollments.length > 1) {
      setShowDashboardChildPicker(true)
      return
    }

    const childId = enrollments[0]?.id
    navigate(childId ? `/parent?child=${childId}` : '/parent')
  }

  async function handleTrackEnrollment(event) {
    event.preventDefault()
    const cleanedCode = referenceCode.trim().toUpperCase()
    setTrackedEnrollment(null)
    setTrackMessage('')

    if (!cleanedCode) {
      setTrackMessage('Enter your reference code.')
      return
    }

    setTracking(true)
    const { data, error } = await supabase.rpc('track_enrollment', {
      lookup_reference: cleanedCode,
    })
    setTracking(false)

    if (error) {
      setTrackMessage('Unable to check the application right now.')
      return
    }

    if (!data || data.length === 0) {
      setTrackMessage('No application found with that reference code.')
      return
    }

    setTrackedEnrollment(data[0])
  }

  function formatDate(date) {
    return date ? new Date(date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'
  }

  function statusMessage(status) {
    if (status === 'approved') return 'Your enrollment application has been accepted.'
    if (status === 'rejected') return 'Your enrollment application was not accepted.'
    return 'Your application is currently being reviewed.'
  }

  function initials(item) {
    return `${item.child_first_name?.[0] || ''}${item.child_last_name?.[0] || ''}`.toUpperCase()
  }

  const selected = enrollments.find((item) => item.id === selectedId)

  return <div className="landing-page">
    <AppHeader loggedOutAction="login" />

    <div className="landing-scroll"><main className="landing-hero">
      <div className="hero-content">
        <p className="hero-label">Enrollment Ongoing</p>
        <h1>Every Child is a Beginning of <span>Something Big.</span></h1>
        <p className="hero-description">Give your little one the best start in learning.<br />Enroll today and become part of the BCDC Family!</p>
        <div className="hero-actions">
          {!loading && !user && <><button type="button" className="primary-cta" onClick={() => navigate('/login')}>Start Enrollment</button><button type="button" className="secondary-cta" onClick={() => navigate('/register')}>Sign Up</button></>}
          {!loading && role === 'parent' && <button type="button" className="primary-cta role-dashboard-button" onClick={openParentDashboard}>Open Parent Dashboard</button>}
          {!loading && role === 'teacher' && <button type="button" className="primary-cta role-dashboard-button" onClick={() => navigate('/teacher')}>Open Teacher Portal</button>}
          {!loading && role === 'teacher_aide' && <button type="button" className="primary-cta role-dashboard-button" onClick={() => navigate('/teacher-aide')}>Open Teacher Aide Portal</button>}
        </div>
      </div>

      <div className="hero-panel"><div className="hero-card home-child-card">
        {loading ? <p>Loading...</p> : user && role === 'parent' ? (selected ? <>
          <button type="button" className="home-switch-child" onClick={() => setSelectedId(null)}><i className="gg-arrows-exchange-alt" aria-hidden="true" /><span>Switch child</span></button>
          <div className="home-selected-child-heading"><div className="home-child-avatar">{initials(selected)}</div><div><h3>{selected.child_first_name} {selected.child_last_name}</h3><span className={`enrollment-status ${selected.status}`}>{selected.status}</span></div></div>
          <p className="status-message">{statusMessage(selected.status)}</p>
          <div className="enrollment-details"><div><span>Reference Code</span><strong>{selected.reference_code}</strong></div><div><span>Submitted</span><strong>{formatDate(selected.submitted_at)}</strong></div></div>
        </> : <>
          <div className="hero-card-header"><span>Who are we checking today?</span><span className="status-dot" /></div>
          <div className="home-child-selector">
            {enrollments.map((item) => <button type="button" className="home-child-choice" key={item.id} onClick={() => setSelectedId(item.id)}><span className="home-child-avatar">{initials(item)}</span><strong>{item.child_first_name}</strong></button>)}
            {enrollments.length < 3 && <button type="button" className="home-child-choice add-child" onClick={() => navigate('/enroll')}><span className="home-child-avatar">+</span><strong>{enrollments.length === 0 ? 'Enroll Your Child' : 'Enroll Another'}</strong></button>}
          </div>
          {enrollments.length === 3 && <div className="home-child-limit"><strong>All child enrollment slots are filled</strong><span>This account is ready to manage its enrolled children.</span></div>}
        </>) : !user ? <div className="public-tracker">
          {!trackedEnrollment ? <>
            <div className="hero-card-header"><span>Enrollment Status</span><span className="status-dot" /></div>
            <h3>Track your application</h3>
            <p>Enter the reference code provided after submitting your enrollment application.</p>
            <form className="tracker-form" onSubmit={handleTrackEnrollment}>
              <input type="text" value={referenceCode} onChange={(event) => setReferenceCode(event.target.value)} placeholder="ENR-2026-ABC123" />
              <button type="submit" disabled={tracking}>{tracking ? 'Checking...' : 'Check Status'}</button>
            </form>
            {trackMessage && <p className="tracker-message">{trackMessage}</p>}
          </> : <div className="tracker-result-display">
            <span className={`enrollment-status ${trackedEnrollment.status}`}>{trackedEnrollment.status}</span>
            <p className="status-message">{statusMessage(trackedEnrollment.status)}</p>
            <div className="enrollment-details"><div><span>Reference Code</span><strong>{trackedEnrollment.reference_code}</strong></div><div><span>Submitted</span><strong>{formatDate(trackedEnrollment.submitted_at)}</strong></div></div>
            <button type="button" className="track-another-button" onClick={() => { setTrackedEnrollment(null); setReferenceCode(''); setTrackMessage('') }}>Check another application</button>
          </div>}
        </div> : <><div className="hero-card-header"><span>Staff Portal</span><span className="status-dot" /></div><p>Open your dashboard to continue.</p></>}
      </div></div>
    </main></div>

    {!loading && role === 'parent' && enrollments.length > 1 && showDashboardChildPicker && (
      <div className="child-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="child-picker-title">
        <div className="child-picker-dialog">
          <button type="button" className="child-picker-close" onClick={() => setShowDashboardChildPicker(false)} aria-label="Close child selector">×</button>
          <h2 id="child-picker-title">Which child are you viewing?</h2>
          <p>Select a child to open the correct enrollment information.</p>
          <div className="home-child-selector">
            {enrollments.map((item) => <button type="button" className="home-child-choice" key={item.id} onClick={() => navigate(`/parent?child=${item.id}`)}><span className="home-child-avatar">{initials(item)}</span><strong>{item.child_first_name}</strong></button>)}
            {enrollments.length < 3 && <button type="button" className="home-child-choice add-child" onClick={() => navigate('/enroll')}><span className="home-child-avatar">+</span><strong>Enroll Another</strong></button>}
          </div>
          {enrollments.length === 3 && <div className="home-child-limit"><strong>All child enrollment slots are filled</strong><span>This account is ready to manage its enrolled children.</span></div>}
        </div>
      </div>
    )}
  </div>
}

export default HomePage
