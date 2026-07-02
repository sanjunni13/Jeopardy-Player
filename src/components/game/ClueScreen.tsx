import { useEffect, useState } from 'react'
import type { Clue, Player } from '../../types/game'
import './ClueScreen.css'

interface ClueScreenProps {
  clue: Clue
  categoryName: string
  players: Player[]
  wagers: Record<string, number> | null
  playerMarkings: Record<string, 'correct' | 'incorrect' | null>
  onMark: (playerName: string, result: 'correct' | 'incorrect' | null) => void
  onReturn: () => void
  ddPlayer?: string | null
  onAnswerRevealed?: () => void
}

export function ClueScreen({
  clue,
  categoryName,
  players,
  wagers,
  playerMarkings,
  onMark,
  onReturn,
  ddPlayer,
  onAnswerRevealed,
}: ClueScreenProps) {
  const [answerRevealed, setAnswerRevealed] = useState(false)

  useEffect(() => {
    if (answerRevealed && onAnswerRevealed) {
      onAnswerRevealed()
    }
  }, [answerRevealed, onAnswerRevealed])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!answerRevealed) {
          setAnswerRevealed(true)
        } else {
          onReturn()
        }
      }

      // Escape only works after answer is revealed
      if (e.key === 'Escape' && answerRevealed) {
        e.preventDefault()
        onReturn()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [answerRevealed, onReturn])

  function handleClueClick() {
    if (!answerRevealed) {
      setAnswerRevealed(true)
    } else {
      onReturn()
    }
  }

  function getPointValue(playerName: string): number {
    if (wagers && wagers[playerName] != null) {
      return wagers[playerName]
    }
    return clue.value
  }

  const scoringPlayers = ddPlayer
    ? players.filter(p => p.name === ddPlayer)
    : players

  return (
    <div className="clue-overlay">
      {/* Category + value header */}
      <div className="clue-header">
        <p className="clue-header-text">
          {categoryName} — ${clue.value}
        </p>
      </div>

      {/* Clue area */}
      <div
        className="clue-area"
        onClick={handleClueClick}
      >
        <div className="clue-content">
          {!answerRevealed ? (
            clue.html ? (
              <div className="clue-text" dangerouslySetInnerHTML={{ __html: clue.clue }} onClick={(e) => e.stopPropagation()} />
            ) : (
              <p className="clue-text">{clue.clue}</p>
            )
          ) : (
            clue.html ? (
              <div className="clue-answer" dangerouslySetInnerHTML={{ __html: clue.solution }} />
            ) : (
              <p className="clue-answer">{clue.solution}</p>
            )
          )}
        </div>
      </div>

      {/* Scoring panel — always visible */}
      <div className="clue-scoring">
        <div className="clue-scoring-inner">
          {scoringPlayers.map((player) => {
            const pointValue = getPointValue(player.name)
            const marking = playerMarkings[player.name]

            return (
              <div
                key={player.name}
                className="clue-player-card"
              >
                <span className="clue-player-name">{player.name}</span>
                <span className="clue-player-total">{player.score < 0 ? `-$${Math.abs(player.score).toLocaleString()}` : `$${player.score.toLocaleString()}`}</span>
                <span className="clue-player-value">${pointValue}</span>
                <div className="clue-player-actions">
                  <button
                    type="button"
                    onClick={() => onMark(player.name, marking === 'correct' ? null : 'correct')}
                    className={marking === 'correct' ? 'clue-btn-correct-active' : 'clue-btn-correct'}
                  >
                    Correct
                  </button>
                  <button
                    type="button"
                    onClick={() => onMark(player.name, marking === 'incorrect' ? null : 'incorrect')}
                    className={marking === 'incorrect' ? 'clue-btn-incorrect-active' : 'clue-btn-incorrect'}
                  >
                    Incorrect
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Hint or Back to Board depending on state */}
        <div className="clue-return-row">
          {answerRevealed ? (
            <button
              type="button"
              onClick={onReturn}
              className="clue-return-btn"
            >
              ← Back to Board (Esc)
            </button>
          ) : (
            <p className="clue-hint-text">
              Click or press Space to reveal answer
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
