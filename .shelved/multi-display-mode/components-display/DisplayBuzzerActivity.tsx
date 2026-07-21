import { AnimatePresence, motion } from 'framer-motion'
import './DisplayBuzzerActivity.css'

interface DisplayBuzzerActivityProps {
  buzzedPlayer: string | null
  buzzResult: 'correct' | 'incorrect' | null
}

/**
 * TV-optimized buzzer activity overlay.
 *
 * Renders as an absolutely positioned overlay on top of the clue view.
 * - Shows the buzzed player's name prominently when someone buzzes in
 * - Flashes green + checkmark on correct answer (transient 2-3s)
 * - Flashes red + X on incorrect answer (transient 2-3s)
 * - When both props are null, renders nothing
 */
export function DisplayBuzzerActivity({
  buzzedPlayer,
  buzzResult,
}: DisplayBuzzerActivityProps) {
  if (!buzzedPlayer && !buzzResult) {
    return null
  }

  const resultClass = buzzResult === 'correct'
    ? 'display-buzzer-activity--correct'
    : buzzResult === 'incorrect'
      ? 'display-buzzer-activity--incorrect'
      : ''

  return (
    <div className="display-buzzer-activity">
      <AnimatePresence mode="wait">
        {buzzedPlayer && (
          <motion.div
            key={`${buzzedPlayer}-${buzzResult ?? 'pending'}`}
            className={`display-buzzer-activity__card ${resultClass}`}
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <span className="display-buzzer-activity__player-name">
              {buzzedPlayer}
            </span>

            {buzzResult === 'correct' && (
              <motion.span
                className="display-buzzer-activity__icon display-buzzer-activity__icon--correct"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.25, delay: 0.1, ease: 'backOut' }}
                aria-label="Correct"
              >
                ✓
              </motion.span>
            )}

            {buzzResult === 'incorrect' && (
              <motion.span
                className="display-buzzer-activity__icon display-buzzer-activity__icon--incorrect"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.25, delay: 0.1, ease: 'backOut' }}
                aria-label="Incorrect"
              >
                ✗
              </motion.span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
