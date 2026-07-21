import { AnimatePresence, motion } from 'framer-motion'
import './CoopScoreboard.css'

interface CoopScoreboardProps {
  teamPool: number
  targetScore: number
  playerNames: string[]
  animate?: boolean
}

export function CoopScoreboard({
  teamPool,
  targetScore,
  playerNames,
  animate = true,
}: CoopScoreboardProps) {
  const progressPercent = Math.min(100, Math.max(0, (teamPool / targetScore) * 100))
  const isSuccess = teamPool >= targetScore

  return (
    <div className="coop-scoreboard">
      <div className="coop-scoreboard__pool">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={teamPool}
            className={`coop-scoreboard__pool-value${teamPool < 0 ? ' coop-scoreboard__pool-value--negative' : ''}`}
            initial={animate ? { y: 10, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            exit={animate ? { y: -10, opacity: 0 } : undefined}
            transition={{ duration: 0.3 }}
          >
            {teamPool < 0
              ? `-$${Math.abs(teamPool).toLocaleString()}`
              : `$${teamPool.toLocaleString()}`}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className={`coop-scoreboard__progress-container${isSuccess ? ' coop-scoreboard__progress-container--success' : ''}`}>
        <div
          className={`coop-scoreboard__progress-bar${isSuccess ? ' coop-scoreboard__progress-bar--success' : ''}`}
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Team progress: ${Math.round(progressPercent)}%`}
        />
        {isSuccess && (
          <span className="coop-scoreboard__checkmark" aria-label="Target reached">
            ✓
          </span>
        )}
      </div>

      <div className="coop-scoreboard__target">
        Target: ${targetScore.toLocaleString()}
      </div>

      <ul className="coop-scoreboard__players">
        {playerNames.map((name) => (
          <li key={name} className="coop-scoreboard__player">
            {name}
          </li>
        ))}
      </ul>
    </div>
  )
}
