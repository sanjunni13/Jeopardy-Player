/**
 * FrostedGlassModal
 *
 * A frosted-glass backdrop with a springy dialog entrance/exit.
 * Wraps any modal content with AnimatePresence + backdrop blur.
 */
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import './frostedGlassModal.css'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function useScrollLock(locked: boolean) {
  useLayoutEffect(() => {
    if (!locked) return
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    return () => { root.style.overflow = prev }
  }, [locked])
}

function trapTabKey(e: KeyboardEvent, container: HTMLElement | null) {
  if (e.key !== 'Tab' || !container) return
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE)
  if (!nodes.length) return
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = document.activeElement
  if (e.shiftKey && (active === first || active === container)) {
    e.preventDefault(); last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault(); first.focus()
  }
}

const overlayAnim = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
}

const dialogAnim = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 420, damping: 36, mass: 0.85 },
  },
  exit: { opacity: 0, y: 10, scale: 0.985, transition: { duration: 0.18 } },
}

interface FrostedGlassModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  ariaLabelledBy?: string
}

export function FrostedGlassModal({ open, onClose, children, ariaLabelledBy }: FrostedGlassModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'Tab') { trapTabKey(e, overlayRef.current) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Focus first focusable element when opened
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const first = overlayRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      first?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          className="frosted-glass-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          tabIndex={-1}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
          {...overlayAnim}
        >
          <motion.div {...dialogAnim} onClick={(e) => e.stopPropagation()}>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
