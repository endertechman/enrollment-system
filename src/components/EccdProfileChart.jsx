import { DOMAINS } from '../lib/eccd/domains'

// Display layer only. It receives finished scaled scores and draws them; it never
// touches the scoring engine, so it can be redesigned freely.
const BANDS = [
  { from: 1, to: 3, tone: 'delay' },
  { from: 4, to: 6, tone: 'slight' },
  { from: 7, to: 13, tone: 'average' },
  { from: 14, to: 16, tone: 'advanced' },
  { from: 17, to: 19, tone: 'high' },
]

const WIDTH = 640
const HEIGHT = 330
const PAD = { top: 18, right: 20, bottom: 58, left: 40 }
const plotWidth = WIDTH - PAD.left - PAD.right
const plotHeight = HEIGHT - PAD.top - PAD.bottom
const xFor = (index) => PAD.left + (plotWidth / DOMAINS.length) * (index + 0.5)
const yFor = (score) => PAD.top + plotHeight - ((score - 0.5) / 19) * plotHeight

function EccdProfileChart({ scaledScore, label = 'Scaled score by developmental domain' }) {
  const points = DOMAINS.map((domain, index) => ({ domain, x: xFor(index), y: yFor(scaledScore[domain.key]), value: scaledScore[domain.key] }))

  return (
    <figure className="eccd-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
        {BANDS.map((band) => (
          <rect key={band.tone} className={`eccd-band eccd-band-${band.tone}`} x={PAD.left} width={plotWidth} y={yFor(band.to + 0.5)} height={yFor(band.from - 0.5) - yFor(band.to + 0.5)} />
        ))}
        {[1, 4, 7, 10, 13, 16, 19].map((tick) => (
          <g key={tick}>
            <line className="eccd-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={yFor(tick)} y2={yFor(tick)} />
            <text className="eccd-axis" x={PAD.left - 8} y={yFor(tick) + 4} textAnchor="end">{tick}</text>
          </g>
        ))}
        <polyline className="eccd-line" fill="none" points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
        {points.map((point) => (
          <g key={point.domain.key}>
            <circle className="eccd-dot" cx={point.x} cy={point.y} r="6" />
            <text className="eccd-value" x={point.x} y={point.y - 12} textAnchor="middle">{point.value}</text>
            <text className="eccd-axis eccd-domain-label" x={point.x} y={HEIGHT - 30} textAnchor="middle">
              {point.domain.short.split('-').length > 1 && point.domain.short.length > 9
                ? <><tspan x={point.x}>{point.domain.short.split('-')[0]}-</tspan><tspan x={point.x} dy="13">{point.domain.short.split('-')[1]}</tspan></>
                : point.domain.short}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>
        <span className="eccd-key eccd-band-delay">1–3 Significant delay</span>
        <span className="eccd-key eccd-band-slight">4–6 Slight delay</span>
        <span className="eccd-key eccd-band-average">7–13 Average</span>
        <span className="eccd-key eccd-band-advanced">14–16 Slightly advanced</span>
        <span className="eccd-key eccd-band-high">17–19 Highly advanced</span>
      </figcaption>
    </figure>
  )
}

export default EccdProfileChart
