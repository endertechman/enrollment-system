import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

const toastEntries = []
const toastListeners = new Set()

function emitToastChange() {
  for (const listener of toastListeners) listener()
}

function subscribeToToasts(listener) {
  toastListeners.add(listener)
  return () => toastListeners.delete(listener)
}

function registerToast(id, dismiss) {
  const previous = toastEntries[0]
  toastEntries.splice(0, toastEntries.length, { id, dismiss })
  emitToastChange()
  if (previous && previous.id !== id) {
    window.setTimeout(() => previous.dismiss(), 0)
  }
}

function unregisterToast(id) {
  const index = toastEntries.findIndex((entry) => entry.id === id)
  if (index < 0) return
  toastEntries.splice(index, 1)
  emitToastChange()
}

function getToastHost() {
  let host = document.getElementById('auth-toast-stack')
  if (!host) {
    host = document.createElement('div')
    host.id = 'auth-toast-stack'
    host.className = 'auth-toast-stack'
    document.body.appendChild(host)
  }
  return host
}

function AuthToast({ message, onDismiss, duration = 8000, variant = 'auto' }) {
  const dismissRef = useRef(onDismiss)
  const toastId = useRef(Symbol('auth-toast'))
  const manualDismissTimer = useRef(null)
  const [isLeaving, setIsLeaving] = useState(false)
  const isActive = useSyncExternalStore(
    subscribeToToasts,
    () => toastEntries.some((entry) => entry.id === toastId.current),
    () => false,
  )

  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    const currentToastId = toastId.current

    if (!message) {
      unregisterToast(currentToastId)
      const resetTimer = window.setTimeout(() => setIsLeaving(false), 0)
      return () => window.clearTimeout(resetTimer)
    }

    const enterTimer = window.setTimeout(() => setIsLeaving(false), 0)
    registerToast(currentToastId, () => dismissRef.current())

    const fadeTimer = window.setTimeout(() => setIsLeaving(true), Math.max(0, duration - 180))
    const dismissTimer = window.setTimeout(() => dismissRef.current(), duration)

    return () => {
      window.clearTimeout(enterTimer)
      window.clearTimeout(fadeTimer)
      window.clearTimeout(dismissTimer)
      window.clearTimeout(manualDismissTimer.current)
      unregisterToast(currentToastId)
    }
  }, [duration, message])

  if (!message || !isActive) return null

  const isSuccess = variant === 'success' || (variant === 'auto' && /successful|approved|confirmed|has been sent|has been requested|password updated/i.test(message))

  function handleDismiss() {
    setIsLeaving(true)
    window.clearTimeout(manualDismissTimer.current)
    manualDismissTimer.current = window.setTimeout(() => dismissRef.current(), 180)
  }

  return createPortal(
    <div key={message} className={`auth-toast ${isSuccess ? 'auth-toast-success' : 'auth-toast-error'} ${isLeaving ? 'auth-toast-leaving' : ''}`} role="alert">
      <span>{message}</span>
      <button type="button" className="popup-close-button" onClick={handleDismiss} aria-label="Dismiss message">
        <i className="app-icon app-icon-close" aria-hidden="true" />
      </button>
    </div>,
    getToastHost(),
  )
}

export default AuthToast
