import type { NormalizedGame, RoundName } from '../../types/game'
import './DisplayBoard.css'

interface DisplayBoardProps {
  game: NormalizedGame
  currentRoundIndex: number
  currentRoundName: string
  chosenClues: Set<string>
}

export function DisplayBoard({
  game,
  currentRoundName,
  chosenClues,
}: DisplayBoardProps) {
  const categories = game.rounds[currentRoundName as RoundName] ?? []
  const numClues = categories[0]?.clues.length ?? 5

  function getClueKey(categoryIndex: number, clueIndex: number): string {
    return `${currentRoundName}-${categoryIndex}-${clueIndex}`
  }

  function isClueChosen(categoryIndex: number, clueIndex: number): boolean {
    return chosenClues.has(getClueKey(categoryIndex, clueIndex))
  }

  // Format round name for display (e.g., "double" -> "Double Jeopardy!")
  function formatRoundLabel(roundName: string): string {
    switch (roundName) {
      case 'single':
        return 'Jeopardy!'
      case 'double':
        return 'Double Jeopardy!'
      case 'triple':
        return 'Triple Jeopardy!'
      case 'quadruple':
        return 'Quadruple Jeopardy!'
      case 'quintuple':
        return 'Quintuple Jeopardy!'
      case 'sextuple':
        return 'Sextuple Jeopardy!'
      default:
        return roundName
    }
  }

  return (
    <div className="display-board">
      <div className="display-board__round-label">
        {formatRoundLabel(currentRoundName)}
      </div>

      <div
        className="display-board__grid"
        style={{
          gridTemplateColumns: `repeat(${categories.length}, 1fr)`,
          gridTemplateRows: `auto repeat(${numClues}, 1fr)`,
        }}
      >
        {/* Category header row */}
        {categories.map((cat, catIdx) => (
          <div
            key={`cat-${catIdx}`}
            className="display-board__category"
          >
            {cat.category}
          </div>
        ))}

        {/* Clue value cells */}
        {Array.from({ length: numClues }).map((_, clueIdx) =>
          categories.map((cat, catIdx) => {
            const chosen = isClueChosen(catIdx, clueIdx)
            const clue = cat.clues[clueIdx]

            return (
              <div
                key={`${catIdx}-${clueIdx}`}
                className={`display-board__cell ${chosen ? 'display-board__cell--chosen' : ''}`}
              >
                {!chosen && (
                  <span className="display-board__value">
                    ${clue.value}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
