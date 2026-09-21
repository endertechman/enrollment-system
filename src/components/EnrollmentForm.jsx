import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from './AppHeader'
import { getEnrollmentWindow, isEnrollmentOpen } from '../lib/enrollmentWindow'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

function EnrollmentForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const formRef = useRef(null)
  const requestedResubmissionId = searchParams.get('resubmit')

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

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [enrollmentOpen, setEnrollmentOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [resubmissionId, setResubmissionId] = useState(null)
  const [resubmissionReason, setResubmissionReason] = useState('')

  const getEnrollmentCount = useCallback(async (parentId, batchId) => {
    return supabase
      .from('enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', parentId)
      .eq('batch_id', batchId)
  }, [])

  const initializeForm = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      navigate('/login', { replace: true })
      return
    }

    const windowResult = await getEnrollmentWindow()

    if (windowResult.error) {
      setMessage('Unable to verify the enrollment schedule right now.')
      setLoading(false)
      return
    }

    if (requestedResubmissionId) {
      if (!windowResult.data?.current_batch_id) {
        setMessage('This application is not available for resubmission.')
        setEnrollmentOpen(true)
        setLoading(false)
        return
      }

      setEnrollmentOpen(true)
      const { data: rejectedEnrollment, error: rejectedError } = await supabase
        .from('enrollments')
        .select('id, child_first_name, child_middle_name, child_last_name, child_suffix, birth_date, sex, place_of_birth, birth_order, is_registered, mother_tongue, other_dialect, review_reason')
        .eq('id', requestedResubmissionId)
        .eq('parent_id', user.id)
        .eq('status', 'rejected')
        .eq('batch_id', windowResult.data.current_batch_id)
        .maybeSingle()

      if (rejectedError || !rejectedEnrollment) {
        setMessage('This application is not available for resubmission.')
        setLoading(false)
        return
      }

      setFirstName(rejectedEnrollment.child_first_name || '')
      setMiddleName(rejectedEnrollment.child_middle_name || '')
      setLastName(rejectedEnrollment.child_last_name || '')
      setSuffix(rejectedEnrollment.child_suffix || '')
      setBirthDate(rejectedEnrollment.birth_date || '')
      setSex(rejectedEnrollment.sex || '')
      setPlaceOfBirth(rejectedEnrollment.place_of_birth || '')
      setBirthOrder(rejectedEnrollment.birth_order == null ? '' : String(rejectedEnrollment.birth_order))
      setIsRegistered(rejectedEnrollment.is_registered ? 'yes' : 'no')
      setMotherTongue(rejectedEnrollment.mother_tongue || '')
      setOtherDialect(rejectedEnrollment.other_dialect || '')
      setResubmissionReason(rejectedEnrollment.review_reason || '')
      setResubmissionId(rejectedEnrollment.id)
      setParentEmail(user.email || '')
      setLoading(false)
      return
    }

    if (!isEnrollmentOpen(windowResult.data)) {
      setEnrollmentOpen(false)
      setLoading(false)
      return
    }

    setEnrollmentOpen(true)

    const enrollmentResult = await getEnrollmentCount(user.id, windowResult.data.current_batch_id)
    const { count, error } = enrollmentResult

    if (error) {
      setMessage('Unable to verify your enrollments right now.')
      setLoading(false)
      return
    }

    if ((count || 0) >= 3) {
      navigate('/', { replace: true })
      return
    }

    setParentEmail(user.email || '')

    setLoading(false)
  }, [getEnrollmentCount, navigate, requestedResubmissionId])

  useEffect(() => {
    const initializationTimer = window.setTimeout(() => {
      initializeForm()
    }, 0)

    return () => window.clearTimeout(initializationTimer)
  }, [initializeForm])

  useRealtimeRefresh(initializeForm, {
    channelName: 'enrollment-form',
    tables: ['enrollment_settings', 'enrollment_batches', 'enrollments'],
  })

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
    setCurrentStep((step) => Math.min(step + 1, 2))
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

    const windowResult = await getEnrollmentWindow()
    if (windowResult.error || !windowResult.data?.current_batch_id) {
      setMessage('Unable to verify the enrollment schedule right now. Please try again.')
      setSubmitting(false)
      return
    }

    const enrollmentValues = {
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
      status: 'pending',
    }

    let error
    if (resubmissionId) {
      const result = await supabase
        .from('enrollments')
        .update(enrollmentValues)
        .eq('id', resubmissionId)
        .eq('parent_id', user.id)
        .eq('status', 'rejected')
        .select('id')
        .maybeSingle()
      error = result.error || (!result.data ? new Error('This application is no longer available for resubmission.') : null)
    } else {
      const { count, error: countError } = await getEnrollmentCount(user.id, windowResult.data.current_batch_id)

      if (countError) {
        setMessage('Unable to verify your enrollments right now.')
        setSubmitting(false)
        return
      }

      if ((count || 0) >= 3) {
        navigate('/', { replace: true })
        return
      }

      const result = await supabase
        .from('enrollments')
        .insert({
          ...enrollmentValues,
          parent_id: user.id,
          reference_code: generateReferenceCode(),
        })
      error = result.error
    }

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

    window.sessionStorage.setItem('bcdc:enrollment-success', resubmissionId ? 'Enrollment application resubmitted successfully.' : 'Enrollment application submitted successfully.')
    navigate('/', { replace: true })
  }

  if (loading) {
    return (
      <div className="auth-container">
        <p className="app-loading" role="status">Loading enrollment form...</p>
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

  if (requestedResubmissionId && !resubmissionId) {
    return (
      <div className="landing-page">
        <AppHeader />
        <div className="landing-scroll">
          <main className="enrollment-page">
            <section className="enrollment-closed-card">
              <h1>Application unavailable</h1>
              <p>{message || 'This application cannot be resubmitted.'}</p>
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
            <h1>{resubmissionId ? 'Update Child Information' : 'Child Information'}</h1>

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
            {resubmissionId && <div className="enrollment-resubmission-note"><span>Teacher&apos;s reason for resubmission</span><p>{resubmissionReason || 'Please review and correct the application information.'}</p></div>}
            <div className="enrollment-progress" role="list" aria-label={`Form section ${currentStep} of 2`}>
              {[1, 2].map((step) => (
                <div
                  key={step}
                  role="listitem"
                  aria-label={`${['Child Details', 'Registration and Language'][step - 1]}${step === currentStep ? ', current section' : step < currentStep ? ', completed' : ''}`}
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
                  <label>Gender *</label>
                  <select
                    value={sex}
                    onChange={(e) => setSex(e.target.value)}
                    required
                  >
                    <option value="">Select gender</option>
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
                    onChange={(e) => setPlaceOfBirth(e.target.value.replace(/,\s*Philippines\s*$/i, ''))}
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

            {message && (
              <p className="form-message">
                {message}
              </p>
            )}

            <div className="enrollment-step-actions">
              {currentStep > 1 && <button type="button" className="enrollment-previous" onClick={() => setCurrentStep((step) => step - 1)}>Previous</button>}
              {currentStep < 2 ? <button type="button" className="enrollment-next" onClick={goToNextStep}>Next</button> : <button type="submit" className="enrollment-submit" disabled={submitting}>{resubmissionId ? 'Resubmit Application' : 'Submit Enrollment'}</button>}
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}

export default EnrollmentForm
