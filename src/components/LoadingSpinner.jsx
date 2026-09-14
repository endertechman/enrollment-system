function LoadingSpinner({ label = 'Loading...', fullPage = false, compact = false, inline = false }) {
  const className = `app-loading${fullPage ? ' app-loading-full-page' : ''}${compact ? ' app-loading-compact' : ''}${inline ? ' app-loading-inline' : ''}`

  return (
    <div className={className} role="status" aria-live="polite">
      <div className="lds-spinner" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => <div key={index} />)}
      </div>
      <span className={inline ? 'app-loading-label' : 'visually-hidden'}>{label}</span>
    </div>
  )
}

export default LoadingSpinner
