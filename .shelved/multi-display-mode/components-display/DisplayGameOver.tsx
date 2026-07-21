import { useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import confetti from 'canvas-confetti'
import type { DisplayPlayer } from '../../types/display'
import './DisplayGameOver.css'

interface DisplayGameOverProps {
  players: DisplayPlayer[]
}

/**
 * Format a score as currency: "$1,200" or "-$400"
 */
function formatScore(score: number): string {
  if (score < 0) {
    return `-$${Math.abs(score).toLocaleString()}`
  }
  return `$${score.toLocaleString()}`
}

/**
 * Fire confetti bursts from both sides of the screen.
 */
function fireConfetti() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReduced) return

  const duration = 3000
  const end = Date.now() + duration

  const frame = () => {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors: ['#facc15', '#fde68a', '#f59e0b', '#fbbf24'],
    })
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors: ['#facc15', '#fde68a', '#f59e0b', '#fbbf24'],
    })

    if (Date.now() < end) {
      requestAnimationFrame(frame)
    }
  }

  // Initial big burst
  confetti({
    particleCount: 100,
    spread: 100,
    origin: { x: 0.5, y: 0.4 },
    colors: ['#facc15', '#fde68a', '#f59e0b', '#fbbf24', '#ffffff'],
  })

  frame()
}

/**
 * TV-optimized Game Over screen.
 * Displays final scores sorted descending, highlights the winner,
 * and fires a confetti animation on mount.
 */
export function DisplayGameOver({ players }: DisplayGameOverProps) {
  const prefersReducedMotion = useReducedMotion()
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const winnerScore = sortedPlayers.length > 0 ? sortedPlayers[0].score : 0

  useEffect(() => {
    fireConfetti()
  }, [])

  return (
    <div className="display-game-over">
      <motion.h1
        className="display-game-over__heading"
        initial={prefersReducedMotion ? { opacity: 1 } : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: prefersReducedMotion ? 0.01 : 0.6, ease: 'easeOut' }}
      >
        Game Over
      </motion.h1>

      <div className="display-game-over__scores">
        {sortedPlayers.map((player, index) => {
          const isWinner = player.score === winnerScore && index === 0

          return (
            <motion.div
              key={player.name}
              className={`display-game-over__player${isWinner ? ' display-game-over__player--winner' : ''}`}
              initial={prefersReducedMotion ? { opacity: 1 } : { x: -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{
                duration: prefersReducedMotion ? 0.01 : 0.4,
                delay: prefersReducedMotion ? 0 : 0.4 + index * 0.15,
                ease: 'easeOut',
              }}
            >
              <span className="display-game-over__rank">{index + 1}</span>
              <span className="display-game-over__name">{player.name}</span>
              <span className="display-game-over__score">{formatScore(player.score)}</span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
