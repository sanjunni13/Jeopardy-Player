import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { NormalizedGame, RoundName } from '../../types/game'
import {
  getCheatSheetRounds,
  getRoundAnswers,
  getFinalJeopardyAnswer,
} from './cheatSheetUtils'

interface CheatSheetProps {
  game: NormalizedGame
  orderedRoundNames: RoundName[]
  isOpen: boolean
  onClose: () => void
}

const FINAL_JEOPARDY_TAB = 'Final Jeopardy'

/**
 * Opens the cheat sheet in a separate browser window.
 * Uses createPortal to render React content into the popup window's body.
 */
export function CheatSheet({
  game,
  orderedRoundNames,
  isOpen,
  onClose,
}: CheatSheetProps): JSX.Element | null {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const windowRef = useRef<Window | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) {
      // Close the popup if it's open
      if (windowRef.current && !windowRef.current.closed) {
        windowRef.current.close()
      }
      windowRef.current = null
      return
    }

    // If the popup is already open, don't reopen it
    if (windowRef.current && !windowRef.current.closed) {
      return
    }

    // Open a new browser window
    const popup = window.open(
      '',
      'cheatsheet',
      'width=500,height=700,resizable=yes,scrollbars=yes'
    )

    if (!popup) {
      // Popup blocked — fall back silently
      onCloseRef.current()
      return
    }

    windowRef.current = popup

    // Set up the popup document
    popup.document.title = 'Cheat Sheet'
    popup.document.body.innerHTML = ''
    popup.document.body.style.margin = '0'
    popup.document.body.style.padding = '0'
    popup.document.body.style.fontFamily =
      'system-ui, -apple-system, sans-serif'

    // Inject styles into the popup
    const style = popup.document.createElement('style')
    style.textContent = getPopupStyles()
    popup.document.head.appendChild(style)

    // Create container for React portal
    const div = popup.document.createElement('div')
    div.id = 'cheatsheet-root'
    popup.document.body.appendChild(div)

    // Use requestAnimationFrame to defer setState out of the synchronous effect body
    const rafId = requestAnimationFrame(() => {
      setContainer(div)
    })

    // Listen for the popup closing
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed)
        windowRef.current = null
        setContainer(null)
        onCloseRef.current()
      }
    }, 250)

    return () => {
      cancelAnimationFrame(rafId)
      clearInterval(checkClosed)
    }
  }, [isOpen])

  if (!isOpen || !container) return null

  return createPortal(
    <CheatSheetContent
      game={game}
      orderedRoundNames={orderedRoundNames}
    />,
    container
  )
}

/**
 * The actual cheat sheet content rendered inside the popup window.
 */
function CheatSheetContent({
  game,
  orderedRoundNames,
}: {
  game: NormalizedGame
  orderedRoundNames: RoundName[]
}) {
  const rounds = getCheatSheetRounds(game, orderedRoundNames)
  const [activeTab, setActiveTab] = useState<string>(rounds[0] ?? '')

  return (
    <div className="cheatsheet-container">
      <div className="cheatsheet-header">
        <h1 className="cheatsheet-title">Cheat Sheet</h1>
      </div>

      {/* Round Tabs */}
      <div className="cheatsheet-tab-list">
        {rounds.map((round) => (
          <button
            key={round}
            type="button"
            className={`cheatsheet-tab-trigger ${activeTab === round ? 'active' : ''}`}
            onClick={() => setActiveTab(round)}
          >
            {formatRoundName(round)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="cheatsheet-tab-content">
        {activeTab === FINAL_JEOPARDY_TAB ? (
          <FinalJeopardyContent game={game} />
        ) : (
          <RoundContent game={game} roundName={activeTab as RoundName} />
        )}
      </div>
    </div>
  )
}

function formatRoundName(round: string): string {
  switch (round) {
    case 'single': return 'Single'
    case 'double': return 'Double'
    case 'triple': return 'Triple'
    case 'quadruple': return 'Quadruple'
    case 'quintuple': return 'Quintuple'
    case 'sextuple': return 'Sextuple'
    default: return round
  }
}

/** Strips HTML tags from a string for plain-text display */
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim()
}

function RoundContent({
  game,
  roundName,
}: {
  game: NormalizedGame
  roundName: RoundName
}) {
  const categories = getRoundAnswers(game, roundName)

  if (categories.length === 0) {
    return <p className="cheatsheet-empty">No categories found.</p>
  }

  return (
    <div>
      {categories.map((cat, catIdx) => (
        <div key={catIdx} className="cheatsheet-category">
          <h3 className="cheatsheet-category-name">{cat.category}</h3>
          <ul className="cheatsheet-clue-list">
            {cat.clues.map((clue, clueIdx) => (
              <li key={clueIdx} className="cheatsheet-clue-item">
                <span className="cheatsheet-clue-value">${clue.value}</span>
                <span className={`cheatsheet-clue-solution${!clue.solution ? ' unavailable' : ''}`}>
                  {clue.solution ? stripHtml(clue.solution) : 'Answer unavailable'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function FinalJeopardyContent({ game }: { game: NormalizedGame }) {
  const final = getFinalJeopardyAnswer(game)

  return (
    <div className="cheatsheet-final">
      <h3 className="cheatsheet-final-category">{final.category}</h3>
      <p className={`cheatsheet-final-solution${!final.solution ? ' unavailable' : ''}`}>
        {final.solution ? stripHtml(final.solution) : 'Answer unavailable'}
      </p>
    </div>
  )
}

/**
 * Returns the CSS styles injected into the popup window.
 */
function getPopupStyles(): string {
  return `
    * {
      box-sizing: border-box;
    }

    body {
      background: rgb(15 23 42);
      color: rgb(226 232 240);
      overflow: hidden;
    }

    #cheatsheet-root {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .cheatsheet-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }

    .cheatsheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgb(51 65 85);
      flex-shrink: 0;
    }

    .cheatsheet-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: rgb(241 245 249);
      margin: 0;
    }

    .cheatsheet-tab-list {
      display: flex;
      gap: 0;
      padding: 0.5rem 1.25rem;
      border-bottom: 1px solid rgb(51 65 85);
      overflow-x: auto;
      flex-shrink: 0;
    }

    .cheatsheet-tab-trigger {
      padding: 0.5rem 1rem;
      border: none;
      background: transparent;
      color: rgb(148 163 184);
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      border-radius: 0.375rem;
      transition: background 0.15s, color 0.15s;
    }

    .cheatsheet-tab-trigger:hover {
      color: rgb(226 232 240);
      background: rgb(51 65 85 / 0.3);
    }

    .cheatsheet-tab-trigger.active {
      color: rgb(241 245 249);
      background: rgb(51 65 85 / 0.6);
    }

    .cheatsheet-tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 1.25rem;
    }

    .cheatsheet-category {
      margin-bottom: 1.5rem;
    }

    .cheatsheet-category:last-child {
      margin-bottom: 0;
    }

    .cheatsheet-category-name {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #CE93D8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 0.5rem 0;
    }

    .cheatsheet-clue-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }

    .cheatsheet-clue-item {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
      padding: 0.375rem 0.5rem;
      border-radius: 0.25rem;
      background: rgb(30 41 59 / 0.5);
    }

    .cheatsheet-clue-value {
      font-size: 0.75rem;
      font-weight: 700;
      color: rgb(250 204 21);
      min-width: 3.5rem;
      flex-shrink: 0;
    }

    .cheatsheet-clue-solution {
      font-size: 1rem;
      color: rgb(226 232 240);
      line-height: 1.4;
    }

    .cheatsheet-clue-solution.unavailable {
      font-style: italic;
      color: rgb(148 163 184);
    }

    .cheatsheet-final {
      text-align: center;
      padding: 2rem 1rem;
    }

    .cheatsheet-final-category {
      font-size: 0.875rem;
      font-weight: 600;
      color: #CE93D8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 1.5rem 0;
    }

    .cheatsheet-final-solution {
      font-size: 1.25rem;
      font-weight: 600;
      color: rgb(241 245 249);
      line-height: 1.5;
    }

    .cheatsheet-final-solution.unavailable {
      font-style: italic;
      color: rgb(148 163 184);
      font-weight: 400;
    }

    .cheatsheet-empty {
      color: rgb(148 163 184);
    }
  `
}
