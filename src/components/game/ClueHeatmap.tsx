import type { GameSession } from '../../types/game'
import {
  buildHeatmapCellLabel,
  computeHeatmapData,
  computeHeatmapSummary,
} from '../../utils/heatmapUtils'
import type { HeatmapRound, HeatmapCell } from '../../utils/heatmapUtils'
import { formatCurrency } from '../../utils/currency'
import { useMemo } from 'react'
import './ClueHeatmap.css'

interface ClueHeatmapProps {
  session: GameSession
}

function HeatmapCellDisplay({ cell }: { cell: HeatmapCell }) {
  const statusClass = `clue-heatmap-cell clue-heatmap-cell--${cell.status}`
  // One string for both the tooltip and the accessible label, so they cannot
  // diverge (Requirement 8.6).
  const label = buildHeatmapCellLabel(cell)

  return (
    <td className={statusClass} aria-label={label} title={label}>
      {formatCurrency(cell.value)}
      {cell.dailyDouble && (
        <span className="clue-heatmap-dd-badge" aria-hidden="true">★</span>
      )}
    </td>
  )
}

function HeatmapRoundSection({ round }: { round: HeatmapRound }) {
  const summary = useMemo(() => computeHeatmapSummary(round), [round])

  return (
    <div className="clue-heatmap-round">
      <div className="clue-heatmap-round-header">
        <span className="clue-heatmap-round-title">{round.roundDisplayName}</span>
        <div className="clue-heatmap-summary">
          <span className="clue-heatmap-summary-item">
            <span className="clue-heatmap-summary-dot clue-heatmap-summary-dot--correct" />
            <span className="clue-heatmap-summary-label">{summary.correct} correct</span>
          </span>
          <span className="clue-heatmap-summary-item">
            <span className="clue-heatmap-summary-dot clue-heatmap-summary-dot--incorrect" />
            <span className="clue-heatmap-summary-label">{summary.incorrect} incorrect</span>
          </span>
          <span className="clue-heatmap-summary-item">
            <span className="clue-heatmap-summary-dot clue-heatmap-summary-dot--unanswered" />
            <span className="clue-heatmap-summary-label">{summary.unanswered} skipped</span>
          </span>
        </div>
      </div>

      <div className="clue-heatmap-grid-wrapper">
        <table className="clue-heatmap-table" aria-label={`${round.roundDisplayName} clue heatmap`}>
          <thead>
            <tr>
              {round.categories.map((cat, i) => (
                <th key={i} className="clue-heatmap-category-header" title={cat}>
                  {cat}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {round.grid.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, colIdx) => (
                  <HeatmapCellDisplay key={colIdx} cell={cell} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ClueHeatmap({ session }: ClueHeatmapProps) {
  const rounds = useMemo(() => computeHeatmapData(session), [session])

  if (rounds.length === 0) {
    return null
  }

  return (
    <div className="clue-heatmap">
      {rounds.map((round) => (
        <HeatmapRoundSection key={round.roundName} round={round} />
      ))}
    </div>
  )
}
