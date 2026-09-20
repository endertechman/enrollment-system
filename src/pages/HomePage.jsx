import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getEnrollmentWindow } from '../lib/enrollmentWindow'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import GuestHomeView from '../components/home/GuestHomeView'
import SignedInHomeView from '../components/home/SignedInHomeView'

function HomePage() {
  const [homeState, setHomeState] = useState({
    status: 'loading',
    user: null,
    role: null,
    enrollments: [],
    enrollmentWindow: undefined,
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
      setHomeState({ status: 'guest', user: null, role: null, enrollments: [], enrollmentWindow })
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUser.id)
      .single()

    if (profileError || !profile?.role) {
      setHomeState({ status: 'guest', user: null, role: null, enrollments: [], enrollmentWindow })
      return
    }

    let enrollments = []
    if (profile.role === 'parent') {
      const { data } = await supabase
        .from('enrollments')
        .select('id, child_first_name, child_last_name, status, reference_code, submitted_at')
        .eq('parent_id', currentUser.id)
        .eq('batch_id', enrollmentWindow?.current_batch_id)
        .order('submitted_at', { ascending: false })
      enrollments = data || []
    }

    setHomeState({
      status: 'signed-in',
      user: currentUser,
      role: profile.role,
      enrollments,
      enrollmentWindow,
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

  if (homeState.status === 'loading') {
    return <div className="app-loading app-loading-full-page" role="status">Loading your BCDC account...</div>
  }

  if (homeState.status === 'guest') {
    return <GuestHomeView enrollmentWindow={homeState.enrollmentWindow} />
  }

  return (
    <SignedInHomeView
      role={homeState.role}
      enrollments={homeState.enrollments}
      enrollmentWindow={homeState.enrollmentWindow}
    />
  )
}

export default HomePage
