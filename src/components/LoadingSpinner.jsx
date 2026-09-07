function LoadingSpinner({ label = 'Loading...', fullPage = false, compact = false }) {
  const className = `app-loading${fullPage ? ' app-loading-full-page' : ''}${compact ? ' app-loading-compact' : ''}`

  return (
    <div className={className} role="status" aria-live="polite">
      <div className="lds-spinner" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => <div key={index} />)}
      </div>
      <span className="visually-hidden">{label}</span>
    </div>
  )
}

export default LoadingSpinner
