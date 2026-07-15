/**
 * PagedTableTransition
 *
 * Animated table pages with springy page swap transitions and staggered row entrances.
 * Wrap your table body with <PagedTableBody> and provide a unique pageKey per page.
 */
import { type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import './pagedTableTransition.css'

interface PagedTableBodyProps {
  pageKey: string | number
  children: ReactNode
  className?: string
}

export function PagedTableBody({ pageKey, children, className }: PagedTableBodyProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.tbody
        key={pageKey}
        className={className}
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1, transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] } }}
        exit={{ y: -12, opacity: 0, transition: { duration: 0.2 } }}
      >
        {children}
      </motion.tbody>
    </AnimatePresence>
  )
}

interface PagedTableRowProps {
  children: ReactNode
  className?: string
  index?: number
}

export function PagedTableRow({ children, className, index = 0 }: PagedTableRowProps) {
  return (
    <motion.tr
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1], delay: index * 0.035 },
      }}
    >
      {children}
    </motion.tr>
  )
}

interface PagedTablePagerProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function PagedTablePager({ currentPage, totalPages, onPageChange }: PagedTablePagerProps) {
  return (
    <div className="paged-table-pager">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 0}
        aria-label="Previous page"
      >
        ← Prev
      </button>
      <span className="paged-table-page-info">
        Page {currentPage + 1} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages - 1}
        aria-label="Next page"
      >
        Next →
      </button>
    </div>
  )
}
