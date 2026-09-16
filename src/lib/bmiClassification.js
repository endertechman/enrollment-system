// BCDC serves five-year-old children. BMI itself always uses kg / m²; only the
// child classification reference differs from adult BMI. These are the WHO
// BMI-for-age LMS values at exactly 5 years (60 completed months).
const FIVE_YEAR_OLD_LMS = {
  girl: [-0.5684, 15.2747, 0.09789],
  boy: [-0.6892, 15.1916, 0.08700],
}

function normalizeSex(sex) {
  const value = String(sex || '').trim().toLocaleLowerCase()
  if (['male', 'boy', 'm'].includes(value)) return 'boy'
  if (['female', 'girl', 'f'].includes(value)) return 'girl'
  return null
}

export function classifyChildBmi({ bmi, sex }) {
  const numericBmi = Number(bmi)
  const normalizedSex = normalizeSex(sex)
  if (!Number.isFinite(numericBmi) || numericBmi <= 0 || !normalizedSex) return null

  const [l, median, coefficient] = FIVE_YEAR_OLD_LMS[normalizedSex]
  const zScore = (Math.pow(numericBmi / median, l) - 1) / (l * coefficient)

  if (zScore < -3) return { label: 'Severely underweight', tone: 'alert', zScore }
  if (zScore < -2) return { label: 'Underweight', tone: 'warning', zScore }
  if (zScore > 3) return { label: 'Obese', tone: 'alert', zScore }
  if (zScore > 2) return { label: 'Overweight', tone: 'warning', zScore }
  return { label: 'Normal', tone: 'normal', zScore }
}
