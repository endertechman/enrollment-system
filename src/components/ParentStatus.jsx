import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function ParentStatus() {
  const [enrollments, setEnrollments] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadEnrollments()
  }, [])

  async function loadEnrollments() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('You must be logged in.')
      return
    }

    const { data, error } = await supabase
      .from('enrollments')
      .select('*')
      .eq('parent_id', user.id)
      .order('submitted_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    setEnrollments(data)
  }

  return (
    <div className="auth-container">
      <h1>Enrollment Status</h1>

      {message && <p>{message}</p>}

      {enrollments.length === 0 ? (
        <p>No enrollment applications found.</p>
      ) : (
        enrollments.map((enrollment) => (
          <div key={enrollment.id}>
            <p>
              <strong>
                {enrollment.child_first_name}{' '}
                {enrollment.child_last_name}
              </strong>
            </p>

            <p>Birth Date: {enrollment.birth_date}</p>
            <p>Status: {enrollment.status}</p>

            <hr />
          </div>
        ))
      )}
    </div>
  )
}

export default ParentStatus