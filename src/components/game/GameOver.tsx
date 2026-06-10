import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import type { Player } from '../../types/game'
import { updateGameStats } from '../../utils/gameApi'
import { Toast } from '../Toast'
import { BackgroundGradient } from '../ui/background-gradient'
import './GameOver.css'

interface GameOverProps {
  players: Player[]
  gameId: string
  onBackToHome: () => void
}

export function GameOver({ players, gameId, onBackToHome }: GameOverProps) {
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const statsCalledRef = useRef(false)
  const confettiFiredRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Determine winners (highest score) — sorted highest to lowest
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const highestScore = sortedPlayers[0]?.score ?? 0
  const winnerNames = sortedPlayers
    .filter(p => p.score === highestScore)
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

  // Fire confetti on mount using a canvas inside the overlay
  useEffect(() => {
    if (confettiFiredRef.current || !canvasRef.current) return
    confettiFiredRef.current = true

    const myConfetti = confetti.create(canvasRef.current, { resize: true })
    const end = Date.now() + 3 * 1000
    const colors = ['#6A1B9A', '#9C27B0', '#CE93D8', '#FFD700', '#E1BEE7']

    const frame = () => {
      if (Date.now() > end) return

      myConfetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        startVelocity: 60,
        origin: { x: 0, y: 0.5 },
        colors,
      })
      myConfetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        startVelocity: 60,
        origin: { x: 1, y: 0.5 },
        colors,
      })

      requestAnimationFrame(frame)
    }

    setTimeout(frame, 500)
  }, [])

  return (
    <div className="gameover-page">
      {/* Confetti canvas — rendered inside the overlay so it's visible */}
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100 }}
      />

      <BackgroundGradient containerClassName="gameover-gradient-container" className="gameover-card">
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

        {/* Back to home button */}
        <button
          type="button"
          onClick={onBackToHome}
          className="gameover-back-btn"
        >
          Back to Home Page
        </button>
      </BackgroundGradient>

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
