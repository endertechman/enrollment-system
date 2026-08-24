import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function RoleRoute({ allowedRole, children }) {
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    checkRole()
  }, [])

  async function checkRole() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setAllowed(false)
      setLoading(false)
      return
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (error) {
      setAllowed(false)
      setLoading(false)
      return
    }

    setAllowed(profile.role === allowedRole)
    setLoading(false)
  }

  if (loading) {
    return <p>Loading...</p>
  }

  if (!allowed) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default RoleRoute