import { useState } from 'react'
import type { CategoryAccuracyRow } from '../../utils/analyticsUtils'

interface CategoryAccuracyProps {
  accuracy: Map<string, CategoryAccuracyRow[]>
  playerNames: string[]
}

interface PlayerSectionProps {
  playerName: string
  rows: CategoryAccuracyRow[]
}

function PlayerSection({ playerName, rows }: PlayerSectionProps) {
  const [open, setOpen] = useState(false)

  // Omit rows where total === 0 — Requirement 4.3
  const visibleRows = rows.filter((r) => r.total > 0)

  return (
    <div className="category-accuracy-player">
      <button
        type="button"
        className="category-accuracy-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="category-accuracy-player-name">{playerName}</span>
        <span className="category-accuracy-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <table className="category-accuracy-table" aria-label={`${playerName} category accuracy`}>
          <thead>
            <tr>
              <th className="category-accuracy-th category-accuracy-th-category">Category</th>
              <th className="category-accuracy-th">Result</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const pct = Math.round((row.correct / row.total) * 100)
              return (
                <tr key={row.category} className="category-accuracy-row">
                  <td className="category-accuracy-td category-accuracy-td-category">{row.category}</td>
                  <td className="category-accuracy-td">
                    <strong>{pct}%</strong> ({row.correct}/{row.total})
                  </td>
                </tr>
              )
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td className="category-accuracy-td" colSpan={2} style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                  No answered clues
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function CategoryAccuracy({ accuracy, playerNames }: CategoryAccuracyProps) {
  return (
    <div className="category-accuracy">
      {playerNames.map((name) => {
        const rows = accuracy.get(name) ?? []
        return (
          <PlayerSection key={name} playerName={name} rows={rows} />
        )
      })}
    </div>
  )
}
