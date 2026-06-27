import type { SessionPlayer, FinalJeopardyState } from '../../types/session'
import { allPlayersSubmitted } from '../../utils/finalJeopardyValidation'
import './FinalJeopardyHostPanel.css'

interface FinalJeopardyHostPanelProps {
  players: SessionPlayer[]
  finalJeopardyState: FinalJeopardyState
  showAnswers: boolean
}

export function FinalJeopardyHostPanel({
  players,
  finalJeopardyState,
  showAnswers,
}: FinalJeopardyHostPanelProps) {
  const { submissions } = finalJeopardyState
  const allSubmitted = allPlayersSubmitted(players, submissions)

  function getSubmission(playerName: string) {
    return submissions.find(s => s.playerName === playerName)
  }

  return (
    <div className="buzzer-host-panel" aria-label="Final Jeopardy submissions">
      <div className="buzzer-host-panel__header">
        <h2 className="buzzer-host-panel__title">Final Jeopardy</h2>
        {allSubmitted && (
          <span className="fj-all-submitted-badge" aria-label="All players have submitted">
            All Submitted ✓
          </span>
        )}
      </div>

      <div className="buzzer-host-panel__queue" aria-label="Player submissions">
        {players.length === 0 ? (
          <p className="buzzer-host-panel__queue-empty">No submissions yet...</p>
        ) : (
          <ol className="buzzer-host-panel__queue-list">
            {players.map(player => {
              const submission = getSubmission(player.name)
              const hasSubmitted = !!submission

              return (
                <li key={player.name} className="buzzer-host-panel__queue-item">
                  <div className="buzzer-host-panel__queue-item-info" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span className="buzzer-host-panel__queue-name">{player.name}</span>
                    {showAnswers ? (
                      <span style={{ fontSize: '0.8125rem', color: 'rgb(226 232 240)', textAlign: 'right' }}>
                        {submission ? submission.answer : 'No submission'}
                      </span>
                    ) : hasSubmitted ? (
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
