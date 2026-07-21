import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { DisplayActiveClue } from '../../types/display'
import './DisplayDailyDouble.css'

interface DisplayDailyDoubleProps {
  phase: 'daily-double' | 'daily-double-wager' | 'clue'
  playerName: string | null
  wager: number | null
  activeClue: DisplayActiveClue | null
  answerRevealed: boolean
}

/**
 * TV-optimized Daily Double component.
 *
 * Handles three sub-phases:
 * 1. Splash (phase='daily-double'): dramatic full-screen "DAILY DOUBLE" text with scale/flash
 * 2. Wager waiting (phase='daily-double-wager'): player name + "Wager: ?"
 * 3. Clue display (phase='clue' with wager): player name, wager, and clue text
 */
export function DisplayDailyDouble({
  phase,
  playerName,
  wager,
  activeClue,
  answerRevealed,
}: DisplayDailyDoubleProps) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <div className="display-daily-double">
      <AnimatePresence mode="wait">
        {phase === 'daily-double' && (
          <motion.div
            key="splash"
            className="display-daily-double__splash"
            initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.3, opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 1.1 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.6, ease: 'easeOut' }}
          >
            <motion.span
              className="display-daily-double__splash-text"
              animate={
                prefersReducedMotion
                  ? {}
                  : {
                      textShadow: [
                        '0 0 20px rgba(251, 191, 36, 0.8)',
                        '0 0 60px rgba(251, 191, 36, 1)',
                        '0 0 20px rgba(251, 191, 36, 0.8)',
                      ],
                    }
              }
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              DAILY
              <br />
              DOUBLE!
            </motion.span>
          </motion.div>
        )}

        {phase === 'daily-double-wager' && (
          <motion.div
            key="wager-waiting"
            className="display-daily-double__wager"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.4, ease: 'easeOut' }}
          >
            {playerName && (
              <span className="display-daily-double__player-name">{playerName}</span>
            )}
            <span className="display-daily-double__wager-prompt">Wager: ?</span>
          </motion.div>
        )}

        {phase === 'clue' && wager != null && activeClue && (
          <motion.div
            key="clue"
            className="display-daily-double__clue"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.4, ease: 'easeOut' }}
          >
            <div className="display-daily-double__clue-header">
              {playerName && (
                <span className="display-daily-double__player-name">{playerName}</span>
              )}
              <span className="display-daily-double__wager-amount">
                Wager: ${wager.toLocaleString()}
              </span>
            </div>

            <div className="display-daily-double__clue-category">
              {activeClue.category} — ${activeClue.value}
            </div>

            {activeClue.html ? (
              <div
                className="display-daily-double__clue-text"
                dangerouslySetInnerHTML={{ __html: activeClue.clueText }}
              />
            ) : (
              <div className="display-daily-double__clue-text">
                {activeClue.clueText}
              </div>
            )}

            {answerRevealed && (
              <div className="display-daily-double__solution">
                <span className="display-daily-double__solution-prefix">A:</span>
                {activeClue.solution}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
