/**
 * UnderlineGlide
 *
 * A shared-layout underline that glides between tabs using layoutId.
 * Wrap the tab bar in <LayoutGroup> and render <UnderlineGlideIndicator /> inside the active tab button.
 */
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import './underlineGlide.css'

interface UnderlineGlideIndicatorProps {
  layoutId?: string
}

export function UnderlineGlideIndicator({ layoutId = 'tab-underline' }: UnderlineGlideIndicatorProps) {
  return (
    <motion.span
      layoutId={layoutId}
      className="underline-glide-indicator"
      transition={{ type: 'spring' as const, stiffness: 500, damping: 40 }}
    />
  )
}

interface UnderlineGlideTabBarProps {
  children: React.ReactNode
  className?: string
}

/**
 * Wrap your tab buttons in this component so layoutId animations work across siblings.
 */
export function UnderlineGlideTabBar({ children, className }: UnderlineGlideTabBarProps) {
  return (
    <LayoutGroup>
      <div className={className}>
        {children}
      </div>
    </LayoutGroup>
  )
}

interface UnderlineGlideTabContentProps {
  activeKey: string
  children: React.ReactNode
  className?: string
}

export function UnderlineGlideTabContent({ activeKey, children, className }: UnderlineGlideTabContentProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeKey}
        className={className}
        initial={{ y: 8, opacity: 0.75 }}
        animate={{ y: 0, opacity: 1, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
        exit={{ y: -8, opacity: 0, transition: { duration: 0.18, ease: 'easeOut' } }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
