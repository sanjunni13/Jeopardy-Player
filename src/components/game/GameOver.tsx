import { useEffect, useRef, useState } from 'react'
import type { Player } from '../../types/game'
import { updateGameStats } from '../../utils/gameApi'
import { Toast } from '../Toast'
import './GameOver.css'

interface GameOverProps {
  players: Player[]
  gameId: string
  onBackToHome: () => void
}

export function GameOver({ players, gameId, onBackToHome }: GameOverProps) {
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const statsCalledRef = useRef(false)

  // Determine winners (highest score) — sorted highest to lowest (#21)
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const highestScore = sortedPlayers[0]?.score ?? 0
  const winnerNames = sortedPlayers
    .filter(p => p.score === highestScore && highestScore > 0)
    .map(p => p.name)
  const hasMultipleWinners = winnerNames.length > 1

  // Post-game stats update (fires once)
  useEffect(() => {
    if (statsCalledRef.current) return
    statsCalledRef.current = true

    updateGameStats(gameId, players, winnerNames).then(response => {
      if (!response.success) {
        setWarningMessage(response.error ?? 'Failed to update game statistics.')
      }
    }).catch(() => {
      setWarningMessage('Failed to update game statistics.')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="gameover-page">
      <div className="gameover-card">
        <h1 className="gameover-title">Game Over!</h1>

        {/* Winner announcement */}
        {winnerNames.length > 0 && (
          <div className="gameover-winner">
            {hasMultipleWinners ? (
              <p className="gameover-winner-text">
                🏆 Multiple Winners!
              </p>
            ) : (
              <p className="gameover-winner-text">
                🏆 Winner: {winnerNames[0]}
              </p>
            )}
          </div>
        )}

        {winnerNames.length === 0 && (
          <p className="gameover-no-winner">No winner — all scores are zero or negative.</p>
        )}

        {/* Final standings */}
        <ul className="gameover-standings">
          {sortedPlayers.map((player, index) => {
            const isWinner = winnerNames.includes(player.name)

            return (
              <li
                key={player.name}
                className={isWinner ? 'gameover-player-winner' : 'gameover-player'}
              >
                <div className="gameover-player-left">
                  <span className="gameover-player-rank">
                    {index + 1}.
                  </span>
                  <span className={isWinner ? 'gameover-player-name-winner' : 'gameover-player-name'}>
                    {player.name}
                  </span>
                  {isWinner && <span className="gameover-trophy">🏆</span>}
                </div>
                <span
                  className={player.score < 0 ? 'gameover-score-negative' : 'gameover-score'}
                >
                  {player.score < 0 ? `-$${Math.abs(player.score).toLocaleString()}` : `$${player.score.toLocaleString()}`}
                </span>
              </li>
            )
          })}
        </ul>

        {/* Back to home button — Fix #19: updated text */}
        <button
          type="button"
          onClick={onBackToHome}
          className="gameover-back-btn"
        >
          Back to Home Page
        </button>
      </div>

      {/* Warning toast for failed stats update */}
      {warningMessage && (
        <Toast
          message={warningMessage}
          onDismiss={() => setWarningMessage(null)}
        />
      )}
    </div>
  )
}
