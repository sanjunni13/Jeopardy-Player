import type { HeadToHeadResult } from '../../utils/analyticsUtils'

interface HeadToHeadProps {
  comparisons: HeadToHeadResult[]
  /** Maps player name → hex colour (from the score timeline palette) */
  playerColors: Map<string, string>
}

function formatDollar(value: number): string {
  if (value < 0) return `-$${Math.abs(value).toLocaleString()}`
  return `$${value.toLocaleString()}`
}

function StatRow({ label, valueA, valueB, colorA, colorB }: {
  label: string
  valueA: string | number
  valueB: string | number
  colorA: string
  colorB: string
}) {
  return (
    <tr className="head-to-head-stat-row">
      <td className="head-to-head-stat-value head-to-head-stat-value--a" style={{ color: colorA }}>{valueA}</td>
      <td className="head-to-head-stat-label">{label}</td>
      <td className="head-to-head-stat-value head-to-head-stat-value--b" style={{ color: colorB }}>{valueB}</td>
    </tr>
  )
}

function ComparisonCard({ result, playerColors }: { result: HeadToHeadResult; playerColors: Map<string, string> }) {
  const colorA = playerColors.get(result.playerA) ?? '#e2e8f0'
  const colorB = playerColors.get(result.playerB) ?? '#e2e8f0'

  return (
    <div className="head-to-head-card">
      {/* Player name headers */}
      <div className="head-to-head-header">
        <span className="head-to-head-player-name head-to-head-player-name--a" style={{ color: colorA }}>
          {result.playerA}
        </span>
        <span className="head-to-head-vs">vs</span>
        <span className="head-to-head-player-name head-to-head-player-name--b" style={{ color: colorB }}>
          {result.playerB}
        </span>
      </div>

      {/* Stat comparison table */}
      <table className="head-to-head-table" aria-label={`${result.playerA} vs ${result.playerB}`}>
        <tbody>
          <StatRow label="Correct"                   valueA={result.correctA}      valueB={result.correctB}      colorA={colorA} colorB={colorB} />
          <StatRow label="Incorrect"                 valueA={result.incorrectA}    valueB={result.incorrectB}    colorA={colorA} colorB={colorB} />
          <StatRow label="Daily Doubles Attempted"   valueA={result.ddAttemptedA}  valueB={result.ddAttemptedB}  colorA={colorA} colorB={colorB} />
          <StatRow label="Daily Doubles Won"         valueA={result.ddWonA}        valueB={result.ddWonB}        colorA={colorA} colorB={colorB} />
          <StatRow label="Final Score"               valueA={formatDollar(result.finalScoreA)} valueB={formatDollar(result.finalScoreB)} colorA={colorA} colorB={colorB} />
        </tbody>
      </table>
    </div>
  )
}

export function HeadToHead({ comparisons, playerColors }: HeadToHeadProps) {
  if (comparisons.length === 0) return null

  return (
    <div className="head-to-head">
      {comparisons.map((result) => (
        <ComparisonCard
          key={`${result.playerA}-${result.playerB}`}
          result={result}
          playerColors={playerColors}
        />
      ))}
    </div>
  )
}
