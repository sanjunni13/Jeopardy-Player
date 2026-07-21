import { useEffect, useState } from 'react'
import type { Category, ClueState, Player, RoundName } from '../../types/game'
import { Scoreboard } from './Scoreboard'
import './GameBoard.css'

interface GameBoardProps {
  categories: Category[]
  clueStates: Record<string, ClueState>
  roundName: RoundName
  players: Player[]
  onClueSelect: (categoryIndex: number, clueIndex: number) => void
  onAllRevealed?: () => void
  skipReveal?: boolean
  /** Optional custom scoreboard element to render instead of the default Scoreboard */
  customScoreboard?: React.ReactNode
}

export function GameBoard({
  categories,
  clueStates,
  roundName,
  players,
  onClueSelect,
  onAllRevealed,
  skipReveal,
  customScoreboard,
}: GameBoardProps) {
  const [revealedCount, setRevealedCount] = useState(() =>
    skipReveal ? categories.length + 1 : 0
  )

  // Fix #4: need one extra click after last category shown before transitioning
  const allRevealed = revealedCount > categories.length

  // Keyboard handler for category reveal
  useEffect(() => {
    if (allRevealed) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setRevealedCount(prev => prev + 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allRevealed])

  // Notify parent when all categories are revealed
  useEffect(() => {
    if (allRevealed && onAllRevealed) {
      onAllRevealed()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRevealed])

  function handleRevealClick() {
    if (!allRevealed) {
      setRevealedCount(prev => prev + 1)
    }
  }

  function getClueStateKey(categoryIndex: number, clueIndex: number): string {
    return `${roundName}-${categoryIndex}-${clueIndex}`
  }

  function isClueChosen(categoryIndex: number, clueIndex: number): boolean {
    const key = getClueStateKey(categoryIndex, clueIndex)
    return clueStates[key]?.chosen ?? false
  }

  // Category reveal mode
  if (!allRevealed) {
    return (
      <div className="board-reveal-wrapper" onClick={handleRevealClick}>
        <div className="board-reveal-inner">
          <div className="board-reveal-center">
            <div className="board-reveal-content">
              {revealedCount > 0 && (
                <p className="board-reveal-counter">
                  Category {revealedCount} of {categories.length}
                </p>
              )}

              {revealedCount > 0 ? (
                <h1 className="board-reveal-category">
                  {categories[revealedCount - 1].category}
                </h1>
              ) : (
                <h1 className="board-reveal-initial-message">
                  Click or press Space to begin
                </h1>
              )}

              {revealedCount > 0 && (
                <p className="board-reveal-hint">
                  {revealedCount < categories.length
                    ? 'Click or press Space to reveal the next category'
                    : 'Click or press Space to start the round'}
                </p>
              )}
            </div>
          </div>

          {/* Scoreboard during reveal */}
          <div className="board-reveal-scoreboard">
            {customScoreboard ?? <Scoreboard players={players} />}
          </div>
        </div>
      </div>
    )
  }

  // Full board mode
  const numClues = categories[0]?.clues.length ?? 5

  return (
    <div className="board-page">
      <div className="board-container">
        {/* Board grid */}
        <div className="board-grid">
          <table className="board-table">
            <thead>
              <tr>
                {categories.map((cat, i) => (
                  <th
                    key={i}
                    className="board-category-header"
                  >
                    {cat.category}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: numClues }).map((_, clueIdx) => (
                <tr key={clueIdx}>
                  {categories.map((cat, catIdx) => {
                    const chosen = isClueChosen(catIdx, clueIdx)
                    const clue = cat.clues[clueIdx]

                    if (chosen) {
                      return (
                        <td
                          key={catIdx}
                          className="board-cell-chosen"
                        />
                      )
                    }

                    return (
                      <td
                        key={catIdx}
                        onClick={() => onClueSelect(catIdx, clueIdx)}
                        className="board-cell-active"
                      >
                        <span className="board-cell-value">
                          ${clue.value}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Scoreboard */}
        <div className="board-scoreboard">
          {customScoreboard ?? <Scoreboard players={players} />}
        </div>
      </div>
    </div>
  )
}
