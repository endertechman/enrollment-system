import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getPhilippineDateValue } from '../lib/philippineDate'
import { DOMAINS } from '../lib/eccd/domains'
import { MAX_RAW } from '../lib/eccd/checklistItems'
import { AGE_GROUPS } from '../lib/eccd/conversionTables'
import { TABLE_VERSION, computeAge, formatAge, getAgeGroup, scoreRawScores } from '../lib/eccd/scoring'
import EccdResultCard from './EccdResultCard'
import { resultFromRow } from '../lib/eccd/resultFormat'

function childName(student) {
  const lastName = String(student?.child_last_name || '').trim()
  const givenNames = [student?.child_first_name, student?.child_middle_name, student?.child_suffix]
    .map((part) => String(part || '').trim()).filter(Boolean).join(' ')
  return lastName && givenNames ? `${lastName}, ${givenNames}` : lastName || givenNames || 'Unnamed student'
}

const EMPTY_SCORES = Object.fromEntries(DOMAINS.map((domain) => [domain.key, '']))

function EccdAssessmentDialog({ student, onClose, onSaved }) {
  // Defaults to today (Philippine time), but the assessor can back-date it — e.g. recording an
  // assessment a day or two after it actually happened.
  const todayValue = getPhilippineDateValue()
  const [assessmentDate, setAssessmentDate] = useState(todayValue)
  const [dateError, setDateError] = useState('')
  const [scores, setScores] = useState(EMPTY_SCORES)
  const [invalid, setInvalid] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [savedRow, setSavedRow] = useState(null)

  const age = useMemo(() => computeAge(student.birth_date, assessmentDate), [student.birth_date, assessmentDate])
  const ageGroup = getAgeGroup(age)

  function changeAssessmentDate(value) {
    setAssessmentDate(value)
    if (!value) setDateError('Enter the assessment date.')
    else if (value > todayValue) setDateError('Assessment date cannot be in the future.')
    else if (student.birth_date && value < student.birth_date) setDateError('Assessment date cannot be before the child\u2019s birth date.')
    else setDateError('')
  }

  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, saving])

  function setScore(key, value) {
    setScores((current) => ({ ...current, [key]: value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 2) }))
    setInvalid((current) => { const next = new Set(current); next.delete(key); return next })
  }

  async function submit(event) {
    event.preventDefault()
    if (saving) return

    if (dateError || !assessmentDate) {
      setDateError(dateError || 'Enter the assessment date.')
      return
    }

    const bad = DOMAINS.filter((domain) => {
      const value = scores[domain.key]
      return value === '' || Number(value) > MAX_RAW[domain.key]
    })
    if (bad.length > 0) {
      setInvalid(new Set(bad.map((domain) => domain.key)))
      setMessage(`Enter a whole number in each box, from 0 up to the maximum shown (check ${bad.map((domain) => domain.label).join(', ')}).`)
      return
    }

    const rawScore = Object.fromEntries(DOMAINS.map((domain) => [domain.key, Number(scores[domain.key])]))
    const scored = scoreRawScores({ birthDate: student.birth_date, assessmentDate, rawScore })
    if (!scored.ok) {
      setMessage(scored.reason === 'unsupported-age' ? 'This child\u2019s age is not covered by the loaded ECCD tables.' : 'Check the child\u2019s birth date.')
      return
    }

    setSaving(true)
    setMessage('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); setMessage('You must be logged in.'); return }
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()

    const row = {
      enrollment_id: student.id,
      assessor_id: user.id,
      assessor_name: profile?.full_name || user.email || 'Staff',
      assessment_date: assessmentDate,
      age_years: scored.age.years,
      age_months: scored.age.months,
      age_days: scored.age.days,
      age_group: scored.ageGroup,
      responses: [],
      total_scaled_score: scored.totalScaledScore,
      standard_score: scored.standardScore,
      score_range: scored.rangeStatus,
      interpretation: scored.interpretation,
      table_version: TABLE_VERSION,
    }
    for (const item of DOMAINS) {
      row[`${item.column}_raw`] = scored.rawScore[item.key]
      row[`${item.column}_scaled`] = scored.scaledScore[item.key]
    }

    const { data, error } = await supabase.from('eccd_assessments').insert(row).select().single()
    setSaving(false)
    if (error) {
      setMessage(error.code === '23505'
        ? 'An assessment already exists for this child on that date. Open it from the student\u2019s results to delete or review it.'
        : 'Unable to save the assessment right now. Please try again.')
      return
    }
    setSavedRow(data)
    onSaved?.(data)
  }

  return (
    <div className="semester-dialog-overlay eccd-overlay" role="presentation">
      <section className="semester-dialog eccd-dialog" role="dialog" aria-modal="true" aria-labelledby="eccd-dialog-title">
        <header className="semester-dialog-header">
          <div><h2 id="eccd-dialog-title">{savedRow ? 'Assessment saved' : 'ECCD Assessment'}</h2><p>{savedRow ? childName(student) : `${childName(student)} · Enter the raw score for each domain.`}</p></div>
          <button type="button" className="popup-close-button" onClick={onClose} disabled={saving} aria-label="Close assessment"><i className="app-icon app-icon-close" aria-hidden="true" /></button>
        </header>

        {savedRow ? (
          <div className="eccd-dialog-body">
            <EccdResultCard result={resultFromRow(savedRow)} showRaw />
            <div className="semester-dialog-actions"><button type="button" className="approve-button" onClick={onClose}>Done</button></div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="growth-update-form eccd-form">
            {dateError && <p className="growth-message" role="alert" id="eccd-date-error">{dateError}</p>}
            <div className="eccd-assessment-info">
              <div><span>Assessment date</span><input type="date" value={assessmentDate} max={todayValue} min={student.birth_date || undefined} onChange={(event) => changeAssessmentDate(event.target.value)} required aria-invalid={Boolean(dateError)} aria-describedby={dateError ? 'eccd-date-error' : undefined} /></div>
              <div><span>Age during assessment</span><strong>{formatAge(age)}</strong></div>
              <div><span>ECCD table used</span><strong>{ageGroup ? ageGroup.label : 'Not available'}</strong></div>
            </div>

            {!ageGroup ? (
              <>
                <p className="growth-message" role="status">
                  {age ? `This child is ${formatAge(age)} old on this date. The loaded ECCD tables cover ${AGE_GROUPS[0].label.split(' –')[0]} to ${AGE_GROUPS[AGE_GROUPS.length - 1].label.split('– ')[1]} (Child\u2019s Record 2). Younger children use Child\u2019s Record 1, which is not loaded yet.` : 'This child\u2019s birth date is missing or invalid.'}
                </p>
                <div className="semester-dialog-actions"><button type="button" className="button-secondary" onClick={onClose}>Close</button></div>
              </>
            ) : (
              <>
                <div className="eccd-raw-grid">
                  {DOMAINS.map((domain) => (
                    <label key={domain.key} className={invalid.has(domain.key) ? 'invalid' : ''}>
                      <span className="eccd-raw-name">{domain.label}</span>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={scores[domain.key]} onFocus={(event) => event.target.select()} onChange={(event) => setScore(domain.key, event.target.value)} placeholder="0" aria-invalid={invalid.has(domain.key) || undefined} aria-label={`${domain.label} raw score, 0 to ${MAX_RAW[domain.key]}`} />
                      <small>max {MAX_RAW[domain.key]}</small>
                    </label>
                  ))}
                </div>
                {message && <p className="growth-message" role="status">{message}</p>}
                <div className="semester-dialog-actions">
                  <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                  <button type="submit" className="approve-button" disabled={saving}>{saving ? 'Saving...' : 'Submit Assessment'}</button>
                </div>
              </>
            )}
          </form>
        )}
      </section>
    </div>
  )
}

export default EccdAssessmentDialog
