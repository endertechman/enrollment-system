import { DOMAINS } from './domains.js'
import { AGE_GROUPS } from './conversionTables.js'

export function formatResultDate(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function interpretationTone(interpretation = '') {
  if (interpretation.startsWith('Significant')) return 'alert'
  if (interpretation.startsWith('Slight Delay')) return 'warning'
  if (interpretation.startsWith('Slightly Advanced') || interpretation.startsWith('Highly')) return 'advanced'
  return 'ok'
}

export function standardScoreLabel(result) {
  if (result.standardScore !== null && result.standardScore !== undefined) return String(result.standardScore)
  return result.rangeStatus === 'below-table' ? 'Below 37' : result.rangeStatus === 'above-table' ? 'Above 138' : '—'
}

// Turns a database row (staff table or parent RPC) into the shape the UI uses.
// Raw scores exist only on staff rows.
export function resultFromRow(row) {
  const scaledScore = {}
  const rawScore = {}
  let hasRaw = true
  for (const domain of DOMAINS) {
    scaledScore[domain.key] = row[`${domain.column}_scaled`]
    const raw = row[`${domain.column}_raw`]
    if (raw === undefined) hasRaw = false
    rawScore[domain.key] = raw
  }
  return {
    id: row.id,
    date: row.assessment_date,
    ageLabel: `${row.age_years} y ${row.age_months} m`,
    ageGroup: AGE_GROUPS.find((group) => group.id === row.age_group)?.label || row.age_group,
    scaledScore,
    rawScore: hasRaw ? rawScore : null,
    totalScaledScore: row.total_scaled_score,
    standardScore: row.standard_score,
    rangeStatus: row.score_range,
    interpretation: row.interpretation,
    assessor: row.assessor_name,
  }
}
