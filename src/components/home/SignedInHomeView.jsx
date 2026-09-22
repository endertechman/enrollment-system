import { useNavigate } from 'react-router-dom'
import AppHeader from '../AppHeader'
import StaffReferenceSearch from '../StaffReferenceSearch'
import { getEnrollmentWindowStatus } from '../../lib/enrollmentWindow'

function formatSemesterDate(value) {
  if (!value) return 'To be announced'
  const date = new Date(`${value}T00:00:00+08:00`)
  return Number.isNaN(date.getTime()) ? 'To be announced' : date.toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila',
  })
}

function formatEnrollmentDate(value) {
  if (!value) return 'To be announced'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'To be announced' : date.toLocaleString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  })
}

function SignedInHomeView({ role, enrollments, enrollmentWindow, enrollmentBatch }) {
  const navigate = useNavigate()
  const windowStatus = enrollmentWindow === undefined ? 'unavailable' : getEnrollmentWindowStatus(enrollmentWindow)
  const windowLabel = windowStatus === 'open' ? 'Enrollment Ongoing' : windowStatus === 'scheduled' ? 'Enrollment Opens Soon' : windowStatus === 'unavailable' ? 'Schedule Unavailable' : 'Enrollment Closed'

  return (
    <div className="landing-page">
      <AppHeader loggedOutAction="login" />
      <div className="landing-scroll">
        <main className="landing-hero landing-hero-signed-in">
          <div className="hero-content">
            <p className={`hero-label enrollment-window-${windowStatus}`}>{windowLabel}</p>
            <h1>Every Child is a Beginning of <span>Something Big.</span></h1>
            <p className="hero-description">Give your little one the best start in learning.<br />Enroll today and become part of the BCDC Family!</p>
            <div className="hero-actions">
              {role === 'parent' && enrollments.length === 0 && <button type="button" className="primary-cta role-dashboard-button" onClick={() => navigate('/enroll')}>Start Enrollment</button>}
              {role === 'parent' && enrollments.length > 0 && <button type="button" className="primary-cta role-dashboard-button" onClick={() => navigate('/parent')}>Open Parent Dashboard</button>}
              {role === 'parent' && enrollments.length > 0 && enrollments.length < 3 && <button type="button" className="secondary-cta role-enroll-button" onClick={() => navigate('/enroll')}>Enroll Another</button>}
              {role === 'teacher' && <button type="button" className="primary-cta role-dashboard-button" onClick={() => navigate('/teacher')}>Open Teacher Portal</button>}
              {role === 'teacher_aide' && <button type="button" className="primary-cta role-dashboard-button" onClick={() => navigate('/teacher-aide')}>Open Teacher Aide Portal</button>}
            </div>
          </div>

          <div className="hero-panel">
            {role === 'parent' ? <section className="hero-card home-schedule-card" aria-labelledby="home-schedule-title">
              <header className="home-schedule-header">
                <span>School calendar</span>
                <h2 id="home-schedule-title">{enrollmentBatch?.name || 'School Year & Enrollment'}</h2>
                <p>Important dates for this semester</p>
              </header>
              <div className="home-schedule-dates">
                <div><span>Enrollment opens</span><strong>{formatEnrollmentDate(enrollmentWindow?.opens_at)}</strong></div>
                <div><span>Enrollment closes</span><strong>{formatEnrollmentDate(enrollmentWindow?.closes_at)}</strong></div>
                <div><span>Semester starts</span><strong>{formatSemesterDate(enrollmentBatch?.starts_on)}</strong></div>
                <div><span>Semester ends</span><strong>{formatSemesterDate(enrollmentBatch?.ends_on)}</strong></div>
              </div>
            </section> : <div className="hero-card"><StaffReferenceSearch /></div>}
          </div>
        </main>
      </div>
    </div>
  )
}

export default SignedInHomeView
