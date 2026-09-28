// ECCD scoring engine. Pure functions only: no React, no chart code, no Supabase.
// Flow: checked items -> raw scores -> scaled scores (age table) -> total scaled score
//       -> standard score (equivalent table) -> interpretation.
import { DOMAIN_KEYS } from './domains.js'
import { CHECKLIST, MAX_RAW } from './checklistItems.js'
import {
  AGE_GROUPS,
  SCALED_LOOKUP,
  STANDARD_SCORE_TABLE,
  STANDARD_TABLE_MAX_SUM,
  STANDARD_TABLE_MIN_SUM,
  TABLE_VERSION,
} from './conversionTables.js'

export { TABLE_VERSION }

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

// Manual method: subtract the birth date from the test date as Y-M-D, treating every
// month as 30 days. There is no rounding.
export function computeAge(birthDate, assessmentDate) {
  const birth = String(birthDate || '').match(DATE_PATTERN)
  const test = String(assessmentDate || '').match(DATE_PATTERN)
  if (!birth || !test) return null

  let years = Number(test[1]) - Number(birth[1])
  let months = Number(test[2]) - Number(birth[2])
  let days = Number(test[3]) - Number(birth[3])

  if (days < 0) { days += 30; months -= 1 }
  if (months < 0) { months += 12; years -= 1 }
  if (years < 0) return null

  return { years, months, days, totalMonths: years * 12 + months }
}

export function formatAge(age) {
  if (!age) return '—'
  return `${age.years} y ${age.months} m ${age.days} d`
}

// Returns the age group id, or null when no Record 2 table covers the child
// (Record 1 for 0-3.0 years is not loaded).
export function getAgeGroup(age) {
  if (!age) return null
  return AGE_GROUPS.find((group) => age.totalMonths >= group.minMonths && age.totalMonths <= group.maxMonths) || null
}

export function getRawScores(checkedItemIds) {
  const checked = new Set(checkedItemIds)
  return Object.fromEntries(DOMAIN_KEYS.map((domain) => [
    domain,
    CHECKLIST[domain].filter((item) => checked.has(item.id)).length,
  ]))
}

export function getScaledScores(rawScores, ageGroupId) {
  const table = SCALED_LOOKUP[ageGroupId]
  if (!table) throw new Error(`No ECCD conversion table for age group "${ageGroupId}".`)

  return Object.fromEntries(DOMAIN_KEYS.map((domain) => {
    const raw = rawScores[domain]
    const scaled = table[domain][raw]
    if (!Number.isInteger(raw) || raw < 0 || raw > MAX_RAW[domain] || scaled === undefined) {
      throw new Error(`Raw score ${raw} for ${domain} is not in the ECCD conversion table.`)
    }
    return [domain, scaled]
  }))
}

export const getTotalScaledScore = (scaledScores) => DOMAIN_KEYS.reduce((sum, domain) => sum + scaledScores[domain], 0)

// The printed table covers sums 29-98. Sums outside it have no official standard score, so
// none is invented: standardScore stays null and rangeStatus says which side it fell on.
export function getStandardScore(totalScaledScore) {
  if (totalScaledScore < STANDARD_TABLE_MIN_SUM) return { standardScore: null, rangeStatus: 'below-table' }
  if (totalScaledScore > STANDARD_TABLE_MAX_SUM) return { standardScore: null, rangeStatus: 'above-table' }
  return { standardScore: STANDARD_SCORE_TABLE[totalScaledScore], rangeStatus: 'in-table' }
}

// Standard score interpretation categories (ECCD manual). `label` is the value stored in the
// database and shown on results, so keep it stable. `max: null` means "and above".
export const STANDARD_SCORE_CATEGORIES = [
  { key: 'significant', min: null, max: 69, range: '69 and below', label: 'Significant Delay in Overall Development', description: 'Suggests significant delay in overall development.' },
  { key: 'slight', min: 70, max: 79, range: '70 – 79', label: 'Slight Delay in Overall Development', description: 'Suggests slight delay in overall development.' },
  { key: 'average', min: 80, max: 119, range: '80 – 119', label: 'Average Overall Development', description: 'Average overall development.' },
  { key: 'advanced', min: 120, max: 129, range: '120 – 129', label: 'Slightly Advanced Development', description: 'Suggests slightly advanced development.' },
  { key: 'high', min: 130, max: null, range: '130 and above', label: 'Highly Advanced Development', description: 'Suggests highly advanced development.' },
]

export function getInterpretationCategory(score) {
  return STANDARD_SCORE_CATEGORIES.find((category) => (category.max === null || score <= category.max)) || STANDARD_SCORE_CATEGORIES[STANDARD_SCORE_CATEGORIES.length - 1]
}

export const getInterpretation = (score) => getInterpretationCategory(score).label

// Interpretation for a stored/computed result. Out-of-table sums are bounded by the table's
// own ends (lowest 37, highest 138), which already sit in the delayed / advanced bands.
export function interpretResult({ standardScore, rangeStatus }) {
  if (standardScore !== null && standardScore !== undefined) return getInterpretation(standardScore)
  if (rangeStatus === 'below-table') return getInterpretation(STANDARD_SCORE_TABLE[STANDARD_TABLE_MIN_SUM])
  if (rangeStatus === 'above-table') return getInterpretation(STANDARD_SCORE_TABLE[STANDARD_TABLE_MAX_SUM])
  return ''
}

// Interpretation of a single domain's scaled score (Table 6 of the manual).
export function getScaledInterpretation(scaled) {
  if (scaled <= 3) return 'Significant delay'
  if (scaled <= 6) return 'Slight delay'
  if (scaled <= 13) return 'Average'
  if (scaled <= 16) return 'Slightly advanced'
  return 'Highly advanced'
}

// Full pipeline from raw domain scores (number of items passed per domain, entered by staff).
// Throws only for programmer errors; unsupported ages return { ok: false }.
export function scoreRawScores({ birthDate, assessmentDate, rawScore }) {
  const age = computeAge(birthDate, assessmentDate)
  if (!age) return { ok: false, reason: 'invalid-date' }

  const ageGroup = getAgeGroup(age)
  if (!ageGroup) return { ok: false, reason: 'unsupported-age', age }

  const scaledScore = getScaledScores(rawScore, ageGroup.id)
  const totalScaledScore = getTotalScaledScore(scaledScore)
  const { standardScore, rangeStatus } = getStandardScore(totalScaledScore)

  return {
    ok: true,
    age,
    ageGroup: ageGroup.id,
    rawScore,
    scaledScore,
    totalScaledScore,
    standardScore,
    rangeStatus,
    interpretation: interpretResult({ standardScore, rangeStatus }),
  }
}

// Same pipeline starting from checked checklist item ids.
export const scoreAssessment = ({ birthDate, assessmentDate, checkedItemIds }) => (
  scoreRawScores({ birthDate, assessmentDate, rawScore: getRawScores(checkedItemIds) })
)
