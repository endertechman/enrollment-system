import { useEffect, useRef, useState } from 'react'

function AuthToast({ message, onDismiss, duration = 8000 }) {
  const dismissRef = useRef(onDismiss)
  const manualDismissTimer = useRef(null)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!message) {
      const resetTimer = window.setTimeout(() => setIsLeaving(false), 0)
      return () => window.clearTimeout(resetTimer)
    }

    const fadeTimer = window.setTimeout(() => setIsLeaving(true), Math.max(0, duration - 300))
    const dismissTimer = window.setTimeout(() => dismissRef.current(), duration)

    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(dismissTimer)
      window.clearTimeout(manualDismissTimer.current)
    }
  }, [duration, message])

  if (!message) return null

  const isSuccess = /successful|approved|confirmed|has been sent|has been requested|password updated/i.test(message)

  function handleDismiss() {
    setIsLeaving(true)
    window.clearTimeout(manualDismissTimer.current)
    manualDismissTimer.current = window.setTimeout(() => dismissRef.current(), 300)
  }

  return (
    <div className={`auth-toast ${isSuccess ? 'auth-toast-success' : 'auth-toast-error'} ${isLeaving ? 'auth-toast-leaving' : ''}`} role="alert">
      <span>{message}</span>
      <button type="button" onClick={handleDismiss} aria-label="Dismiss message">
        <i className="app-icon app-icon-close" aria-hidden="true" />
      </button>
    </div>
  )
}

export default AuthToast
