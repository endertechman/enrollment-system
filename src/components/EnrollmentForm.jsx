import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from './AppHeader'
import ConfirmDialog from './ConfirmDialog'
import { getEnrollmentWindow, isEnrollmentOpen } from '../lib/enrollmentWindow'
import { getAgeInYears, getPhilippineDateValue } from '../lib/philippineDate'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import PaginatedDropdown from './PaginatedDropdown'
import { sanitizeName, sanitizeMiddleName, sanitizePlace, sanitizeSuffix, sanitizeDigits, validateNameField, validateBirthOrder } from '../lib/formValidation'

function normalizeNamePart(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-PH')
}

function childIdentityMatches(enrollment, child) {
  return enrollment.birth_date === child.birthDate
    && normalizeNamePart(enrollment.child_first_name) === normalizeNamePart(child.firstName)
    && normalizeNamePart(enrollment.child_middle_name) === normalizeNamePart(child.middleName)
    && normalizeNamePart(enrollment.child_last_name) === normalizeNamePart(child.lastName)
    && normalizeNamePart(enrollment.child_suffix) === normalizeNamePart(child.suffix)
}

const GENDER_OPTIONS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]
const PSA_OPTIONS = [{ value: '', label: 'Not specified' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]

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
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [duplicateMatch, setDuplicateMatch] = useState(null)
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)

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
        .select('id, child_first_name, child_middle_name, child_last_name, child_suffix, birth_date, sex, place_of_birth, birth_order, is_registered, mother_tongue, other_dialect')
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
      setIsRegistered(typeof rejectedEnrollment.is_registered === 'boolean' ? (rejectedEnrollment.is_registered ? 'yes' : 'no') : '')
      setMotherTongue(rejectedEnrollment.mother_tongue || '')
      setOtherDialect(rejectedEnrollment.other_dialect || '')
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
    return getAgeInYears(birthDate) ?? ''
  }

  function generateReferenceCode() {
    const randomPart = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()

    return `ENR-${getPhilippineDateValue().slice(0, 4)}-${randomPart}`
  }

  function validateStep(step) {
    if (step === 1) {
      return validateNameField('Last name', lastName)
        || validateNameField('First name', firstName)
        || validateNameField('Middle name', middleName)
        || validateNameField('Suffix', suffix, { required: false })
        || (!birthDate ? 'Date of birth is required.' : '')
        || (!sex ? 'Please select a gender.' : '')
    }
    return (!placeOfBirth.trim() || !/\p{L}/u.test(placeOfBirth) ? 'Place of birth is required.' : '')
      || validateBirthOrder(birthOrder)
      || validateNameField('Mother tongue', motherTongue)
      || validateNameField('Other dialect', otherDialect, { required: false })
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

    const stepError = validateStep(currentStep)
    if (stepError) {
      setMessage(stepError)
      return
    }

    setMessage('')
    setCurrentStep((step) => Math.min(step + 1, 2))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (checkingDuplicate || submitting) return
    if (currentStep < 2) {
      goToNextStep()
      return
    }
    if (!formRef.current?.reportValidity()) return
    const submitError = validateStep(1) || validateStep(2)
    if (submitError) {
      setMessage(submitError)
      return
    }

    if (resubmissionId) {
      setConfirmSubmit(true)
      return
    }

    setMessage('')
    setCheckingDuplicate(true)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      setCheckingDuplicate(false)
      navigate('/login', { replace: true })
      return
    }

    const windowResult = await getEnrollmentWindow()
    if (windowResult.error || !windowResult.data?.current_batch_id) {
      setMessage('Unable to verify the enrollment schedule right now. Please try again.')
      setCheckingDuplicate(false)
      return
    }

    const { data: existingEnrollments, error: duplicateCheckError } = await supabase
      .from('enrollments')
      .select('id, child_first_name, child_middle_name, child_last_name, child_suffix, birth_date, status')
      .eq('parent_id', user.id)
      .eq('batch_id', windowResult.data.current_batch_id)

    setCheckingDuplicate(false)

    if (duplicateCheckError) {
      setMessage('Unable to check for an existing application right now. Please try again.')
      return
    }

    const match = (existingEnrollments || []).find((enrollment) => childIdentityMatches(enrollment, {
      firstName,
      middleName,
      lastName,
      suffix,
      birthDate,
    }))

    if (match) {
      setDuplicateMatch(match)
      return
    }

    setConfirmSubmit(true)
  }

  async function submitEnrollment() {
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
      setConfirmSubmit(false)
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
      is_registered: isRegistered === '' ? null : isRegistered === 'yes',
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
        setConfirmSubmit(false)
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
      setConfirmSubmit(false)
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
      {confirmSubmit && <ConfirmDialog
        title={resubmissionId ? 'Resubmit this application?' : 'Submit this enrollment?'}
        message={resubmissionId ? 'Your updated child information will be sent to BCDC for another review.' : 'Please confirm that the child information is accurate before sending it to BCDC.'}
        confirmLabel={resubmissionId ? 'Resubmit Application' : 'Submit Enrollment'}
        tone="primary"
        iconClass="app-icon-clipboard"
        busy={submitting}
        onConfirm={submitEnrollment}
        onCancel={() => setConfirmSubmit(false)}
      />}
      {duplicateMatch && <ConfirmDialog
        title="Possible duplicate application"
        message="An application with the same child name and birth date already exists in this semester. Continue only if this is intentionally a separate application. BCDC staff will still review it before enrollment."
        confirmLabel="Continue Anyway"
        cancelLabel="Review Information"
        iconClass="app-icon-profile"
        busy={false}
        onConfirm={() => {
          setDuplicateMatch(null)
          setConfirmSubmit(true)
        }}
        onCancel={() => setDuplicateMatch(null)}
      />}

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
            {currentStep === 1 && <section className="enrollment-section" data-step="1">
              <div className="enrollment-section-heading"><h2>Child Details</h2><p>Enter the child&apos;s identity and basic information.</p></div>

              <div className="enrollment-grid">
                <div>
                  <label>Last Name *</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(sanitizeName(e.target.value))}
                    maxLength={50}
                    required
                  />
                </div>

                <div>
                  <label>First Name *</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(sanitizeName(e.target.value))}
                    maxLength={50}
                    required
                  />
                </div>

                <div>
                  <label>Middle Name *</label>
                  <input
                    type="text"
                    value={middleName}
                    onChange={(e) => setMiddleName(sanitizeMiddleName(e.target.value))}
                    maxLength={50}
                    required
                  />
                </div>

                <div>
                  <label>Suffix Name</label>
                  <input
                    type="text"
                    value={suffix}
                    onChange={(e) => setSuffix(sanitizeSuffix(e.target.value))}
                    maxLength={10}
                    placeholder="e.g. Jr., III"
                    autoComplete="off"
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
                    max={getPhilippineDateValue()}
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
                  <PaginatedDropdown
                    options={GENDER_OPTIONS}
                    value={sex}
                    onChange={setSex}
                    ariaLabel="Gender"
                    placeholder="Select gender"
                  />
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
                    onChange={(e) => setPlaceOfBirth(sanitizePlace(e.target.value))}
                    maxLength={100}
                    placeholder="City/Municipality, Province"
                    required
                  />
                </div>

                <div>
                  <label>Birth Order *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={birthOrder}
                    onChange={(e) => setBirthOrder(sanitizeDigits(e.target.value).slice(0, 2).replace(/^0+/, ''))}
                    maxLength={2}
                    placeholder="1 to 20"
                    required
                  />
                </div>

                <div>
                  <label>Registered (PSA)</label>
                  <PaginatedDropdown
                    options={PSA_OPTIONS}
                    value={isRegistered}
                    onChange={setIsRegistered}
                    ariaLabel="Registered (PSA)"
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label>Mother Tongue *</label>
                  <input
                    type="text"
                    value={motherTongue}
                    onChange={(e) => setMotherTongue(sanitizeName(e.target.value))}
                    maxLength={50}
                    required
                  />
                </div>

                <div>
                  <label>Other Dialect</label>
                  <input
                    type="text"
                    value={otherDialect}
                    onChange={(e) => setOtherDialect(sanitizeName(e.target.value))}
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
              {currentStep < 2 ? (
                <button
                  key="next"
                  type="button"
                  className="enrollment-next"
                  onClick={(event) => {
                    // This button is replaced by a submit button after the step changes.
                    // Cancel this click's default action before React updates the DOM.
                    event.preventDefault()
                    goToNextStep()
                  }}
                >Next</button>
              ) : (
                <button key="submit" type="submit" className="enrollment-submit" disabled={submitting || checkingDuplicate}>
                  {resubmissionId ? 'Resubmit Application' : 'Submit Enrollment'}
                </button>
              )}
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}

export default EnrollmentForm
