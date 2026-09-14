import { useEffect, useRef } from 'react'

export const DATABASE_REFRESH_INTERVAL = 120000

function useAutoRefresh(refresh, { enabled = true, intervalMs = DATABASE_REFRESH_INTERVAL } = {}) {
  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled) return undefined

    let refreshRunning = false

    async function runRefresh() {
      if (document.visibilityState !== 'visible' || refreshRunning) return
      refreshRunning = true
      try {
        await refreshRef.current()
      } finally {
        refreshRunning = false
      }
    }

    const refreshTimer = window.setInterval(runRefresh, intervalMs)
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') runRefresh()
    }

    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)

    return () => {
      window.clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [enabled, intervalMs])
}

export default useAutoRefresh
