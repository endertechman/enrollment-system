// Shared input rules for enrollment fields. Sanitizers run on every change
// (typing and pasting) so invalid characters never enter the form state.

const NAME_CHARS = /[^\p{L}\p{M}\s'’.-]/gu
const MIDDLE_NAME_CHARS = /[^\p{L}\p{M}\s]/gu
const PLACE_CHARS = /[^\p{L}\p{M}\p{N}\s'’.,-]/gu
const SUFFIX_CHARS = /[^\p{L}\p{M}.]/gu

function tidy(value) {
  return value.replace(/^\s+/, '').replace(/\s{2,}/g, ' ')
}

export const sanitizeName = (value) => tidy(value.replace(NAME_CHARS, ''))
// Middle names accept letters (and spaces between words) only.
export const sanitizeMiddleName = (value) => tidy(value.replace(MIDDLE_NAME_CHARS, ''))
export const sanitizePlace = (value) => tidy(value.replace(PLACE_CHARS, ''))
export const sanitizeSuffix = (value) => value.replace(SUFFIX_CHARS, '')
export const sanitizeDigits = (value) => value.replace(/\D/g, '')

const hasLetter = (value) => /\p{L}/u.test(value)

export function validateNameField(label, value, { required = true } = {}) {
  const text = value.trim()
  if (!text) return required ? `${label} is required.` : ''
  if (!hasLetter(text)) return `${label} must contain letters.`
  if (text.length < 2 && required && !/^\p{L}\.?$/u.test(text)) return `${label} is too short.`
  return ''
}

export function validateBirthOrder(value) {
  if (value === '') return 'Birth order is required.'
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1 || number > 20) return 'Birth order must be a whole number from 1 to 20.'
  return ''
}
