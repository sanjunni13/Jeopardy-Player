import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { DisplayFJState } from '../../types/display'
import './DisplayFinalJeopardy.css'

interface DisplayFinalJeopardyProps {
  fjState: DisplayFJState
}

/**
 * TV-optimized Final Jeopardy display component.
 *
 * Handles three sub-phases based on fjState:
 * 1. Category only (clueText === ''): FJ category in large text on dramatic dark/blue background
 * 2. Clue revealed (clueText !== '' and revealedIndex === -1): category + clue text centered
 * 3. Player reveals (revealedIndex >= 0): submissions up to revealedIndex shown one at a time
 */
export function DisplayFinalJeopardy({ fjState }: DisplayFinalJeopardyProps) {
  const prefersReducedMotion = useReducedMotion()
  const { category, clueText, submissions, revealedIndex } = fjState

  // Determine the current sub-phase
  const isCategoryOnly = clueText === ''
  const isClueRevealed = clueText !== '' && revealedIndex === -1
  const isPlayerReveal = revealedIndex >= 0

  const instantTransition = { duration: 0.01 }

  return (
    <div className="display-final-jeopardy">
      <AnimatePresence mode="wait">
        {/* Phase 1: Category Only */}
        {isCategoryOnly && (
          <motion.div
            key="category"
            className="display-fj__category-phase"
            initial={{ opacity: prefersReducedMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? instantTransition : { duration: 0.6, ease: 'easeOut' }}
          >
            <motion.span
              className="display-fj__label"
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? instantTransition : { delay: 0.2, duration: 0.4 }}
            >
              Final Jeopardy!
            </motion.span>
            <motion.h1
              className="display-fj__category-text"
              initial={prefersReducedMotion ? { opacity: 1 } : { scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={prefersReducedMotion ? instantTransition : { delay: 0.4, duration: 0.5, ease: 'easeOut' }}
            >
              {category}
            </motion.h1>
          </motion.div>
        )}

        {/* Phase 2: Clue Revealed */}
        {isClueRevealed && (
          <motion.div
            key="clue"
            className="display-fj__clue-phase"
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? instantTransition : { duration: 0.5, ease: 'easeOut' }}
          >
            <div className="display-fj__clue-header">
              <span className="display-fj__clue-label">Final Jeopardy!</span>
              <span className="display-fj__clue-category">{category}</span>
            </div>
            <div className="display-fj__clue-text">{clueText}</div>
          </motion.div>
        )}

        {/* Phase 3: Player Reveals */}
        {isPlayerReveal && (
          <motion.div
            key="reveals"
            className="display-fj__reveal-phase"
            initial={{ opacity: prefersReducedMotion ? 1 : 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? instantTransition : { duration: 0.4 }}
          >
            <div className="display-fj__reveal-header">
              <span className="display-fj__reveal-label">Final Jeopardy!</span>
              <span className="display-fj__reveal-category">{category}</span>
            </div>

            <div className="display-fj__reveal-list">
              <AnimatePresence>
                {submissions.slice(0, revealedIndex + 1).map((submission, index) => (
                  <motion.div
                    key={submission.playerName}
                    className={`display-fj__reveal-card ${
                      submission.correct === true
                        ? 'display-fj__reveal-card--correct'
                        : submission.correct === false
                          ? 'display-fj__reveal-card--incorrect'
                          : ''
                    }`}
                    initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={
                      prefersReducedMotion
                        ? instantTransition
                        : {
                            duration: 0.5,
                            ease: 'easeOut',
                            delay: index === revealedIndex ? 0.1 : 0,
                          }
                    }
                  >
                    <div className="display-fj__reveal-card-top">
                      <span className="display-fj__reveal-player">{submission.playerName}</span>
                      {submission.correct === true && (
                        <span className="display-fj__reveal-icon display-fj__reveal-icon--correct">✓</span>
                      )}
                      {submission.correct === false && (
                        <span className="display-fj__reveal-icon display-fj__reveal-icon--incorrect">✗</span>
                      )}
                    </div>
                    <div className="display-fj__reveal-card-details">
                      <span className="display-fj__reveal-answer">"{submission.answer}"</span>
                      <span className="display-fj__reveal-wager">
                        Wager: ${submission.wager.toLocaleString()}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
