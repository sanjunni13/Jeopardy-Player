import { motion, useReducedMotion } from 'framer-motion'
import './DisplayRoundTransition.css'

interface DisplayRoundTransitionProps {
  roundName: string
}

/**
 * Format round name for dramatic display.
 * e.g., "single" → "Jeopardy!", "double" → "Double Jeopardy!"
 */
function formatRoundLabel(roundName: string): string {
  switch (roundName) {
    case 'single':
      return 'Jeopardy!'
    case 'double':
      return 'Double Jeopardy!'
    case 'triple':
      return 'Triple Jeopardy!'
    case 'quadruple':
      return 'Quadruple Jeopardy!'
    case 'quintuple':
      return 'Quintuple Jeopardy!'
    case 'sextuple':
      return 'Sextuple Jeopardy!'
    default:
      return roundName
  }
}

/**
 * Full-screen round transition animation.
 * Shows the next round name dramatically centered on a dark background.
 * Respects prefers-reduced-motion with a simplified fade animation.
 */
export function DisplayRoundTransition({ roundName }: DisplayRoundTransitionProps) {
  const prefersReducedMotion = useReducedMotion()

  const animationVariants = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
      }
    : {
        initial: { opacity: 0, scale: 0.7 },
        animate: { opacity: 1, scale: 1 },
      }

  return (
    <div className="display-round-transition">
      <motion.div
        className="display-round-transition__content"
        initial={animationVariants.initial}
        animate={animationVariants.animate}
        transition={{
          duration: prefersReducedMotion ? 0.3 : 0.8,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        <h1 className="display-round-transition__title">
          {formatRoundLabel(roundName)}
        </h1>
      </motion.div>
    </div>
  )
}
