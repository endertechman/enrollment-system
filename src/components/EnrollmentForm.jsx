import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from './AppHeader'
import LoadingSpinner from './LoadingSpinner'
import { getEnrollmentWindow, isEnrollmentOpen } from '../lib/enrollmentWindow'

function EnrollmentForm() {
  const navigate = useNavigate()
  const formRef = useRef(null)

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
  const [enrollmentOpen, setEnrollmentOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)

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

    const [windowResult, enrollmentResult] = await Promise.all([
      getEnrollmentWindow(),
      getEnrollmentCount(user.id),
    ])

    if (windowResult.error) {
      setMessage('Unable to verify the enrollment schedule right now.')
      setLoading(false)
      return
    }

    if (!isEnrollmentOpen(windowResult.data)) {
      setEnrollmentOpen(false)
      setLoading(false)
      return
    }

    setEnrollmentOpen(true)
    const { count, error } = enrollmentResult

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

  function goToNextStep() {
    const currentSection = formRef.current?.querySelector(
      `[data-step="${currentStep}"]`,
    )
    const fields = currentSection?.querySelectorAll('input, select') || []

    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity()
        return
      }
    }

    setMessage('')
    setCurrentStep((step) => Math.min(step + 1, 3))
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

    const windowResult = await getEnrollmentWindow()
    if (windowResult.error || !isEnrollmentOpen(windowResult.data)) {
      setEnrollmentOpen(false)
      setMessage('Enrollment is currently closed. Your form was not submitted.')
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
        error.message?.includes('not currently open')
          ? 'Enrollment is currently closed. Your form was not submitted.'
          : error.message?.includes('at most three')
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
        <LoadingSpinner label="Loading enrollment form..." />
      </div>
    )
  }

  if (!enrollmentOpen) {
    return (
      <div className="landing-page">
        <AppHeader />
        <div className="landing-scroll">
          <main className="enrollment-page">
            <section className="enrollment-closed-card">
              <span className="enrollment-window-badge closed">Enrollment Closed</span>
              <h1>Enrollment is not accepting applications right now.</h1>
              <p>Please return to the Home page for the next enrollment schedule.</p>
              {message && <p className="enrollment-message">{message}</p>}
              <button type="button" className="button-secondary" onClick={() => navigate('/')}>Return Home</button>
            </section>
          </main>
        </div>
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
            ref={formRef}
            className="enrollment-form"
            onSubmit={handleSubmit}
          >
            <div className="enrollment-progress" role="list" aria-label={`Form section ${currentStep} of 3`}>
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  role="listitem"
                  aria-label={`${['Child Details', 'Registration and Language', 'Health and Growth'][step - 1]}${step === currentStep ? ', current section' : step < currentStep ? ', completed' : ''}`}
                  aria-current={step === currentStep ? 'step' : undefined}
                  className={`enrollment-progress-step${step === currentStep ? ' active' : ''}${step < currentStep ? ' complete' : ''}`}
                >
                  <span>{step < currentStep ? '✓' : step}</span>
                </div>
              ))}
            </div>

            {currentStep === 1 && <section className="enrollment-section" data-step="1">
              <div className="enrollment-section-heading"><h2>Child Details</h2><p>Enter the child&apos;s identity and basic information.</p></div>

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
              </div>
            </section>}

            {currentStep === 2 && <section className="enrollment-section" data-step="2">
              <div className="enrollment-section-heading"><h2>Registration & Language</h2><p>Add birth, registration, and language details.</p></div>

              <div className="enrollment-grid">

                <div>
                  <label>Place of Birth *</label>
                  <input
                    type="text"
                    value={placeOfBirth}
                    onChange={(e) => setPlaceOfBirth(e.target.value)}
                    maxLength={100}
                    placeholder="City/Municipality, Province, Philippines"
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
                  <label>Registered (PSA) *</label>
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
            </section>}

            {currentStep === 3 && <section className="enrollment-section" data-step="3">
              <div className="enrollment-section-heading"><h2>Health & Growth</h2><p>Provide current measurements and review the calculated BMI.</p></div>

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
                  <label>Weight *</label>
                  <div className="measurement-input measurement-input-static">
                    <input
                      type="number"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      min="1"
                      max="150"
                      step="0.1"
                      required
                    />
                    <span className="measurement-unit">kg</span>
                  </div>
                </div>

                <div>
                  <label>Calculated BMI</label>
                  <div className="bmi-preview" aria-live="polite">{calculateBmi()}</div>
                </div>
              </div>
            </section>}

            {message && (
              <p className="form-message">
                {message}
              </p>
            )}

            <div className="enrollment-step-actions">
              {currentStep > 1 && <button type="button" className="enrollment-previous" onClick={() => setCurrentStep((step) => step - 1)}>Previous</button>}
              {currentStep < 3 ? <button type="button" className="enrollment-next" onClick={goToNextStep}>Next</button> : <button type="submit" className="enrollment-submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Enrollment'}</button>}
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}

export default EnrollmentForm
