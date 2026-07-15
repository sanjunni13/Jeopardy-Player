/**
 * BackToTopFab
 *
 * A scroll-aware floating action button with a circular progress ring.
 * Place this component at the bottom of any scrollable page.
 * Visible after scrolling past 10% of page.
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import './backToTopFab.css'

const R = 18
const CIRC = 2 * Math.PI * R

export function BackToTopFab() {
  const [visible, setVisible] = useState(false)
  const progressRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    function handleScroll() {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight

      if (docHeight <= 0) {
        setVisible(false)
        return
      }

      const scrollPercent = scrollTop / docHeight
      setVisible(scrollPercent > 0.1)

      // Directly update the SVG circle for smooth performance
      if (progressRef.current) {
        const offset = CIRC - (scrollPercent * CIRC)
        progressRef.current.style.strokeDashoffset = String(offset)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const toTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          className="back-to-top-fab"
          onClick={toTop}
          aria-label="Back to top"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.7, opacity: 0 }}
          transition={{ type: 'spring' as const, stiffness: 300, damping: 25 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.92 }}
        >
          <svg className="fab-ring" viewBox="0 0 48 48" aria-hidden="true">
            <circle className="track" cx="24" cy="24" r={R} />
            <circle
              ref={progressRef}
              className="progress"
              cx="24"
              cy="24"
              r={R}
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC}
            />
          </svg>
          <span className="fab-icon" aria-hidden="true">↑</span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
