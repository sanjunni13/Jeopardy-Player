/**
 * ContextMenuMorph
 *
 * An animated context menu that morphs in with framer-motion.
 * The menu surface animates with scale and opacity for a smooth appearance.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import './contextMenuMorph.css'

/** Clamp menu position to stay inside viewport */
function clampToViewport(x: number, y: number, w: number, h: number, pad = 8) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const nx = Math.min(Math.max(pad, x), Math.max(pad, vw - w - pad))
  const ny = Math.min(Math.max(pad, y), Math.max(pad, vh - h - pad))
  return { x: nx, y: ny }
}

interface ContextMenuMorphProps {
  open: boolean
  onClose: () => void
  anchorX: number
  anchorY: number
  children: ReactNode
  menuWidth?: number
  menuHeight?: number
}

export function ContextMenuMorph({
  open,
  onClose,
  anchorX,
  anchorY,
  children,
  menuWidth = 128,
  menuHeight = 120,
}: ContextMenuMorphProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)

  // Close on ESC or click outside
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open, onClose])

  // Focus first menu item when opened
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => firstItemRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [open])

  const { x, y } = clampToViewport(anchorX, anchorY, menuWidth, menuHeight)

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Transparent click-away backdrop */}
          <div
            className="absolute inset-0 pointer-events-auto"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Positioned menu */}
          <div
            className="absolute pointer-events-none"
            style={{ left: x, top: y }}
          >
            <motion.div
              ref={menuRef}
              className="context-menu-morph-surface pointer-events-auto"
              initial={{ opacity: 0, scale: 0.92, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <nav aria-label="Attachment options">
                {children}
              </nav>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

interface ContextMenuItemProps {
  children: ReactNode
  onClick: () => void
  className?: string
  isFirst?: boolean
}

export function ContextMenuItem({ children, onClick, className, isFirst }: ContextMenuItemProps) {
  return (
    <motion.button
      type="button"
      className={`context-menu-morph-item ${className ?? ''}`}
      onClick={onClick}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15, delay: isFirst ? 0.04 : 0.08 }}
      role="menuitem"
    >
      {children}
    </motion.button>
  )
}
