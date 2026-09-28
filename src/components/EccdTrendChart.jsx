import { useMemo, useState } from 'react'
import { DOMAINS } from '../lib/eccd/domains'
import { formatResultDate } from '../lib/eccd/resultFormat'

// Display layer only: draws finished results over time and never touches the scoring engine.
// `results` are objects from resultFromRow(); order does not matter.
const SCALED_BANDS = [
  { from: 1, to: 3, tone: 'delay', label: '1–3 Significant delay' },
  { from: 4, to: 6, tone: 'slight', label: '4–6 Slight delay' },
  { from: 7, to: 13, tone: 'average', label: '7–13 Average' },
  { from: 14, to: 16, tone: 'advanced', label: '14–16 Slightly advanced' },
  { from: 17, to: 19, tone: 'high', label: '17–19 Highly advanced' },
]
const STANDARD_BANDS = [
  { from: 30, to: 69, tone: 'delay', label: '69 and below Significant delay' },
  { from: 70, to: 79, tone: 'slight', label: '70–79 Slight delay' },
  { from: 80, to: 119, tone: 'average', label: '80–119 Average' },
  { from: 120, to: 129, tone: 'advanced', label: '120–129 Slightly advanced' },
  { from: 130, to: 145, tone: 'high', label: '130 and above Highly advanced' },
]
const METRICS = [
  { key: 'standard', label: 'Standard Score', min: 30, max: 145, ticks: [40, 70, 80, 120, 130], bands: STANDARD_BANDS, read: (result) => result.standardScore },
  ...DOMAINS.map((domain) => ({ key: domain.key, label: domain.short, min: 1, max: 19, ticks: [1, 4, 7, 10, 13, 16, 19], bands: SCALED_BANDS, read: (result) => result.scaledScore[domain.key] })),
]

const WIDTH = 640
const HEIGHT = 300
const PAD = { top: 24, right: 24, bottom: 52, left: 44 }
const plotWidth = WIDTH - PAD.left - PAD.right
const plotHeight = HEIGHT - PAD.top - PAD.bottom

function shortDate(value) {
  const date = new Date(`${value}T00:00:00`)
  return {
    day: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
    year: String(date.getFullYear()),
  }
}

function EccdTrendChart({ results }) {
  const [metricKey, setMetricKey] = useState('standard')
  const metric = METRICS.find((item) => item.key === metricKey) || METRICS[0]

  const ordered = useMemo(() => [...results].sort((a, b) => String(a.date).localeCompare(String(b.date))), [results])
  const count = ordered.length

  const low = metric.min - 0.5
  const high = metric.max + 0.5
  const xFor = (index) => PAD.left + (plotWidth / Math.max(count, 1)) * (index + 0.5)
  const yFor = (value) => PAD.top + plotHeight - ((value - low) / (high - low)) * plotHeight

  const points = ordered
    .map((result, index) => ({ result, index, value: metric.read(result) }))
    .filter((point) => point.value !== null && point.value !== undefined)
  const skipped = count - points.length
  const first = points[0]
  const last = points[points.length - 1]
  const change = first && last && first !== last ? last.value - first.value : null
  const labelEvery = Math.ceil(count / 8)

  return (
    <div className="eccd-trend">
      <div className="eccd-history-picker eccd-metric-picker" role="group" aria-label="Score to chart">
        {METRICS.map((item) => (
          <button key={item.key} type="button" className={item.key === metric.key ? 'active' : ''} aria-pressed={item.key === metric.key} onClick={() => setMetricKey(item.key)}>{item.label}</button>
        ))}
      </div>

      <figure className="eccd-chart eccd-trend-chart">
        <div className="eccd-trend-scroll">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${metric.label} across ${count} assessment${count === 1 ? '' : 's'}`}>
            {metric.bands.map((band) => (
              <rect key={band.tone} className={`eccd-band eccd-band-${band.tone}`} x={PAD.left} width={plotWidth} y={yFor(band.to + 0.5)} height={yFor(band.from - 0.5) - yFor(band.to + 0.5)} />
            ))}
            {metric.ticks.map((tick) => (
              <g key={tick}>
                <line className="eccd-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={yFor(tick)} y2={yFor(tick)} />
                <text className="eccd-axis" x={PAD.left - 8} y={yFor(tick) + 4} textAnchor="end">{tick}</text>
              </g>
            ))}
            {points.length > 1 && <polyline className="eccd-line" fill="none" points={points.map((point) => `${xFor(point.index)},${yFor(point.value)}`).join(' ')} />}
            {points.map((point) => (
              <g key={point.result.id || point.index}>
                <circle className="eccd-dot" cx={xFor(point.index)} cy={yFor(point.value)} r="6"><title>{`${formatResultDate(point.result.date)}: ${point.value}`}</title></circle>
                <text className="eccd-value" x={xFor(point.index)} y={yFor(point.value) - 12} textAnchor="middle">{point.value}</text>
              </g>
            ))}
            {ordered.map((result, index) => {
              if (index % labelEvery !== 0 && index !== count - 1) return null
              const { day, year } = shortDate(result.date)
              return (
                <text key={result.id || index} className="eccd-axis eccd-domain-label" x={xFor(index)} y={HEIGHT - 28} textAnchor="middle">
                  <tspan x={xFor(index)}>{day}</tspan><tspan x={xFor(index)} dy="13">{year}</tspan>
                </text>
              )
            })}
          </svg>
        </div>
        <figcaption>
          {metric.bands.map((band) => <span key={band.tone} className={`eccd-key eccd-band-${band.tone}`}>{band.label}</span>)}
        </figcaption>
      </figure>

      {change !== null && (
        <p className="eccd-trend-summary">
          {metric.label} went from <strong>{first.value}</strong> ({formatResultDate(first.result.date)}) to <strong>{last.value}</strong> ({formatResultDate(last.result.date)}), a change of <strong>{change > 0 ? `+${change}` : change}</strong>.
        </p>
      )}
      {count === 1 && <p className="eccd-note">Only one assessment is recorded so far. The line appears once there are two or more.</p>}
      {skipped > 0 && <p className="eccd-note">{skipped} assessment{skipped === 1 ? ' is' : 's are'} not plotted because {skipped === 1 ? 'its' : 'their'} total fell outside the printed standard score table.</p>}
    </div>
  )
}

export default EccdTrendChart
