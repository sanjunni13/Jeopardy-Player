import { useState } from 'react'
import type { SessionPlayer, FinalJeopardyState } from '../../types/session'
import { allPlayersSubmitted } from '../../utils/finalJeopardyValidation'
import './FinalJeopardyHostPanel.css'

interface FinalJeopardyHostPanelProps {
  players: SessionPlayer[]
  finalJeopardyState: FinalJeopardyState
  showAnswers: boolean
  onlinePlayers?: string[]
  coopMode?: boolean
  onCoopMarkAnswer?: (result: 'correct' | 'incorrect') => void
}

export function FinalJeopardyHostPanel({
  players,
  finalJeopardyState,
  showAnswers,
  onlinePlayers,
  coopMode = false,
  onCoopMarkAnswer,
}: FinalJeopardyHostPanelProps) {
  const { wagers = [], submissions } = finalJeopardyState
  const allSubmitted = allPlayersSubmitted(players, submissions)
  const allWagersIn = wagers.length >= players.length

  // Co-op team judgment state
  const [coopMarking, setCoopMarking] = useState<'correct' | 'incorrect' | null>(null)

  function getSubmission(playerName: string) {
    return submissions.find(s => s.playerName === playerName)
  }

  function getWager(playerName: string): number | null {
    const w = wagers.find(w => w.playerName.toLowerCase() === playerName.toLowerCase())
    return w?.wager ?? null
  }

  function isOnline(playerName: string): boolean {
    if (!onlinePlayers) return true
    return onlinePlayers.some(n => n.toLowerCase() === playerName.toLowerCase())
  }

  function handleCoopMark(result: 'correct' | 'incorrect') {
    setCoopMarking(result)
    onCoopMarkAnswer?.(result)
  }

  // Determine what phase we're showing
  const showWagerPhase = !allWagersIn
  const title = showWagerPhase ? 'Final Jeopardy — Wagers' : 'Final Jeopardy'

  // ─── Co-op Mode: Team Answers view ────────────────────────────────────────
  if (coopMode && showAnswers) {
    const submittedAnswers = submissions.filter(s => s.answer)
    return (
      <div className="buzzer-host-panel" aria-label="Final Jeopardy team answers">
        <div className="buzzer-host-panel__header">
          <h2 className="buzzer-host-panel__title">Final Jeopardy — Team Answers</h2>
          {allSubmitted && (
            <span className="fj-all-submitted-badge" aria-label="All players have submitted">
              All Submitted ✓
            </span>
          )}
        </div>

        <div className="fj-coop-answers" aria-label="Team submitted answers">
          {submittedAnswers.length === 0 ? (
            <p className="fj-coop-no-answers">No answers submitted yet…</p>
          ) : (
            <ul className="fj-coop-answer-list">
              {submittedAnswers.map(submission => (
                <li key={submission.playerName} className="fj-coop-answer-item">
                  <span className="fj-coop-answer-player">{submission.playerName}</span>
                  <span className="fj-coop-answer-text">"{submission.answer}"</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="fj-coop-judgment" aria-label="Team judgment">
          <p className="fj-coop-judgment-label">Team Judgment</p>
          <div className="fj-host-mark-buttons">
            <button
              type="button"
              className={`fj-mark-btn fj-mark-correct${coopMarking === 'correct' ? ' fj-mark-active' : ''}`}
              onClick={() => handleCoopMark('correct')}
            >
              Correct
            </button>
            <button
              type="button"
              className={`fj-mark-btn fj-mark-incorrect${coopMarking === 'incorrect' ? ' fj-mark-active' : ''}`}
              onClick={() => handleCoopMark('incorrect')}
            >
              Incorrect
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Standard (competitive) mode or pre-answer reveal ─────────────────────
  return (
    <div className="buzzer-host-panel" aria-label="Final Jeopardy submissions">
      <div className="buzzer-host-panel__header">
        <h2 className="buzzer-host-panel__title">{title}</h2>
        {showWagerPhase && allWagersIn && (
          <span className="fj-all-submitted-badge" aria-label="All wagers submitted">
            All Submitted ✓
          </span>
        )}
        {!showWagerPhase && allSubmitted && (
          <span className="fj-all-submitted-badge" aria-label="All players have submitted">
            All Submitted ✓
          </span>
        )}
      </div>

      <div className="buzzer-host-panel__queue" aria-label="Player submissions">
        {players.length === 0 ? (
          <p className="buzzer-host-panel__queue-empty">No players connected…</p>
        ) : (
          <ol className="buzzer-host-panel__queue-list">
            {players.map(player => {
              const submission = getSubmission(player.name)
              const wagerAmount = getWager(player.name)
              const hasSubmittedAnswer = !!submission
              const hasSubmittedWager = wagerAmount !== null

              return (
                <li key={player.name} className="buzzer-host-panel__queue-item">
                  <div className="buzzer-host-panel__queue-item-info" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span className="buzzer-host-panel__queue-name" style={{ display: 'flex', alignItems: 'center' }}>
                      <span
                        style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6, backgroundColor: isOnline(player.name) ? '#22c55e' : '#ef4444' }}
                        aria-label={isOnline(player.name) ? 'Online' : 'Offline'}
                      />
                      {player.name}
                    </span>
                    {showAnswers ? (
                      <span style={{ fontSize: '0.8125rem', color: 'rgb(226 232 240)', textAlign: 'right' }}>
                        {submission
                          ? `$${wagerAmount?.toLocaleString() ?? '?'} — ${submission.answer}`
                          : 'No submission'}
                      </span>
                    ) : showWagerPhase ? (
                      hasSubmittedWager ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8125rem', color: 'rgb(34 197 94)' }}>
                          Wager submitted ✓
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.8125rem', color: 'rgb(148 163 184)', fontStyle: 'italic' }}>
                          Waiting…
                        </span>
                      )
                    ) : hasSubmittedAnswer ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8125rem', color: 'rgb(34 197 94)' }}>
                        Submitted! <span style={{ fontSize: '1rem' }}>✓</span>
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.8125rem', color: 'rgb(148 163 184)', fontStyle: 'italic' }}>
                        Waiting...
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
