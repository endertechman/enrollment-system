import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function EnrollmentForm() {
  const navigate = useNavigate()

  const [parentEmail, setParentEmail] = useState('')

  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [suffix, setSuffix] = useState('')

  const [birthDate, setBirthDate] = useState('')
  const [sex, setSex] = useState('')
  const [placeOfBirth, setPlaceOfBirth] = useState('')
  const [birthOrder, setBirthOrder] = useState('')
  const [isRegistered, setIsRegistered] = useState('')
  const [motherTongue, setMotherTongue] = useState('')
  const [otherDialect, setOtherDialect] = useState('')

  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    initializeForm()
  }, [])

  async function initializeForm() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      navigate('/login', { replace: true })
      return
    }

    setParentEmail(user.email || '')

    const { data, error } = await supabase
      .from('enrollments')
      .select('id')
      .eq('parent_id', user.id)
      .limit(1)

    if (error) {
      console.error(error)
      setMessage('Unable to check enrollment status.')
      setLoading(false)
      return
    }

    if (data && data.length > 0) {
      navigate('/', { replace: true })
      return
    }

    setLoading(false)
  }

  function calculateAge() {
    if (!birthDate) return ''

    const today = new Date()
    const birth = new Date(`${birthDate}T00:00:00`)

    let age = today.getFullYear() - birth.getFullYear()

    const monthDifference =
      today.getMonth() - birth.getMonth()

    if (
      monthDifference < 0 ||
      (monthDifference === 0 &&
        today.getDate() < birth.getDate())
    ) {
      age--
    }

    return age >= 0 ? age : ''
  }

  function generateReferenceCode() {
    const randomPart = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()

    return `ENR-${new Date().getFullYear()}-${randomPart}`
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (submitting) return

    setMessage('')
    setSubmitting(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setSubmitting(false)
      navigate('/login', { replace: true })
      return
    }

    const { data: existing, error: checkError } = await supabase
      .from('enrollments')
      .select('id')
      .eq('parent_id', user.id)
      .limit(1)

    if (checkError) {
      console.error(checkError)
      setMessage('Unable to submit enrollment.')
      setSubmitting(false)
      return
    }

    if (existing && existing.length > 0) {
      navigate('/', { replace: true })
      return
    }

    const referenceCode = generateReferenceCode()

    const { error } = await supabase
      .from('enrollments')
      .insert({
        parent_id: user.id,

        child_first_name: firstName.trim(),
        child_middle_name: middleName.trim(),
        child_last_name: lastName.trim(),
        child_suffix: suffix.trim() || null,

        birth_date: birthDate,
        sex,
        place_of_birth: placeOfBirth.trim(),
        birth_order: Number(birthOrder),
        is_registered: isRegistered === 'yes',
        mother_tongue: motherTongue.trim(),
        other_dialect: otherDialect.trim() || null,

        height_cm: Number(heightCm),
        weight_kg: Number(weightKg),

        status: 'pending',
        reference_code: referenceCode,
      })

    if (error) {
      console.error(error)
      setMessage(error.message)
      setSubmitting(false)
      return
    }

    navigate('/', { replace: true })
  }

  if (loading) {
    return (
      <div className="auth-container">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div
            className="landing-brand"
            onClick={() => navigate('/')}
            style={{ cursor: 'pointer' }}
          >
            <img
              src="/bcdc-logo.png"
              alt="Binuangan Child Development Center logo"
              className="landing-logo"
            />

            <span>Binuangan Child Development Center</span>
          </div>

          <div className="landing-nav-actions">
            <button
              className="nav-login"
              onClick={() => navigate('/')}
            >
              Home
            </button>
          </div>
        </div>
      </nav>

      <div className="landing-scroll">
        <main className="enrollment-page">
          <div className="enrollment-heading">
            <p className="hero-label">
              Enrollment Form
            </p>

            <h1>Child Information</h1>

            <p>
              Please provide the learner&apos;s information below.
            </p>
          </div>

          <form
            className="enrollment-form"
            onSubmit={handleSubmit}
          >
            <section className="enrollment-section">
              <h2>Personal Information</h2>

              <div className="enrollment-grid">
                <div>
                  <label>Last Name *</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    maxLength={50}
                    required
                  />
                </div>

                <div>
                  <label>First Name *</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={50}
                    required
                  />
                </div>

                <div>
                  <label>Middle Name *</label>
                  <input
                    type="text"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    maxLength={50}
                    required
                  />
                </div>

                <div>
                  <label>Suffix Name</label>
                  <input
                    type="text"
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    maxLength={20}
                    placeholder="If applicable"
                  />
                </div>

                <div>
                  <label>Parent Email Address *</label>
                  <input
                    type="email"
                    value={parentEmail}
                    readOnly
                  />
                </div>

                <div>
                  <label>Date of Birth *</label>
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>

                <div>
                  <label>Age *</label>
                  <input
                    type="number"
                    value={calculateAge()}
                    readOnly
                  />
                </div>

                <div>
                  <label>Sex *</label>
                  <select
                    value={sex}
                    onChange={(e) => setSex(e.target.value)}
                    required
                  >
                    <option value="">Select sex</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div>
                  <label>Place of Birth *</label>
                  <input
                    type="text"
                    value={placeOfBirth}
                    onChange={(e) => setPlaceOfBirth(e.target.value)}
                    maxLength={100}
                    required
                  />
                </div>

                <div>
                  <label>Birth Order *</label>
                  <input
                    type="number"
                    value={birthOrder}
                    onChange={(e) => setBirthOrder(e.target.value)}
                    min="1"
                    max="20"
                    required
                  />
                </div>

                <div>
                  <label>Registered *</label>
                  <select
                    value={isRegistered}
                    onChange={(e) => setIsRegistered(e.target.value)}
                    required
                  >
                    <option value="">Select answer</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div>
                  <label>Mother Tongue *</label>
                  <input
                    type="text"
                    value={motherTongue}
                    onChange={(e) => setMotherTongue(e.target.value)}
                    maxLength={50}
                    required
                  />
                </div>

                <div>
                  <label>Other Dialect</label>
                  <input
                    type="text"
                    value={otherDialect}
                    onChange={(e) => setOtherDialect(e.target.value)}
                    maxLength={50}
                    placeholder="If applicable"
                  />
                </div>
              </div>
            </section>

            <section className="enrollment-section">
              <h2>Health & Growth</h2>

              <div className="enrollment-grid">
                <div>
                  <label>Height (cm) *</label>
                  <input
                    type="number"
                    value={heightCm}
                    onChange={(e) =>
                      setHeightCm(e.target.value)
                    }
                    min="30"
                    max="200"
                    step="0.1"
                    required
                  />
                </div>

                <div>
                  <label>Weight (kg) *</label>
                  <input
                    type="number"
                    value={weightKg}
                    onChange={(e) =>
                      setWeightKg(e.target.value)
                    }
                    min="1"
                    max="150"
                    step="0.1"
                    required
                  />
                </div>
              </div>
            </section>

            {message && (
              <p className="form-message">
                {message}
              </p>
            )}

            <button
              type="submit"
              className="enrollment-submit"
              disabled={submitting}
            >
              {submitting
                ? 'Submitting...'
                : 'Submit Enrollment'}
            </button>
          </form>
        </main>
      </div>
    </div>
  )
}

export default EnrollmentForm