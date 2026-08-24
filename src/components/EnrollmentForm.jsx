import { useState } from 'react'
import { supabase } from '../lib/supabase'

function EnrollmentForm() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [message, setMessage] = useState('')

  function generateReferenceCode() {
    const randomPart = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()

    return `ENR-${new Date().getFullYear()}-${randomPart}`
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setMessage('You must be logged in first.')
      return
    }

    const referenceCode = generateReferenceCode()

    const { error } = await supabase
      .from('enrollments')
      .insert({
        parent_id: user.id,
        child_first_name: firstName,
        child_last_name: lastName,
        birth_date: birthDate,
        status: 'pending',
        reference_code: referenceCode,
      })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(
      `Enrollment submitted successfully! Reference Code: ${referenceCode}`
    )

    setFirstName('')
    setLastName('')
    setBirthDate('')
  }

  return (
    <div className="auth-container">
      <h1>Enrollment Form</h1>
      <h2>Child Information</h2>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div>
          <label>Child First Name</label>

          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Enter first name"
            required
          />
        </div>

        <div>
          <label>Child Last Name</label>

          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Enter last name"
            required
          />
        </div>

        <div>
          <label>Birth Date</label>

          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
          />
        </div>

        <button type="submit">
          Submit Enrollment
        </button>
      </form>

      {message && <p>{message}</p>}
    </div>
  )
}

export default EnrollmentForm