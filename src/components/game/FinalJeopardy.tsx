import { useEffect, useState } from 'react'
import type { FinalRound, Player } from '../../types/game'
import type { FinalJeopardyWager } from '../../types/session'
import './FinalJeopardy.css'

interface FinalJeopardyProps {
  finalRound: FinalRound
  players: Player[]
  onComplete: (updatedPlayers: Player[]) => void
  onClueRevealed?: () => void
  onAnswerRevealed?: () => void
  wagers?: FinalJeopardyWager[]
  allWagersSubmitted?: boolean
  allAnswersSubmitted?: boolean
}

type FJPhase = 'category' | 'clue' | 'scoring'

export function FinalJeopardy({ finalRound, players, onComplete, onClueRevealed, onAnswerRevealed, wagers = [], allWagersSubmitted = false, allAnswersSubmitted = false }: FinalJeopardyProps) {
  const [phase, setPhase] = useState<FJPhase>('category')
  const [answerRevealed, setAnswerRevealed] = useState(false)

  function revealAnswer() {
    if (!answerRevealed && allAnswersSubmitted) {
      setAnswerRevealed(true)
      onAnswerRevealed?.()
    }
  }

  const [markings, setMarkings] = useState<Record<string, 'correct' | 'incorrect' | null>>(() => {
    const initial: Record<string, 'correct' | 'incorrect' | null> = {}
    players.forEach(p => { initial[p.name] = null })
    return initial
  })
  const [localPlayers, setLocalPlayers] = useState<Player[]>(
    () => [...players].sort((a, b) => b.score - a.score)
  )

  // Helper: get wager amount for a player from the session wagers
  function getPlayerWager(playerName: string): number {
    const w = wagers.find(w => w.playerName.toLowerCase() === playerName.toLowerCase())
    return w?.wager ?? 0
  }

  // Keyboard handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (phase === 'category' && allWagersSubmitted) {
          setPhase('clue')
          onClueRevealed?.()
        } else if (phase === 'clue' && !answerRevealed && allAnswersSubmitted) {
            setAnswerRevealed(true)
            onAnswerRevealed?.()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, answerRevealed, allWagersSubmitted, allAnswersSubmitted, onClueRevealed, onAnswerRevealed])

  function handleMark(playerName: string, result: 'correct' | 'incorrect') {
    const wagerAmount = getPlayerWager(playerName)
    const prev = markings[playerName]

    // Reverse previous marking
    setLocalPlayers(prev_players => prev_players.map(p => {
      if (p.name !== playerName) return p
      let newScore = p.score
      let newCorrectFJ = p.correctFinalJeopardy
      let newIncorrectFJ = p.incorrectFinalJeopardy
      let newTotalEarned = p.totalEarned

      if (prev === 'correct') { newScore -= wagerAmount; newCorrectFJ = 0; newTotalEarned -= wagerAmount }
      if (prev === 'incorrect') { newScore += wagerAmount; newIncorrectFJ = 0 }
      if (result === 'correct') { newScore += wagerAmount; newCorrectFJ = 1; newTotalEarned += wagerAmount }
      if (result === 'incorrect') { newScore -= wagerAmount; newIncorrectFJ = 1 }
      return { ...p, score: newScore, correctFinalJeopardy: newCorrectFJ, incorrectFinalJeopardy: newIncorrectFJ, totalEarned: newTotalEarned }
    }))

    setMarkings(prev => ({ ...prev, [playerName]: result }))
  }

  function handleFinish() {
    onComplete(localPlayers)
  }

  const allMarked = localPlayers.every(p => markings[p.name] !== null)

  // Category phase — styled like regular round category reveal
  if (phase === 'category') {
    return (
      <div
        className="fj-category-wrapper"
        onClick={() => { if (allWagersSubmitted) { setPhase('clue'); onClueRevealed?.() } }}
      >
        <div className="fj-category-content">
          <p className="fj-category-label">Final Jeopardy</p>
          <h1 className="fj-category-name">
            {finalRound.category}
          </h1>
          {allWagersSubmitted ? (
            <p className="fj-category-hint">All wagers in — click or press Space to reveal clue</p>
          ) : (
            <p className="fj-category-hint">Waiting for all players to submit wagers…</p>
          )}
        </div>
      </div>
    )
  }

  // Clue phase (and scoring after answer revealed)
  return (
    <div className="fj-clue-overlay">
      <div className="fj-clue-header">
        <p className="fj-clue-header-text">Final Jeopardy — {finalRound.category}</p>
      </div>

      <div
        className="fj-clue-area"
        onClick={() => { if (!answerRevealed && allAnswersSubmitted) revealAnswer() }}
      >
        <div className="fj-clue-content">
          {!answerRevealed ? (
            finalRound.html ? (
              <div className="fj-clue-text" dangerouslySetInnerHTML={{ __html: finalRound.clue }} onClick={(e) => e.stopPropagation()} />
            ) : (
              <p className="fj-clue-text">{finalRound.clue}</p>
            )
          ) : (
            finalRound.html ? (
              <div className="fj-clue-answer" dangerouslySetInnerHTML={{ __html: finalRound.solution }} />
            ) : (
              <p className="fj-clue-answer">{finalRound.solution}</p>
            )
          )}
        </div>
      </div>

      {answerRevealed && (
        <div className="fj-scoring">
          <div className="fj-scoring-inner">
            {localPlayers.map(player => {
              const wagerAmount = getPlayerWager(player.name)
              const marking = markings[player.name]

              return (
                <div key={player.name} className="fj-player-card">
                  <span className="fj-player-name">{player.name}</span>
                  <span className="fj-player-wager">Wager: ${wagerAmount.toLocaleString()}</span>
                  <div className="fj-player-actions">
                    <button
                      type="button"
                      onClick={() => handleMark(player.name, 'correct')}
                      className={marking === 'correct' ? 'fj-btn-correct-active' : 'fj-btn-correct'}
                    >
                      Correct
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMark(player.name, 'incorrect')}
                      className={marking === 'incorrect' ? 'fj-btn-incorrect-active' : 'fj-btn-incorrect'}
                    >
                      Incorrect
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="fj-finish-row">
            <button
              type="button"
              onClick={handleFinish}
              disabled={!allMarked}
              className="fj-finish-btn"
            >
              Finish Game
            </button>
          </div>
        </div>
      )}

      {!answerRevealed && (
        <div className="fj-hint-bar">
          <p className="fj-hint-text">
            {allAnswersSubmitted
              ? 'All answers in — click or press Space to reveal answer'
              : 'Waiting for all players to submit answers…'}
          </p>
        </div>
      )}
    </div>
  )
}
