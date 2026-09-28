// The seven ECCD developmental domains. Keys match the coding summary.
export const DOMAINS = [
  { key: 'grossMotor', label: 'Gross Motor', short: 'Gross Motor', column: 'gross_motor' },
  { key: 'fineMotor', label: 'Fine Motor', short: 'Fine Motor', column: 'fine_motor' },
  { key: 'selfHelp', label: 'Self-Help', short: 'Self-Help', column: 'self_help' },
  { key: 'receptiveLanguage', label: 'Receptive Language', short: 'Receptive', column: 'receptive_language' },
  { key: 'expressiveLanguage', label: 'Expressive Language', short: 'Expressive', column: 'expressive_language' },
  { key: 'cognitive', label: 'Cognitive', short: 'Cognitive', column: 'cognitive' },
  { key: 'socioEmotional', label: 'Socio-Emotional', short: 'Socio-Emotional', column: 'socio_emotional' },
]

export const DOMAIN_KEYS = DOMAINS.map((domain) => domain.key)
