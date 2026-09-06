import { orientComparison } from '../../utils/analyticsUtils'
import type { HeadToHeadResult } from '../../utils/analyticsUtils'
import { formatCurrency } from '../../utils/currency'
import { CollapsiblePlayerSection } from './CollapsiblePlayerSection'

interface HeadToHeadProps {
  comparisons: HeadToHeadResult[]
  /** Section order — normally the sorted-players order from the analytics screen */
  playerNames: string[]
  /** Maps player name → hex colour (from the score timeline palette) */
  playerColors: Map<string, string>
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
          <StatRow label="Final Score"               valueA={formatCurrency(result.finalScoreA)} valueB={formatCurrency(result.finalScoreB)} colorA={colorA} colorB={colorB} />
        </tbody>
      </table>
    </div>
  )
}

/**
 * One Collapsible_Player_Section per player who has at least one comparison,
 * with that player always on the left-hand side (Requirement 9.3). Mirroring is
 * intentional: each unique pair appears twice, once under each participant, so
 * a player's section is self-contained.
 */
export function HeadToHead({ comparisons, playerNames, playerColors }: HeadToHeadProps) {
  if (comparisons.length === 0) return null

  // Section order follows playerNames; players named only in comparisons keep
  // their first-seen order after the listed ones so nothing is silently dropped.
  const orderedNames = [...playerNames]
  for (const result of comparisons) {
    for (const name of [result.playerA, result.playerB]) {
      if (!orderedNames.includes(name)) orderedNames.push(name)
    }
  }

  const sections = orderedNames
    .map((playerName) => ({
      playerName,
      oriented: comparisons
        .filter((result) => result.playerA === playerName || result.playerB === playerName)
        .map((result) => orientComparison(result, playerName)),
    }))
    // Only players with at least one comparison get a section — Requirement 9.3
    .filter((section) => section.oriented.length > 0)

  if (sections.length === 0) return null

  return (
    <div className="head-to-head">
      {sections.map((section) => (
        <CollapsiblePlayerSection key={section.playerName} playerName={section.playerName}>
          <div className="head-to-head-section-content">
            {section.oriented.map((result) => (
              <ComparisonCard
                key={`${result.playerA}-${result.playerB}`}
                result={result}
                playerColors={playerColors}
              />
            ))}
          </div>
        </CollapsiblePlayerSection>
      ))}
    </div>
  )
}
