import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import LoadingSpinner from '../components/LoadingSpinner'
import StaffReferenceSearch from '../components/StaffReferenceSearch'
import { getEnrollmentWindow, getEnrollmentWindowStatus } from '../lib/enrollmentWindow'

function HomePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [showDashboardChildPicker, setShowDashboardChildPicker] = useState(false)
  const [loading, setLoading] = useState(true)
  const [enrollmentWindow, setEnrollmentWindow] = useState(undefined)

  useEffect(() => {
    checkUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(checkUser)
    return () => subscription.unsubscribe()
  }, [])

  async function checkUser() {
    setLoading(true)
    const windowResult = await getEnrollmentWindow()
    if (!windowResult.error) setEnrollmentWindow(windowResult.data)
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

  function avatarColor(item) {
    const colors = ['#c0567a', '#4776a8', '#43857d', '#8a65a8', '#b26a3c', '#647a3d']
    const identity = String(item.id || `${item.child_first_name}${item.child_last_name}`)
    const colorIndex = [...identity].reduce((total, character) => total + character.charCodeAt(0), 0) % colors.length
    return colors[colorIndex]
  }

  const selected = enrollments.find((item) => item.id === selectedId)
  const windowStatus = enrollmentWindow === undefined ? 'open' : getEnrollmentWindowStatus(enrollmentWindow)
  const windowLabel = windowStatus === 'open' ? 'Enrollment Ongoing' : windowStatus === 'scheduled' ? 'Enrollment Opens Soon' : 'Enrollment Closed'

  return <div className="landing-page">
    <AppHeader loggedOutAction="login" />

    <div className="landing-scroll"><main className={`landing-hero${!loading && !user ? ' landing-hero-public' : ''}`}>
      <div className="hero-content">
        <p className={`hero-label enrollment-window-${windowStatus}`}>{windowLabel}</p>
        <h1>Every Child is a Beginning of <span>Something Big.</span></h1>
        <p className="hero-description">Give your little one the best start in learning.<br />Enroll today and become part of the BCDC Family!</p>
        <div className="hero-actions">
          {!loading && !user && <><button type="button" className="primary-cta" onClick={() => navigate('/login')}>Start Enrollment</button><button type="button" className="secondary-cta" onClick={() => navigate('/register')}>Sign Up</button></>}
          {!loading && role === 'parent' && enrollments.length === 0 && <button type="button" className="primary-cta role-dashboard-button" onClick={() => navigate('/enroll')}>Start Enrollment</button>}
          {!loading && role === 'parent' && enrollments.length > 0 && <button type="button" className="primary-cta role-dashboard-button" onClick={openParentDashboard}>Open Parent Dashboard</button>}
          {!loading && role === 'parent' && enrollments.length > 0 && enrollments.length < 3 && <button type="button" className="secondary-cta role-enroll-button" onClick={() => navigate('/enroll')}>Enroll Another</button>}
          {!loading && role === 'teacher' && <button type="button" className="primary-cta role-dashboard-button" onClick={() => navigate('/teacher')}>Open Teacher Portal</button>}
          {!loading && role === 'teacher_aide' && <button type="button" className="primary-cta role-dashboard-button" onClick={() => navigate('/teacher-aide')}>Open Teacher Aide Portal</button>}
        </div>
      </div>

      {(loading || user) && <div className="hero-panel"><div className={`hero-card${!loading && user && role === 'parent' ? ' home-child-card' : ''}`}>
        {loading ? <LoadingSpinner label="Loading your home page..." /> : user && role === 'parent' ? (selected ? <>
          <header className="hero-card-header enrolled-child-header"><div><span>Enrolled Child</span><small>Enrollment record and current status</small></div>{enrollments.length > 1 && <button type="button" className="home-switch-child" onClick={() => setSelectedId(null)} aria-label="Switch child"><i className="app-icon app-icon-swap" aria-hidden="true" /></button>}</header>
          <div className="home-child-card-body">
            <div className="home-selected-child-heading"><div className="home-child-avatar" style={{ backgroundColor: avatarColor(selected) }}>{initials(selected)}</div><div><h3>{selected.child_first_name} {selected.child_last_name}</h3><span className={`enrollment-status ${selected.status}`}>{selected.status}</span></div></div>
            <p className="status-message">{statusMessage(selected.status)}</p>
            <div className="enrollment-details"><div><span>Reference Code</span><strong>{selected.reference_code}</strong></div><div><span>Submitted</span><strong>{formatDate(selected.submitted_at)}</strong></div></div>
          </div>
        </> : <>
          <header className="hero-card-header enrolled-child-header"><div><span>Enrolled Child</span><small>Select a child to view their enrollment</small></div><span className="status-dot" /></header>
          <div className="home-child-card-body">
            {enrollments.length === 0 ? <div className="empty-enrollment"><h3>No enrolled child yet</h3><p>Use Start Enrollment to submit your child&apos;s information.</p></div> : <div className="home-child-selector">
              {enrollments.map((item) => <button type="button" className="home-child-choice" key={item.id} onClick={() => setSelectedId(item.id)}><span className="home-child-avatar" style={{ backgroundColor: avatarColor(item) }}>{initials(item)}</span><strong>{item.child_first_name}</strong></button>)}
            </div>}
            {enrollments.length === 3 && <div className="home-child-limit"><strong>All child enrollment slots are filled</strong><span>This account is ready to manage its enrolled children.</span></div>}
          </div>
        </>) : <StaffReferenceSearch />}
      </div></div>}
    </main></div>

    {!loading && role === 'parent' && enrollments.length > 1 && showDashboardChildPicker && (
      <div className="child-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="child-picker-title">
        <div className="child-picker-dialog">
          <button type="button" className="child-picker-close" onClick={() => setShowDashboardChildPicker(false)} aria-label="Close child selector">×</button>
          <h2 id="child-picker-title">Which child are you viewing?</h2>
          <p>Select a child to open the correct enrollment information.</p>
          <div className="home-child-selector">
            {enrollments.map((item) => <button type="button" className="home-child-choice" key={item.id} onClick={() => navigate(`/parent?child=${item.id}`)}><span className="home-child-avatar" style={{ backgroundColor: avatarColor(item) }}>{initials(item)}</span><strong>{item.child_first_name}</strong></button>)}
          </div>
          {enrollments.length === 3 && <div className="home-child-limit"><strong>All child enrollment slots are filled</strong><span>This account is ready to manage its enrolled children.</span></div>}
        </div>
      </div>
    )}
  </div>
}

export default HomePage
