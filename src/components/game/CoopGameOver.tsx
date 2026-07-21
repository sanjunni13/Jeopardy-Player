import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import type { Player } from '../../types/game'
import { BackgroundGradient } from '../ui/background-gradient'
import './CoopGameOver.css'

interface CoopGameOverProps {
  teamPool: number
  targetScore: number
  boardTotal: number
  players: Player[]
  onExportPdf: () => void
  onPlayAgain: () => void
}

export function CoopGameOver({
  teamPool,
  targetScore,
  boardTotal,
  players,
  onExportPdf,
  onPlayAgain,
}: CoopGameOverProps) {
  const confettiFiredRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const isVictory = teamPool >= targetScore
  const progressPercent = targetScore > 0 ? (teamPool / targetScore) * 100 : 100

  // Fire confetti on victory
  useEffect(() => {
    if (!isVictory || confettiFiredRef.current || !canvasRef.current) return
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
  }, [isVictory])

  return (
    <div className="coop-gameover-page">
      {/* Confetti canvas — only rendered on victory */}
      {isVictory && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        />
      )}

      <BackgroundGradient
        containerClassName="coop-gameover-gradient-container"
        className="coop-gameover-card"
      >
        {/* Victory / Defeat heading */}
        <h1 className="coop-gameover-title">
          {isVictory ? 'Team Victory! 🎉' : 'Team Defeat 😔'}
        </h1>

        {/* Final pool vs target */}
        <div className="coop-gameover-score-summary">
          <div className="coop-gameover-pool">
            <span className="coop-gameover-pool-label">Final Score</span>
            <span className={`coop-gameover-pool-value${teamPool < 0 ? ' coop-gameover-pool-value--negative' : ''}`}>
              {teamPool < 0
                ? `-$${Math.abs(teamPool).toLocaleString()}`
                : `$${teamPool.toLocaleString()}`}
            </span>
          </div>
          <div className="coop-gameover-target">
            <span className="coop-gameover-target-label">Target</span>
            <span className="coop-gameover-target-value">
              ${targetScore.toLocaleString()}
            </span>
          </div>
          <div className="coop-gameover-board-total">
            <span className="coop-gameover-board-total-label">Board Total</span>
            <span className="coop-gameover-board-total-value">
              ${boardTotal.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Progress bar (can exceed 100%) */}
        <div className={`coop-gameover-progress-container${isVictory ? ' coop-gameover-progress-container--success' : ''}`}>
          <div
            className={`coop-gameover-progress-bar${isVictory ? ' coop-gameover-progress-bar--success' : ''}`}
            style={{ width: `${Math.max(0, progressPercent)}%` }}
            role="progressbar"
            aria-valuenow={Math.round(progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Team achieved ${Math.round(progressPercent)}% of target`}
          />
        </div>
        <div className="coop-gameover-progress-label">
          {Math.round(progressPercent)}% of target
        </div>

        {/* Contribution table */}
        <div className="coop-gameover-contributions">
          <h2 className="coop-gameover-contributions-title">Team Contributions</h2>
          <div className="coop-gameover-table-wrapper">
            <table className="coop-gameover-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Correct</th>
                  <th>Incorrect</th>
                  <th>Points Contributed</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={player.name}>
                    <td className="coop-gameover-table-name">{player.name}</td>
                    <td className="coop-gameover-table-correct">{player.correctCount}</td>
                    <td className="coop-gameover-table-incorrect">{player.incorrectCount}</td>
                    <td className="coop-gameover-table-contributed">
                      {player.totalEarned < 0
                        ? `-$${Math.abs(player.totalEarned).toLocaleString()}`
                        : `$${player.totalEarned.toLocaleString()}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action buttons */}
        <div className="coop-gameover-actions">
          <button
            type="button"
            className="coop-gameover-btn coop-gameover-btn--export"
            onClick={onExportPdf}
          >
            Export PDF
          </button>
          <button
            type="button"
            className="coop-gameover-btn coop-gameover-btn--play-again"
            onClick={onPlayAgain}
          >
            Play Again
          </button>
        </div>
      </BackgroundGradient>
    </div>
  )
}
