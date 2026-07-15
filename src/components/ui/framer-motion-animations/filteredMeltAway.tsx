/**
 * FilteredMeltAway
 *
 * Items that don't match filters melt away (opacity + blur), while matches
 * flow into place with springy layout transitions.
 *
 * On initial load, items animate in with a rise effect.
 * On subsequent filter/sort changes, items melt away and reposition.
 */
import { type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import './filteredMeltAway.css'

interface MeltAwayListProps {
  children: ReactNode
  className?: string
}

export function MeltAwayList({ children, className }: MeltAwayListProps) {
  return (
    <motion.div className={className} layout>
      <AnimatePresence initial={true} mode="popLayout">
        {children}
      </AnimatePresence>
    </motion.div>
  )
}

interface MeltAwayItemProps {
  children: ReactNode
  className?: string
  itemKey: string
}

export function MeltAwayItem({ children, className, itemKey }: MeltAwayItemProps) {
  return (
    <motion.div
      key={itemKey}
      layout
      className={className}
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{
        opacity: 0,
        scale: 0.96,
        filter: 'blur(6px)',
        transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
      }}
      transition={{
        type: 'spring' as const,
        stiffness: 300,
        damping: 28,
        mass: 0.8,
        layout: { type: 'spring' as const, stiffness: 350, damping: 35 },
      }}
    >
      {children}
    </motion.div>
  )
}
