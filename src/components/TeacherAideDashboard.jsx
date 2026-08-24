import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function TeacherAideDashboard() {
  const [enrollments, setEnrollments] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadEnrollments()
  }, [])

  async function loadEnrollments() {
    const { data, error } = await supabase
      .from('enrollments')
      .select('*')
      .order('submitted_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    setEnrollments(data)
  }

  return (
    <div className="auth-container">
      <h1>Teacher Aide Dashboard</h1>
      <h2>Enrollment Records</h2>

      {message && <p>{message}</p>}

      {enrollments.length === 0 ? (
        <p>No enrollments found.</p>
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

export default TeacherAideDashboard