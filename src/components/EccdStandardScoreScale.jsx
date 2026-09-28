import { STANDARD_SCORE_CATEGORIES } from '../lib/eccd/scoring'

// Shows the five standard score interpretation categories and highlights the child's result.
function EccdStandardScoreScale({ interpretation }) {
  return (
    <section className="eccd-scale" aria-label="Standard score interpretation">
      <h4>Standard score interpretation</h4>
      <ul>
        {STANDARD_SCORE_CATEGORIES.map((category) => {
          const active = category.label === interpretation
          return (
            <li key={category.key} className={`eccd-scale-item eccd-scale-${category.key}${active ? ' active' : ''}`} aria-current={active ? 'true' : undefined}>
              <strong>{category.range}</strong>
              <span>{category.description}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default EccdStandardScoreScale
