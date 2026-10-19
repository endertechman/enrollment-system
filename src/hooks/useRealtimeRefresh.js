import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const resumeSubscribers = new Set()
const queuedRefreshes = new Set()

let resumeListenersActive = false
let refreshQueueTimer = null
let refreshQueueRunning = false
let lastResumeRefreshAt = Date.now()

async function flushRefreshQueue() {
  if (refreshQueueRunning) return
  refreshQueueRunning = true

  while (queuedRefreshes.size > 0) {
    const refreshBatch = [...queuedRefreshes]
    queuedRefreshes.clear()

    for (const refresh of refreshBatch) {
      try {
        await refresh()
      } catch (error) {
        console.error('Realtime refresh failed:', error)
      }
    }
  }

  refreshQueueRunning = false
}

function queueRefresh(refresh) {
  queuedRefreshes.add(refresh)
  if (refreshQueueTimer !== null) return

  refreshQueueTimer = window.setTimeout(() => {
    refreshQueueTimer = null
    flushRefreshQueue()
  }, 100)
}

function refreshAfterResume() {
  if (document.visibilityState !== 'visible' || Date.now() - lastResumeRefreshAt < 5000) return
  lastResumeRefreshAt = Date.now()
  for (const refresh of resumeSubscribers) queueRefresh(refresh)
}

function startResumeListeners() {
  if (resumeListenersActive) return
  resumeListenersActive = true
  lastResumeRefreshAt = Date.now()
  document.addEventListener('visibilitychange', refreshAfterResume)
  window.addEventListener('focus', refreshAfterResume)
}

function stopResumeListeners() {
  if (!resumeListenersActive || resumeSubscribers.size > 0) return
  resumeListenersActive = false
  document.removeEventListener('visibilitychange', refreshAfterResume)
  window.removeEventListener('focus', refreshAfterResume)
}

// pollMs is an optional safety net: realtime can silently stop delivering (a phone that slept, a
// dropped websocket, a table missing from the realtime publication), so screens that must stay
// current can also re-fetch on a timer while the tab is visible. 0 = off.
function useRealtimeRefresh(refresh, { channelName, tables, enabled = true, pollMs = 0 } = {}) {
  const refreshRef = useRef(refresh)
  const tableKey = (tables || []).join('|')

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!enabled || !channelName || !tableKey) return undefined

    const runRefresh = () => refreshRef.current()
    const requestRefresh = () => queueRefresh(runRefresh)
    const channel = supabase.channel(`bcdc:${channelName}`)
    let subscribedOnce = false

    for (const table of tableKey.split('|')) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        requestRefresh,
      )
    }

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      if (subscribedOnce) requestRefresh()
      subscribedOnce = true
    })

    resumeSubscribers.add(runRefresh)
    startResumeListeners()

    const pollTimer = pollMs > 0
      ? window.setInterval(() => { if (document.visibilityState === 'visible') requestRefresh() }, pollMs)
      : null

    return () => {
      if (pollTimer !== null) window.clearInterval(pollTimer)
      resumeSubscribers.delete(runRefresh)
      queuedRefreshes.delete(runRefresh)
      stopResumeListeners()
      supabase.removeChannel(channel)
    }
  }, [channelName, enabled, tableKey, pollMs])
}

export default useRealtimeRefresh
