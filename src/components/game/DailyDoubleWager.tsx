import { useEffect, useState } from 'react'
import type { Player } from '../../types/game'
import { computeDailyDoubleWagerRange } from '../../utils/gamblingScoring'
import { formatCurrency } from '../../utils/currency'
import './DailyDoubleScreen.css'

interface DailyDoubleWagerProps {
  player: Player
  categoryName: string
  onSubmit: (wager: number) => void
}

export function DailyDoubleWager({ player, categoryName, onSubmit }: DailyDoubleWagerProps) {
  const [wagerStr, setWagerStr] = useState('')
  const [error, setError] = useState('')

  // Requirement 3.1, 3.2, 3.4, 3.9 — $1 through max($1,000, Real_Balance),
  // derived from the score alone. In co-op mode the caller passes a synthetic
  // player whose score is the co-op team maximum, so the same range applies.
  const { min: minWager, max: maxWager } = computeDailyDoubleWagerRange(player.score)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  function handleSubmit() {
    const trimmed = wagerStr.trim()
    const wagerNum = Number(trimmed)

    // Requirement 3.6 — empty, non-numeric, and fractional entries share one
    // message. Every rejection returns before `onSubmit`, so the entered value
    // and the player's Real_Balance are left untouched.
    if (!trimmed || !Number.isFinite(wagerNum) || !Number.isInteger(wagerNum)) {
      setError('Enter a whole-dollar amount, with no cents.')
      return
    }

    // Requirement 3.5 — both bounds formatted by the Currency_Formatter.
    if (wagerNum < minWager || wagerNum > maxWager) {
      setError(`Wager must be between ${formatCurrency(minWager)} and ${formatCurrency(maxWager)}.`)
      return
    }

    setError('')
    onSubmit(wagerNum)
  }

  return (
    <div className="dd-wager-overlay">
      <div className="dd-wager-card">
        <h2 className="dd-wager-title">Daily Double Wager</h2>
        <p className="dd-wager-player-name">{player.name}</p>
        <p className="dd-wager-info">
          Category: {categoryName}<br />
          {/* Requirement 3.3, 3.7 — score and both bounds via the Currency_Formatter. */}
          Score: {formatCurrency(player.score)} • Wager range: {formatCurrency(minWager)} – {formatCurrency(maxWager)}
        </p>

        <input
          type="number"
          min={minWager}
          max={maxWager}
          step={1}
          value={wagerStr}
          onChange={e => {
            setWagerStr(e.target.value)
            if (error) setError('')
          }}
          className="dd-wager-input monetary-input"
          placeholder="Enter wager..."
          autoFocus
        />

        {error && <p className="dd-wager-error">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!wagerStr}
          className="dd-wager-submit"
        >
          Submit Wager
        </button>
      </div>
    </div>
  )
}
