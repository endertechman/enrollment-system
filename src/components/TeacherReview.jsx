import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function TeacherReview() {
  const [enrollments, setEnrollments] = useState([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadEnrollments()
  }, [])

  async function loadEnrollments() {
    const { data, error } = await supabase
      .from('enrollments')
      .select('*')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      return
    }

    setEnrollments(data)
  }

  async function updateStatus(id, status) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('You must be logged in.')
      return
    }

    const { error } = await supabase
      .from('enrollments')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`Enrollment ${status}.`)
    loadEnrollments()
  }

  return (
    <div className="auth-container">
      <h1>Teacher Dashboard</h1>
      <h2>Pending Enrollments</h2>

      {message && <p>{message}</p>}

      {enrollments.length === 0 ? (
        <p>No pending enrollments.</p>
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

            <button
              type="button"
              onClick={() =>
                updateStatus(enrollment.id, 'approved')
              }
            >
              Approve
            </button>

            <button
              type="button"
              onClick={() =>
                updateStatus(enrollment.id, 'rejected')
              }
            >
              Reject
            </button>

            <hr />
          </div>
        ))
      )}
    </div>
  )
}

export default TeacherReview