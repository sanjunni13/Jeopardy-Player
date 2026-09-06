import { useState } from 'react'
import type { ReactNode } from 'react'
import './CollapsiblePlayerSection.css'

interface CollapsiblePlayerSectionProps {
  /** Player name; doubles as the toggle's accessible name — Requirement 9.12 */
  playerName: string
  /** Content rendered only while expanded — Requirements 9.4, 9.6 */
  children: ReactNode
}

/**
 * A per-player disclosure section for the analytics breakdown.
 *
 * Expanded state lives inside each instance, so sections never affect one
 * another and any number may be open at once (Requirement 9.11). A native
 * `<button>` gives `Tab` reachability, `Enter`/`Space` activation, and focus
 * retention with no key handlers (Requirements 9.5, 9.6, 9.12).
 */
export function CollapsiblePlayerSection({ playerName, children }: CollapsiblePlayerSectionProps) {
  // Collapsed on first render — Requirement 9.4
  const [open, setOpen] = useState(false)

  return (
    <div className="collapsible-player-section">
      <button
        type="button"
        className="collapsible-player-section__toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="collapsible-player-section__name">{playerName}</span>
        {/* aria-hidden keeps the player name as the toggle's accessible name — Requirement 9.12 */}
        <span className="collapsible-player-section__chevron" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Content is absent from the page while collapsed — Requirements 9.4, 9.6 */}
      {open && <div className="collapsible-player-section__content">{children}</div>}
    </div>
  )
}
