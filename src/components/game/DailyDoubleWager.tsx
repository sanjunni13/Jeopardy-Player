import { useEffect, useState } from 'react'
import type { Player } from '../../types/game'
import './DailyDoubleScreen.css'

interface DailyDoubleWagerProps {
  player: Player
  categoryName: string
  onSubmit: (wager: number) => void
}

export function DailyDoubleWager({ player, categoryName, onSubmit }: DailyDoubleWagerProps) {
  const [wagerStr, setWagerStr] = useState('')
  const [error, setError] = useState('')

  const maxWager = player.score > 0 ? player.score : 1000
  const minWager = 0

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
    const wagerNum = Number(wagerStr)

    if (!wagerStr || isNaN(wagerNum)) {
      setError('Enter a valid number.')
      return
    }

    if (wagerNum < minWager || wagerNum > maxWager) {
      setError(`Wager must be between $${minWager} and $${maxWager.toLocaleString()}.`)
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
          Score: ${player.score.toLocaleString()} • Max wager: ${maxWager.toLocaleString()}
        </p>

        <input
          type="number"
          min={minWager}
          max={maxWager}
          value={wagerStr}
          onChange={e => {
            setWagerStr(e.target.value)
            if (error) setError('')
          }}
          className="dd-wager-input"
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
