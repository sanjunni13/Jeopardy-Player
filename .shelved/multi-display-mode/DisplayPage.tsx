import { useParams } from '@tanstack/react-router'
import { useDisplaySession } from '../../hooks/useDisplaySession'
import { DisplayBoard } from '../../components/display/DisplayBoard'
import { DisplayClue } from '../../components/display/DisplayClue'
import { DisplayScoreStrip } from '../../components/display/DisplayScoreStrip'
import { DisplayBuzzerActivity } from '../../components/display/DisplayBuzzerActivity'
import { DisplayTimer } from '../../components/display/DisplayTimer'
import { DisplayDailyDouble } from '../../components/display/DisplayDailyDouble'
import { DisplayRoundTransition } from '../../components/display/DisplayRoundTransition'
import { DisplayFinalJeopardy } from '../../components/display/DisplayFinalJeopardy'
import { DisplayGameOver } from '../../components/display/DisplayGameOver'
import { DisplayLoading } from '../../components/display/DisplayLoading'
import { DisplayError } from '../../components/display/DisplayError'
import { DisplayWaiting } from '../../components/display/DisplayWaiting'
import './DisplayPage.css'

/**
 * Route page for /display/$sessionId.
 *
 * This is a public, unauthenticated route for TV/projector displays.
 * It renders a read-only, TV-optimized view of the game in progress.
 * Phase-based rendering dispatches to the appropriate display component
 * based on the current game phase received from the host via realtime messages.
 */
export function DisplayPage() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string }
  const { displayState, connectionState, error, hostDisconnected } = useDisplaySession(sessionId)

  // Loading state while connecting to session channel and fetching game data
  if (connectionState === 'connecting') {
    return (
      <div className="display-page">
        <DisplayLoading />
      </div>
    )
  }

  // Error state (session not found, connection failed, etc.)
  if (error) {
    return (
      <div className="display-page">
        <DisplayError message={error} />
      </div>
    )
  }

  const { phase } = displayState

  return (
    <div className="display-page">
      {/* Phase-based content */}
      {phase === 'waiting' && <DisplayWaiting />}

      {phase === 'board' && displayState.game && (
        <DisplayBoard
          game={displayState.game}
          currentRoundIndex={displayState.currentRoundIndex}
          currentRoundName={displayState.currentRoundName}
          chosenClues={displayState.chosenClues}
        />
      )}

      {phase === 'clue' && displayState.activeClue && (
        <>
          {displayState.dailyDoubleWager != null ? (
            <DisplayDailyDouble
              phase="clue"
              playerName={displayState.dailyDoublePlayer}
              wager={displayState.dailyDoubleWager}
              activeClue={displayState.activeClue}
              answerRevealed={displayState.answerRevealed}
            />
          ) : (
            <DisplayClue
              activeClue={displayState.activeClue}
              answerRevealed={displayState.answerRevealed}
            />
          )}
          <DisplayBuzzerActivity
            buzzedPlayer={displayState.buzzedPlayer}
            buzzResult={displayState.buzzResult}
          />
          {displayState.timerActive && (
            <DisplayTimer
              remaining={displayState.timerRemaining}
              expired={displayState.timerRemaining === 0}
            />
          )}
        </>
      )}

      {phase === 'daily-double' && (
        <DisplayDailyDouble
          phase="daily-double"
          playerName={displayState.dailyDoublePlayer}
          wager={displayState.dailyDoubleWager}
          activeClue={displayState.activeClue}
          answerRevealed={displayState.answerRevealed}
        />
      )}

      {phase === 'daily-double-wager' && (
        <DisplayDailyDouble
          phase="daily-double-wager"
          playerName={displayState.dailyDoublePlayer}
          wager={displayState.dailyDoubleWager}
          activeClue={displayState.activeClue}
          answerRevealed={displayState.answerRevealed}
        />
      )}

      {phase === 'round-transition' && (
        <DisplayRoundTransition roundName={displayState.currentRoundName} />
      )}

      {phase === 'final-jeopardy' && displayState.fjState && (
        <DisplayFinalJeopardy fjState={displayState.fjState} />
      )}

      {phase === 'game-over' && (
        <DisplayGameOver players={displayState.players} />
      )}

      {/* Persistent score strip during board and clue phases */}
      {(phase === 'board' || phase === 'clue' || phase === 'daily-double' || phase === 'daily-double-wager') && (
        <DisplayScoreStrip players={displayState.players} />
      )}

      {/* Host disconnect indicator */}
      {hostDisconnected && (
        <div className="display-host-disconnected">
          Host may have disconnected. Try refreshing.
        </div>
      )}
    </div>
  )
}
