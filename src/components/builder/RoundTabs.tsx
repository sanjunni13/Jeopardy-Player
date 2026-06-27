import { useRef } from 'react'
import { generateTabLabels, getNextFocusIndex } from './roundTabsHelpers'

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface RoundTabsProps {
  totalRounds: number
  activeTab: number
  onTabChange: (index: number) => void
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function RoundTabs({ totalRounds, activeTab, onTabChange }: RoundTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const labels = generateTabLabels(totalRounds)
  const tabCount = labels.length

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    if (target.role !== 'tab') return

    const currentIndex = Number(target.dataset.index)
    let nextIndex: number | null = null

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      nextIndex = getNextFocusIndex(currentIndex, 1, tabCount)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      nextIndex = getNextFocusIndex(currentIndex, -1, tabCount)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTabChange(currentIndex)
      return
    }

    if (nextIndex !== null) {
      tabRefs.current[nextIndex]?.focus()
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Round navigation"
      className="flex border-b border-slate-800 mb-6"
      onKeyDown={handleKeyDown}
    >
      {labels.map((label, index) => {
        const isActive = index === activeTab
        return (
          <button
            key={index}
            ref={(el) => { tabRefs.current[index] = el }}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-index={index}
            onClick={() => onTabChange(index)}
            className={`
              px-4 py-2 text-sm font-medium bg-transparent border-0 border-b-2 cursor-pointer transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-ring
              ${
                isActive
                  ? 'text-slate-100 border-b-[#6A1B9A]'
                  : 'text-slate-400 border-b-transparent hover:text-slate-200'
              }
            `}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
