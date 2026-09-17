// WHO Child Growth Standards BMI-for-age LMS references for children aged
// 24 through 60 completed months. BMI remains weight (kg) / height (m)^2;
// age and sex are used only to interpret that BMI value.
const WHO_BMI_FOR_AGE_LMS = {
  girl: {
    l: -0.5684,
    m: [
      15.6881, 15.6590, 15.6308, 15.6037, 15.5777, 15.5523, 15.5276,
      15.5034, 15.4798, 15.4572, 15.4356, 15.4155, 15.3968, 15.3796,
      15.3638, 15.3493, 15.3358, 15.3233, 15.3116, 15.3007, 15.2905,
      15.2814, 15.2732, 15.2661, 15.2602, 15.2556, 15.2523, 15.2503,
      15.2496, 15.2502, 15.2519, 15.2544, 15.2575, 15.2612, 15.2653,
      15.2698, 15.2747,
    ],
    s: [
      0.08454, 0.08452, 0.08449, 0.08446, 0.08444, 0.08443, 0.08444,
      0.08448, 0.08455, 0.08467, 0.08484, 0.08506, 0.08535, 0.08569,
      0.08609, 0.08654, 0.08704, 0.08757, 0.08813, 0.08872, 0.08931,
      0.08991, 0.09051, 0.09110, 0.09168, 0.09227, 0.09286, 0.09345,
      0.09403, 0.09460, 0.09515, 0.09568, 0.09618, 0.09665, 0.09709,
      0.09750, 0.09789,
    ],
  },
  boy: {
    l: [
      -0.6187, -0.5840, -0.5497, -0.5166, -0.4850, -0.4552, -0.4274,
      -0.4016, -0.3782, -0.3572, -0.3388, -0.3231, -0.3101, -0.3000,
      -0.2927, -0.2884, -0.2869, -0.2881, -0.2919, -0.2981, -0.3067,
      -0.3174, -0.3303, -0.3452, -0.3622, -0.3811, -0.4019, -0.4245,
      -0.4488, -0.4747, -0.5019, -0.5303, -0.5599, -0.5905, -0.6223,
      -0.6552, -0.6892,
    ],
    m: [
      16.0189, 15.9800, 15.9414, 15.9036, 15.8667, 15.8306, 15.7953,
      15.7606, 15.7267, 15.6934, 15.6610, 15.6294, 15.5988, 15.5693,
      15.5410, 15.5140, 15.4885, 15.4645, 15.4420, 15.4210, 15.4013,
      15.3827, 15.3652, 15.3485, 15.3326, 15.3174, 15.3029, 15.2891,
      15.2759, 15.2633, 15.2514, 15.2400, 15.2291, 15.2188, 15.2091,
      15.2000, 15.1916,
    ],
    s: [
      0.07785, 0.07792, 0.07800, 0.07808, 0.07818, 0.07829, 0.07841,
      0.07854, 0.07867, 0.07882, 0.07897, 0.07914, 0.07931, 0.07950,
      0.07969, 0.07990, 0.08012, 0.08036, 0.08061, 0.08087, 0.08115,
      0.08144, 0.08174, 0.08205, 0.08238, 0.08272, 0.08307, 0.08343,
      0.08380, 0.08418, 0.08457, 0.08496, 0.08536, 0.08577, 0.08617,
      0.08659, 0.08700,
    ],
  },
}

function normalizeSex(sex) {
  const value = String(sex || '').trim().toLocaleLowerCase()
  if (['male', 'boy', 'm'].includes(value)) return 'boy'
  if (['female', 'girl', 'f'].includes(value)) return 'girl'
  return null
}

function parseDate(value) {
  if (!value) return null
  const parsed = value instanceof Date
    ? new Date(value.getTime())
    : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getAgeInCompletedMonths(birthDate, measuredAt = new Date()) {
  const birth = parseDate(birthDate)
  const measurement = parseDate(measuredAt)
  if (!birth || !measurement || measurement < birth) return null

  let months = (measurement.getFullYear() - birth.getFullYear()) * 12
    + measurement.getMonth() - birth.getMonth()
  if (measurement.getDate() < birth.getDate()) months -= 1
  return months
}

export function classifyChildBmi({ bmi, sex, birthDate, measuredAt }) {
  const numericBmi = Number(bmi)
  const normalizedSex = normalizeSex(sex)
  const ageMonths = getAgeInCompletedMonths(birthDate, measuredAt)
  if (!Number.isFinite(numericBmi) || numericBmi <= 0 || !normalizedSex) return null
  if (ageMonths === null || ageMonths < 24 || ageMonths > 60) return null

  const reference = WHO_BMI_FOR_AGE_LMS[normalizedSex]
  const index = ageMonths - 24
  const l = Array.isArray(reference.l) ? reference.l[index] : reference.l
  const median = reference.m[index]
  const coefficient = reference.s[index]
  const zScore = (Math.pow(numericBmi / median, l) - 1) / (l * coefficient)

  if (zScore < -3) return { label: 'Severely underweight', tone: 'alert', zScore, ageMonths }
  if (zScore < -2) return { label: 'Underweight', tone: 'warning', zScore, ageMonths }
  if (zScore > 3) return { label: 'Obese', tone: 'alert', zScore, ageMonths }
  if (zScore > 2) return { label: 'Overweight', tone: 'warning', zScore, ageMonths }
  return { label: 'Normal', tone: 'normal', zScore, ageMonths }
}
