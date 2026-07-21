import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { DisplayPlayer } from '../../types/display'
import './DisplayScoreStrip.css'

interface DisplayScoreStripProps {
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
 * TV-optimized score strip fixed at the bottom of the viewport.
 * Shows all players in a horizontal row with animated score transitions
 * and highlights the player with the highest score.
 */
export function DisplayScoreStrip({ players }: DisplayScoreStripProps) {
  const prefersReducedMotion = useReducedMotion()

  const highestScore = players.length > 0
    ? Math.max(...players.map((p) => p.score))
    : 0

  // Multiple players can share the lead
  const hasLeader = players.filter((p) => p.score === highestScore).length < players.length

  // Scale font when more than 6 players
  const scaleFactor = players.length > 6
    ? Math.max(0.55, 6 / players.length)
    : 1

  return (
    <div className="display-score-strip" role="region" aria-label="Player scores">
      <div className="display-score-strip__inner">
        {players.map((player) => {
          const isLeader = hasLeader && player.score === highestScore

          return (
            <div
              key={player.name}
              className={`display-score-strip__player${isLeader ? ' display-score-strip__player--leader' : ''}`}
              style={{
                '--score-scale': scaleFactor,
              } as React.CSSProperties}
            >
              <span className="display-score-strip__name">{player.name}</span>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={player.score}
                  className="display-score-strip__score"
                  initial={prefersReducedMotion ? { opacity: 1 } : { y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={prefersReducedMotion ? { opacity: 0 } : { y: -8, opacity: 0 }}
                  transition={{ duration: prefersReducedMotion ? 0.01 : 0.35, ease: 'easeOut' }}
                >
                  {formatScore(player.score)}
                </motion.span>
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
