import { useState } from 'react'
import type { SessionPlayer, FinalJeopardyState } from '../../types/session'
import { allPlayersSubmitted } from '../../utils/finalJeopardyValidation'
import { applyScoreMark } from '../../utils/finalJeopardyScoring'
import './FinalJeopardyHostPanel.css'

interface FinalJeopardyHostPanelProps {
  players: SessionPlayer[]
  finalJeopardyState: FinalJeopardyState
  onReveal: (index: number) => void
  onMark: (playerName: string, isCorrect: boolean) => void
}

interface MarkState {
  [playerName: string]: boolean // true = correct, false = incorrect
}

export function FinalJeopardyHostPanel({
  players,
  finalJeopardyState,
  onReveal,
  onMark,
}: FinalJeopardyHostPanelProps) {
  const [marks, setMarks] = useState<MarkState>({})

  const { submissions, revealedIndex } = finalJeopardyState
  const allSubmitted = allPlayersSubmitted(players, submissions)

  function getSubmission(playerName: string) {
    return submissions.find(s => s.playerName === playerName)
  }

  function isRevealed(playerName: string): boolean {
    const submissionIndex = submissions.findIndex(s => s.playerName === playerName)
    return submissionIndex !== -1 && submissionIndex <= revealedIndex
  }

  function handleRevealNext() {
    const nextIndex = revealedIndex + 1
    onReveal(nextIndex)
  }

  function handleMark(playerName: string, isCorrect: boolean) {
    const previousMark = marks[playerName]
    const submission = getSubmission(playerName)
    if (!submission) return

    if (previousMark !== undefined && previousMark !== isCorrect) {
      // Mark change: reverse previous and apply new
      setMarks(prev => ({ ...prev, [playerName]: isCorrect }))
    } else if (previousMark === undefined) {
      // First mark
      setMarks(prev => ({ ...prev, [playerName]: isCorrect }))
    }
    // If same mark clicked again, do nothing
    if (previousMark === isCorrect) return

    onMark(playerName, isCorrect)
  }

  function getDisplayScore(player: SessionPlayer): number {
    const mark = marks[player.name]
    const submission = getSubmission(player.name)
    if (mark === undefined || !submission) return player.score

    const previousMark = marks[player.name]
    // Calculate based on original score + mark effect
    if (previousMark !== undefined) {
      return applyScoreMark(player.score, submission.wager, previousMark)
    }
    return player.score
  }

  const canRevealMore = revealedIndex < submissions.length - 1

  return (
    <div className="fj-host-panel">
      <div className="fj-host-header">
        <h3 className="fj-host-title">Final Jeopardy</h3>
        {allSubmitted && (
          <span className="fj-all-submitted-badge" aria-label="All players have submitted">
            All Submitted ✓
          </span>
        )}
      </div>

      <div className="fj-host-players">
        {players.map(player => {
          const submission = getSubmission(player.name)
          const hasSubmitted = !!submission
          const revealed = isRevealed(player.name)
          const mark = marks[player.name]
          const displayScore = getDisplayScore(player)

          return (
            <div key={player.name} className="fj-host-player-row">
              <div className="fj-host-player-info">
                <span className="fj-host-player-name">{player.name}</span>
                <span className="fj-host-player-score">
                  ${mark !== undefined ? displayScore.toLocaleString() : player.score.toLocaleString()}
                </span>
                <span
                  className={`fj-host-submission-status ${hasSubmitted ? 'fj-submitted' : 'fj-not-submitted'}`}
                  aria-label={hasSubmitted ? `${player.name} has submitted` : `${player.name} has not submitted`}
                >
                  {hasSubmitted ? '✓' : '✗'}
                </span>
              </div>

              {revealed && submission && (
                <div className="fj-host-reveal-details">
                  <div className="fj-host-wager">
                    <span className="fj-host-detail-label">Wager:</span>
                    <span className="fj-host-detail-value">${submission.wager.toLocaleString()}</span>
                  </div>
                  <div className="fj-host-answer">
                    <span className="fj-host-detail-label">Answer:</span>
                    <span className="fj-host-detail-value">{submission.answer}</span>
                  </div>
                  <div className="fj-host-mark-buttons">
                    <button
                      className={`fj-mark-btn fj-mark-correct ${mark === true ? 'fj-mark-active' : ''}`}
                      onClick={() => handleMark(player.name, true)}
                      aria-label={`Mark ${player.name} correct`}
                      aria-pressed={mark === true}
                    >
                      Correct
                    </button>
                    <button
                      className={`fj-mark-btn fj-mark-incorrect ${mark === false ? 'fj-mark-active' : ''}`}
                      onClick={() => handleMark(player.name, false)}
                      aria-label={`Mark ${player.name} incorrect`}
                      aria-pressed={mark === false}
                    >
                      Incorrect
                    </button>
                  </div>
                </div>
              )}

              {!hasSubmitted && revealedIndex >= 0 && (
                <div className="fj-host-not-submitted-label">Not submitted</div>
              )}
            </div>
          )
        })}
      </div>

      {canRevealMore && (
        <button
          className="fj-host-reveal-btn"
          onClick={handleRevealNext}
          aria-label="Reveal next player's answer"
        >
          Reveal Next
        </button>
      )}
    </div>
  )
}
