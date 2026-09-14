import { useNavigate } from 'react-router-dom'
import AppHeader from '../AppHeader'
import { getEnrollmentWindowStatus } from '../../lib/enrollmentWindow'

function GuestHomeView({ enrollmentWindow }) {
  const navigate = useNavigate()
  const windowStatus = enrollmentWindow === undefined ? 'open' : getEnrollmentWindowStatus(enrollmentWindow)
  const windowLabel = windowStatus === 'open' ? 'Enrollment Ongoing' : windowStatus === 'scheduled' ? 'Enrollment Opens Soon' : 'Enrollment Closed'

  return (
    <div className="landing-page">
      <AppHeader loggedOutAction="login" />
      <div className="landing-scroll">
        <main className="landing-hero landing-hero-public">
          <div className="hero-content">
            <p className={`hero-label enrollment-window-${windowStatus}`}>{windowLabel}</p>
            <h1>Every Child is a Beginning of <span>Something Big.</span></h1>
            <p className="hero-description">Give your little one the best start in learning.<br />Enroll today and become part of the BCDC Family!</p>
            <div className="hero-actions">
              <button type="button" className="primary-cta" onClick={() => navigate('/login')}>Start Enrollment</button>
              <button type="button" className="secondary-cta" onClick={() => navigate('/register')}>Sign Up</button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default GuestHomeView
