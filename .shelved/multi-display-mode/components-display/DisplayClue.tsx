import type { DisplayActiveClue } from '../../types/display'
import './DisplayClue.css'

interface DisplayClueProps {
  activeClue: DisplayActiveClue
  answerRevealed: boolean
}

export function DisplayClue({ activeClue, answerRevealed }: DisplayClueProps) {
  const { category, value, clueText, html, solution } = activeClue

  return (
    <div className="display-clue">
      <div className="display-clue__header">
        <span className="display-clue__category">{category}</span>
        <span className="display-clue__value">${value}</span>
      </div>

      {html ? (
        <div
          className="display-clue__text"
          dangerouslySetInnerHTML={{ __html: clueText }}
        />
      ) : (
        <div className="display-clue__text">{clueText}</div>
      )}

      {answerRevealed && (
        <div className="display-clue__solution">
          <span className="display-clue__solution-prefix">A:</span>
          {solution}
        </div>
      )}
    </div>
  )
}
