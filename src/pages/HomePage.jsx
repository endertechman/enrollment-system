import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getEnrollmentWindow } from '../lib/enrollmentWindow'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import GuestHomeView from '../components/home/GuestHomeView'
import SignedInHomeView from '../components/home/SignedInHomeView'
import AuthToast from '../components/AuthToast'

const ENROLLMENT_NOTICE_KEY = 'bcdc:enrollment-success'

function HomePage() {
  // The enrollment form sends parents here after submitting, so the confirmation popup has to show here too.
  const [notice, setNotice] = useState(() => window.sessionStorage.getItem(ENROLLMENT_NOTICE_KEY) || '')
  useEffect(() => { window.sessionStorage.removeItem(ENROLLMENT_NOTICE_KEY) }, [])

  const [homeState, setHomeState] = useState({
    status: 'loading',
    user: null,
    role: null,
    enrollments: [],
    enrollmentWindow: undefined,
    enrollmentBatch: null,
  })

  const loadHome = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setHomeState((current) => ({ ...current, status: 'loading' }))

    const [windowResult, userResult] = await Promise.all([
      getEnrollmentWindow(),
      supabase.auth.getUser(),
    ])
    const enrollmentWindow = windowResult.error ? undefined : windowResult.data
    const currentUser = userResult.data.user

    if (!currentUser) {
      setHomeState({ status: 'guest', user: null, role: null, enrollments: [], enrollmentWindow, enrollmentBatch: null })
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUser.id)
      .single()

    if (profileError || !profile?.role) {
      setHomeState({ status: 'guest', user: null, role: null, enrollments: [], enrollmentWindow, enrollmentBatch: null })
      return
    }

    let enrollments = []
    let enrollmentBatch = null
    if (profile.role === 'parent') {
      if (enrollmentWindow?.current_batch_id) {
        const [enrollmentResult, batchResult] = await Promise.all([
          supabase
            .from('enrollments')
            .select('id')
            .eq('parent_id', currentUser.id)
            .eq('batch_id', enrollmentWindow.current_batch_id),
          supabase
            .from('enrollment_batches')
            .select('name, starts_on, ends_on')
            .eq('id', enrollmentWindow.current_batch_id)
            .maybeSingle(),
        ])
        enrollments = enrollmentResult.data || []
        enrollmentBatch = batchResult.data || null
      }
    }

    setHomeState({
      status: 'signed-in',
      user: currentUser,
      role: profile.role,
      enrollments,
      enrollmentWindow,
      enrollmentBatch,
    })
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(loadHome, 0)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => loadHome())

    return () => {
      window.clearTimeout(initialLoad)
      subscription.unsubscribe()
    }
  }, [loadHome])

  useRealtimeRefresh(() => loadHome({ silent: true }), {
    channelName: 'home',
    tables: ['profiles', 'enrollments', 'enrollment_settings', 'enrollment_batches'],
  })

  let content
  if (homeState.status === 'loading') {
    content = <div className="app-loading app-loading-full-page" role="status">Loading your BCDC account...</div>
  } else if (homeState.status === 'guest') {
    content = <GuestHomeView enrollmentWindow={homeState.enrollmentWindow} />
  } else {
    content = (
      <SignedInHomeView
        role={homeState.role}
        enrollments={homeState.enrollments}
        enrollmentWindow={homeState.enrollmentWindow}
        enrollmentBatch={homeState.enrollmentBatch}
      />
    )
  }

  return (
    <>
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      {content}
    </>
  )
}

export default HomePage
