export const PHILIPPINE_TIME_ZONE = 'Asia/Manila'

const philippineDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PHILIPPINE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function dateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = philippineDateFormatter.formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  return { year: part('year'), month: part('month'), day: part('day') }
}

export function getPhilippineDateValue(value = new Date()) {
  const parts = dateParts(value)
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : ''
}

export function getAgeInYears(birthDate, referenceDate = getPhilippineDateValue()) {
  const birthMatch = String(birthDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const referenceMatch = String(referenceDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!birthMatch || !referenceMatch) return null

  const [, birthYear, birthMonth, birthDay] = birthMatch.map(Number)
  const [, referenceYear, referenceMonth, referenceDay] = referenceMatch.map(Number)
  let age = referenceYear - birthYear
  if (referenceMonth < birthMonth || (referenceMonth === birthMonth && referenceDay < birthDay)) age -= 1
  return age >= 0 ? age : null
}
