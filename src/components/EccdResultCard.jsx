import { DOMAINS } from '../lib/eccd/domains'
import { getScaledInterpretation } from '../lib/eccd/scoring'
import { formatResultDate, interpretationTone, standardScoreLabel } from '../lib/eccd/resultFormat'
import EccdProfileChart from './EccdProfileChart'
import EccdStandardScoreScale from './EccdStandardScoreScale'

function EccdResultCard({ result, showRaw = false, summaryOnly = false }) {
  const tone = interpretationTone(result.interpretation)
  const outOfTable = result.rangeStatus !== 'in-table'

  return (
    <div className="eccd-result">
      <div className="eccd-score-summary" data-tone={tone}>
        <div><span>Standard score</span><strong>{standardScoreLabel(result)}</strong></div>
        <div className="eccd-interpretation"><span>Overall development</span><strong>{result.interpretation}</strong></div>
        <dl>
          <div><dt>Assessed</dt><dd>{formatResultDate(result.date)}</dd></div>
          <div><dt>Age then</dt><dd>{result.ageLabel}</dd></div>
          <div><dt>Total scaled score</dt><dd>{result.totalScaledScore}</dd></div>
        </dl>
      </div>
      {outOfTable && <p className="eccd-note">The total scaled score falls outside the printed ECCD standard score table, so no exact standard score is listed. The interpretation reflects the nearest end of the table.</p>}

      {!summaryOnly && <EccdStandardScoreScale interpretation={result.interpretation} />}

      {!summaryOnly && <EccdProfileChart scaledScore={result.scaledScore} />}

      {!summaryOnly && <div className="records-table-shell eccd-table-shell">
        <table className="records-table eccd-domain-table">
          <caption className="visually-hidden">Scaled scores by developmental domain</caption>
          <thead><tr><th scope="col">Domain</th>{showRaw && result.rawScore && <th scope="col">Raw score</th>}<th scope="col">Scaled score</th><th scope="col">Reading</th></tr></thead>
          <tbody>{DOMAINS.map((domain) => (
            <tr key={domain.key}>
              <td data-label="Domain"><strong className="records-student-name">{domain.label}</strong></td>
              {showRaw && result.rawScore && <td data-label="Raw score">{result.rawScore[domain.key]}</td>}
              <td data-label="Scaled score">{result.scaledScore[domain.key]}</td>
              <td data-label="Reading">{getScaledInterpretation(result.scaledScore[domain.key])}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>}
    </div>
  )
}

export default EccdResultCard
