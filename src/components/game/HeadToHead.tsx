import type { HeadToHeadResult } from '../../utils/analyticsUtils'

interface HeadToHeadProps {
  comparisons: HeadToHeadResult[]
}

function formatDollar(value: number): string {
  if (value < 0) return `-$${Math.abs(value).toLocaleString()}`
  return `$${value.toLocaleString()}`
}

function StatRow({ label, valueA, valueB }: { label: string; valueA: string | number; valueB: string | number }) {
  return (
    <tr className="head-to-head-stat-row">
      <td className="head-to-head-stat-value head-to-head-stat-value--a">{valueA}</td>
      <td className="head-to-head-stat-label">{label}</td>
      <td className="head-to-head-stat-value head-to-head-stat-value--b">{valueB}</td>
    </tr>
  )
}

function ComparisonCard({ result }: { result: HeadToHeadResult }) {
  return (
    <div className="head-to-head-card">
      {/* Player name headers */}
      <div className="head-to-head-header">
        <span className="head-to-head-player-name head-to-head-player-name--a">
          {result.playerA}
        </span>
        <span className="head-to-head-vs">vs</span>
        <span className="head-to-head-player-name head-to-head-player-name--b">
          {result.playerB}
        </span>
      </div>

      {/* Stat comparison table — Requirements 8.4 */}
      <table className="head-to-head-table" aria-label={`${result.playerA} vs ${result.playerB}`}>
        <tbody>
          <StatRow
            label="Correct"
            valueA={result.correctA}
            valueB={result.correctB}
          />
          <StatRow
            label="Incorrect"
            valueA={result.incorrectA}
            valueB={result.incorrectB}
          />
          <StatRow
            label="DD Attempted"
            valueA={result.ddAttemptedA}
            valueB={result.ddAttemptedB}
          />
          <StatRow
            label="DD Won"
            valueA={result.ddWonA}
            valueB={result.ddWonB}
          />
          <StatRow
            label="Final Score"
            valueA={formatDollar(result.finalScoreA)}
            valueB={formatDollar(result.finalScoreB)}
          />
        </tbody>
      </table>
    </div>
  )
}

export function HeadToHead({ comparisons }: HeadToHeadProps) {
  // Render nothing when there are no comparisons — Requirement 8.5
  if (comparisons.length === 0) return null

  return (
    <div className="head-to-head">
      {comparisons.map((result) => (
        <ComparisonCard key={`${result.playerA}-${result.playerB}`} result={result} />
      ))}
    </div>
  )
}
