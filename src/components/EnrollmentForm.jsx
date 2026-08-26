import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from './AppHeader'

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

  const [heightValue, setHeightValue] = useState('')
  const [heightUnit, setHeightUnit] = useState('cm')
  const [weightKg, setWeightKg] = useState('')

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    initializeForm()
  }, [])

  async function getEnrollmentCount(parentId) {
    return supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', parentId)
  }

  async function initializeForm() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      navigate('/login', { replace: true })
      return
    }

    const { count, error } = await getEnrollmentCount(user.id)

    if (error) {
      setMessage('Unable to verify your enrollments right now.')
      setLoading(false)
      return
    }

    if ((count || 0) >= 3) {
      navigate('/parent?notice=max-children', { replace: true })
      return
    }

    setParentEmail(user.email || '')

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

  function getHeightCm() {
    const value = Number(heightValue)
    if (!Number.isFinite(value) || value <= 0) return null
    return heightUnit === 'in' ? value * 2.54 : value
  }

  function calculateBmi() {
    const heightCm = getHeightCm()
    const weight = Number(weightKg)
    if (!heightCm || !Number.isFinite(weight) || weight <= 0) return '—'
    const heightMeters = heightCm / 100
    return (weight / (heightMeters * heightMeters)).toFixed(1)
  }

  function formatPhilippinePlace(place) {
    const cleanedPlace = place.trim()
    return /philippines$/i.test(cleanedPlace)
      ? cleanedPlace
      : `${cleanedPlace}, Philippines`
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

    if (!getHeightCm()) {
      setMessage('Enter a valid height.')
      setSubmitting(false)
      return
    }

    const { count, error: countError } = await getEnrollmentCount(user.id)

    if (countError) {
      setMessage('Unable to verify your enrollments right now.')
      setSubmitting(false)
      return
    }

    if ((count || 0) >= 3) {
      navigate('/parent?notice=max-children', { replace: true })
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
        place_of_birth: formatPhilippinePlace(placeOfBirth),
        birth_order: Number(birthOrder),
        is_registered: isRegistered === 'yes',
        mother_tongue: motherTongue.trim(),
        other_dialect: otherDialect.trim() || null,

        height_cm: Number(getHeightCm().toFixed(2)),
        weight_kg: Number(weightKg),

        status: 'pending',
        reference_code: referenceCode,
      })

    if (error) {
      console.error(error)
      setMessage(
        error.code === '23514' || error.message?.includes('at most three')
          ? 'All child enrollment slots for this account are already filled.'
          : error.message,
      )
      setSubmitting(false)
      return
    }

    navigate('/parent', { replace: true })
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
      <AppHeader />

      <div className="landing-scroll">
        <main className="enrollment-page">
          <div className="enrollment-heading">
            <h1>Child Information</h1>

            <p>
              Please enter complete and accurate learner information. These
              details will become part of your child&apos;s official information
              record at BCDC.
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
                  <label>Place of Birth (Philippines) *</label>
                  <input
                    type="text"
                    value={placeOfBirth}
                    onChange={(e) => setPlaceOfBirth(e.target.value)}
                    maxLength={100}
                    placeholder="City/Municipality, Province"
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
                  <label>Height *</label>
                  <div className="measurement-input">
                    <input
                      type="number"
                      value={heightValue}
                      onChange={(e) => setHeightValue(e.target.value)}
                      min={heightUnit === 'cm' ? '30' : '11.8'}
                      max={heightUnit === 'cm' ? '200' : '78.7'}
                      step="0.1"
                      required
                    />
                    <select
                      value={heightUnit}
                      onChange={(e) => setHeightUnit(e.target.value)}
                      aria-label="Height unit"
                    >
                      <option value="cm">cm</option>
                      <option value="in">in</option>
                    </select>
                  </div>
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

                <div className="bmi-preview" aria-live="polite">
                  <span>Calculated BMI</span>
                  <strong>{calculateBmi()}</strong>
                  <small>Calculated from height and weight; not stored separately.</small>
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
