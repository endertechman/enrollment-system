import AppHeader from './AppHeader'
import LoadingSpinner from './LoadingSpinner'

function DashboardLoadingShell({ role = 'staff', label = 'Loading dashboard...' }) {
  const isParent = role === 'parent'
  const pageClassName = isParent
    ? 'parent-dashboard-page dashboard-loading-page'
    : 'teacher-dashboard-page teacher-aide-dashboard-page dashboard-loading-page'
  const scrollClassName = isParent ? 'parent-dashboard-scroll' : 'teacher-dashboard-scroll'
  const contentClassName = isParent ? 'parent-dashboard-content' : 'teacher-dashboard-content'

  return (
    <div className={pageClassName}>
      <AppHeader />
      <main className={scrollClassName} aria-busy="true" aria-label={label}>
        <div className={`${contentClassName} dashboard-loading-content`}>
          <section className="dashboard-loading-intro" aria-hidden="true">
            <div className="dashboard-loading-copy">
              <span className="dashboard-loading-line dashboard-loading-label" />
              <span className="dashboard-loading-line dashboard-loading-title" />
              <span className="dashboard-loading-line dashboard-loading-description" />
            </div>
            <div className="dashboard-loading-summary">
              <span className="dashboard-loading-line" />
              <span className="dashboard-loading-line" />
            </div>
          </section>

          <div className="dashboard-loading-layout">
            <div className="dashboard-loading-navigation" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => <span className="dashboard-loading-line" key={index} />)}
            </div>
            <section className="dashboard-loading-panel">
              <div className="dashboard-loading-panel-title" aria-hidden="true"><span className="dashboard-loading-line" /></div>
              <LoadingSpinner label={label} compact />
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}

export default DashboardLoadingShell
