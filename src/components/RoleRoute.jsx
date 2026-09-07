import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LoadingSpinner from './LoadingSpinner'

function RoleRoute({ allowedRole, children }) {
  const [loading, setLoading] = useState(true)
  const [userExists, setUserExists] = useState(false)
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    checkRole()
  }, [allowedRole])

  async function checkRole() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    // No logged-in user
    if (!user) {
      setUserExists(false)
      setAllowed(false)
      setLoading(false)
      return
    }

    setUserExists(true)

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (error) {
      console.error(error)
      setAllowed(false)
      setLoading(false)
      return
    }

    setAllowed(profile.role === allowedRole)
    setLoading(false)
  }

  if (loading) {
    return <LoadingSpinner label="Checking account access..." fullPage />
  }

  // User isn't logged in
  if (!userExists) {
    return <Navigate to="/login" replace />
  }

  // User is logged in, but has the wrong role
  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return children
}

export default RoleRoute
