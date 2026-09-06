import { useEffect } from 'react'
import { formatCurrency } from '../../utils/currency'
import './CategoryWinToast.css'

/** How long the toast stays on the page before it dismisses itself (Requirement 7.3). */
export const CATEGORY_WIN_TOAST_LIFETIME_MS = 5000

interface CategoryWinToastProps {
  category: string
  winningBid: number
  /** Fires after the 5s lifetime so the parent can clear its state. */
  onDismiss: () => void
}

/** Requirement 7.4, 7.5 — falls back to the raw amount when the formatter returns ''. */
export function buildCategoryWinMessage(category: string, winningBid: number): string {
  const amount = formatCurrency(winningBid)
  return `You won "${category}" for ${amount === '' ? String(winningBid) : amount}! 🎉`
}

/**
 * Transient top-right notice telling a player they won a category auction.
 *
 * Owns its own 5-second lifetime: the parent renders it with structured data and
 * clears that data from `onDismiss` (Requirement 7.3).
 */
export function CategoryWinToast({ category, winningBid, onDismiss }: CategoryWinToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, CATEGORY_WIN_TOAST_LIFETIME_MS)
    return () => clearTimeout(timer)
  }, [category, winningBid, onDismiss])

  return (
    <div className="category-win-toast" role="status" aria-live="polite">
      {buildCategoryWinMessage(category, winningBid)}
    </div>
  )
}
