import { useState } from 'react'
import type { Player } from '../../types/game'
import {
  computeBalanceRelativeWagerRange,
  computeLowestPositiveBalance,
} from '../../utils/gameToggles'
import { formatCurrency } from '../../utils/currency'
import './DailyDoubleScreen.css'
import './WagerEntry.css'

interface WagerEntryProps {
  players: Player[]
  wagerFloor: number
  onReveal: (wagers: Record<string, number>) => void
}

interface PlayerWagerState {
  value: string
  error: string | null
}

/**
 * The wager phase snapshot. Both the Lowest_Positive_Balance and every
 * player's balance are captured once, when the phase begins, so no permitted
 * range shifts if a balance changes while wagers are being entered.
 *
 * Requirements: 4.9, 4.10
 */
interface WagerSnapshot {
  lowestPositiveBalance: number | null
  scores: Record<string, number>
}

export function WagerEntry({ players, wagerFloor, onReveal }: WagerEntryProps) {
  const [wagerStates, setWagerStates] = useState<Record<string, PlayerWagerState>>(
    () =>
      Object.fromEntries(
        players.map(p => [p.name, { value: '', error: null }])
      )
  )

  // Frozen on mount: the field-relative cap is computed from the balances held
  // at the instant the wager phase begins and never recomputed.
  const [snapshot] = useState<WagerSnapshot>(() => ({
    lowestPositiveBalance: computeLowestPositiveBalance(players),
    scores: Object.fromEntries(players.map(p => [p.name, p.score])),
  }))

  /**
   * The one shared balance-relative range, applied per player.
   * A player absent from the snapshot (joined after the phase began) falls
   * back to their current balance against the same frozen field cap.
   *
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.7, 4.8
   */
  function rangeFor(player: Player): { min: number; max: number } {
    const score = snapshot.scores[player.name] ?? player.score
    return computeBalanceRelativeWagerRange(
      score,
      wagerFloor,
      snapshot.lowestPositiveBalance
    )
  }

  function validateWager(playerName: string, value: string): string | null {
    if (!value.trim()) return 'Enter a wager.'

    const num = Number(value)
    if (!Number.isInteger(num) || isNaN(num)) return 'Enter a whole number.'

    const player = players.find(p => p.name === playerName)!
    const { min, max } = rangeFor(player)

    if (num < min || num > max) {
      return `Wager must be between ${formatCurrency(min)} and ${formatCurrency(max)}.`
    }

    return null
  }

  function handleChange(playerName: string, rawValue: string) {
    // Filter non-digit characters (allow an optional leading minus for negative scores)
    // Only allow digits — wager amounts are always positive
    const filtered = rawValue.replace(/[^\d]/g, '')

    setWagerStates(prev => {
      const current = prev[playerName]
      // If an error is already showing, re-validate on every change to clear it promptly
      const error = current.error !== null ? validateWager(playerName, filtered) : null
      return { ...prev, [playerName]: { value: filtered, error } }
    })
  }

  function handleBlur(playerName: string) {
    const { value } = wagerStates[playerName]
    const error = validateWager(playerName, value)
    setWagerStates(prev => ({ ...prev, [playerName]: { ...prev[playerName], error } }))
  }

  const allValid =
    players.length > 0 &&
    players.every(p => {
      const state = wagerStates[p.name]
      return state.value.trim() !== '' && validateWager(p.name, state.value) === null
    })

  function handleReveal() {
    // Final validation pass before revealing
    const updatedStates = { ...wagerStates }
    let hasErrors = false

    for (const player of players) {
      const error = validateWager(player.name, wagerStates[player.name].value)
      updatedStates[player.name] = { ...updatedStates[player.name], error }
      if (error) hasErrors = true
    }

    if (hasErrors) {
      setWagerStates(updatedStates)
      return
    }

    const wagers = Object.fromEntries(
      players.map(p => [p.name, Number(wagerStates[p.name].value)])
    )
    onReveal(wagers)
  }

  return (
    <div className="wager-entry-overlay">
      <div className="wager-entry-header">
        <h2 className="wager-entry-title">Place Your Wagers</h2>
        <p className="wager-entry-subtitle">Enter your wager before the clue is revealed</p>
      </div>

      <div className="wager-entry-rows">
        {players.map(player => {
          const state = wagerStates[player.name]
          const { min, max } = rangeFor(player)

          return (
            <div key={player.name} className="wager-entry-row">
              <div className="wager-entry-player-info">
                <span className="wager-entry-player-name">{player.name}</span>
                <span className="wager-entry-player-score">
                  {formatCurrency(player.score)}
                </span>
                <span className="wager-entry-range">
                  Range: {formatCurrency(min)} – {formatCurrency(max)}
                </span>
              </div>

              <div className="wager-entry-input-group">
                <input
                  type="number"
                  inputMode="numeric"
                  min={min}
                  max={max}
                  value={state.value}
                  onChange={e => handleChange(player.name, e.target.value)}
                  onBlur={() => handleBlur(player.name)}
                  className={`wager-entry-input monetary-input${state.error ? ' wager-entry-input--error' : ''}`}
                  placeholder="Enter wager..."
                  aria-label={`Wager for ${player.name}`}
                  aria-describedby={state.error ? `wager-error-${player.name}` : undefined}
                  aria-invalid={state.error !== null}
                />
                {state.error && (
                  <p
                    id={`wager-error-${player.name}`}
                    className="wager-entry-error"
                    role="alert"
                  >
                    {state.error}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="wager-entry-footer">
        <button
          type="button"
          onClick={handleReveal}
          disabled={!allValid}
          className="wager-entry-reveal-btn"
        >
          Reveal Clue
        </button>
      </div>
    </div>
  )
}
