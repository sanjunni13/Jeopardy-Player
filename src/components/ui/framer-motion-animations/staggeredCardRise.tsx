/**
 * StaggeredCardRise
 *
 * Cards rise from y: 20 with a spring. Container uses staggerChildren for a clean cascade.
 * Wrap your grid container with <StaggeredCardRiseContainer> and each card with <StaggeredCardRiseItem>.
 */
import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import './staggeredCardRise.css'

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
}

const itemVariants = {
  hidden: { y: 20, opacity: 0, scale: 0.98 },
  show: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 260, damping: 22, mass: 0.9 },
  },
}

interface StaggeredCardRiseContainerProps {
  children: ReactNode
  className?: string
  /** Changing this key replays the animation */
  animationKey?: string | number
}

export function StaggeredCardRiseContainer({
  children,
  className,
  animationKey,
}: StaggeredCardRiseContainerProps) {
  return (
    <motion.div
      key={animationKey}
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  )
}

interface StaggeredCardRiseItemProps {
  children: ReactNode
  className?: string
}

export function StaggeredCardRiseItem({ children, className }: StaggeredCardRiseItemProps) {
  return (
    <motion.div
      className={className}
      variants={itemVariants}
      whileHover={{ y: -2 }}
    >
      {children}
    </motion.div>
  )
}
