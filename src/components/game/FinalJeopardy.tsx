import { useEffect, useState } from 'react'
import type { FinalRound, Player } from '../../types/game'
import type { FinalJeopardyWager, FinalJeopardySubmission } from '../../types/session'
import { Component as EtherealShadows } from '../ui/framer-motion-animations/etherealShadows'
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
  // Co-op mode props
  coopMode?: boolean
  teamPool?: number
  onCoopWagerSubmit?: (wager: number) => void
  onCoopMarkAnswer?: (result: 'correct' | 'incorrect') => void
  submissions?: FinalJeopardySubmission[]
}

type FJPhase = 'category' | 'clue' | 'scoring'

export function FinalJeopardy({ finalRound, players, onComplete, onClueRevealed, onAnswerRevealed, wagers = [], allWagersSubmitted = false, allAnswersSubmitted = false, coopMode = false, teamPool = 0, onCoopWagerSubmit, onCoopMarkAnswer, submissions = [] }: FinalJeopardyProps) {
  const [phase, setPhase] = useState<FJPhase>('category')
  const [answerRevealed, setAnswerRevealed] = useState(false)

  // Co-op mode state
  const [coopWager, setCoopWager] = useState<string>('')
  const [coopWagerSubmitted, setCoopWagerSubmitted] = useState(false)
  const [coopWagerError, setCoopWagerError] = useState<string>('')
  const [coopMarking, setCoopMarking] = useState<'correct' | 'incorrect' | null>(null)

  // Co-op wager constraints
  const coopMaxWager = teamPool > 0 ? Math.max(teamPool, 1000) : 1000
  const coopMinWager = teamPool > 0 ? 1 : 0

  function revealAnswer() {
    if (!answerRevealed && allAnswersSubmitted) {
      setAnswerRevealed(true)
      onAnswerRevealed?.()
    }
  }

  // Co-op wager validation and submission
  function handleCoopWagerChange(value: string) {
    // Only allow digits
    if (value !== '' && !/^\d+$/.test(value)) return
    setCoopWager(value)
    // Clear error on change
    if (coopWagerError) {
      const num = parseInt(value, 10)
      if (!isNaN(num) && num >= coopMinWager && num <= coopMaxWager) {
        setCoopWagerError('')
      }
    }
  }

  function handleCoopWagerSubmit() {
    const num = parseInt(coopWager, 10)
    if (isNaN(num) || num < coopMinWager || num > coopMaxWager) {
      setCoopWagerError(`Wager must be between $${coopMinWager.toLocaleString()} and $${coopMaxWager.toLocaleString()}`)
      return
    }
    setCoopWagerSubmitted(true)
    onCoopWagerSubmit?.(num)
  }

  function handleCoopMark(result: 'correct' | 'incorrect') {
    setCoopMarking(result)
    onCoopMarkAnswer?.(result)
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
        if (coopMode) {
          // In co-op: category → clue after wager submitted, clue → reveal answer after answers in
          if (phase === 'category' && coopWagerSubmitted) {
            setPhase('clue')
            onClueRevealed?.()
          } else if (phase === 'clue' && !answerRevealed && allAnswersSubmitted) {
            setAnswerRevealed(true)
            onAnswerRevealed?.()
          }
        } else {
          if (phase === 'category' && allWagersSubmitted) {
            setPhase('clue')
            onClueRevealed?.()
          } else if (phase === 'clue' && !answerRevealed && allAnswersSubmitted) {
              setAnswerRevealed(true)
              onAnswerRevealed?.()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, answerRevealed, allWagersSubmitted, allAnswersSubmitted, onClueRevealed, onAnswerRevealed, coopMode, coopWagerSubmitted])

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

  // ─── Co-op Mode Rendering ─────────────────────────────────────────────────────
  if (coopMode) {
    // Category phase with team wager entry
    if (phase === 'category') {
      return (
        <div className="fj-category-wrapper" onClick={() => { if (coopWagerSubmitted) { setPhase('clue'); onClueRevealed?.() } }}>
          <div className="fj-category-bg">
            <EtherealShadows
              color="rgba(0, 22, 153, 1)"
              animation={{ scale: 100, speed: 90 }}
              noise={{ opacity: 1, scale: 1.2 }}
              sizing="fill"
            />
          </div>
          <div className="fj-category-content">
            <p className="fj-category-label">Final Jeopardy Category</p>
            <h1 className="fj-category-name">{finalRound.category}</h1>

            {!coopWagerSubmitted ? (
              <div className="fj-coop-wager-section" onClick={(e) => e.stopPropagation()}>
                <p className="fj-coop-pool-display">
                  Team Pool: <strong>${teamPool.toLocaleString()}</strong>
                </p>
                <div className="fj-coop-wager-form">
                  <label className="fj-coop-wager-label" htmlFor="coop-wager-input">
                    Team Wager (max ${coopMaxWager.toLocaleString()})
                  </label>
                  <input
                    id="coop-wager-input"
                    type="text"
                    inputMode="numeric"
                    className="fj-wager-input"
                    value={coopWager}
                    onChange={(e) => handleCoopWagerChange(e.target.value)}
                    placeholder={`$${coopMinWager} – $${coopMaxWager.toLocaleString()}`}
                    aria-invalid={!!coopWagerError}
                    aria-describedby={coopWagerError ? 'coop-wager-error' : undefined}
                  />
                  {coopWagerError && (
                    <p id="coop-wager-error" className="fj-wager-error">{coopWagerError}</p>
                  )}
                  <button
                    type="button"
                    className="fj-reveal-btn"
                    onClick={handleCoopWagerSubmit}
                    disabled={coopWager === ''}
                  >
                    Submit Team Wager
                  </button>
                </div>
              </div>
            ) : (
              <p className="fj-category-hint">Wager locked in — click or press Space to reveal clue</p>
            )}
          </div>
        </div>
      )
    }

    // Clue phase and scoring (co-op variant)
    return (
      <div className="fj-clue-overlay">
        <div className="fj-clue-header">
          <p className="fj-clue-header-text">Final Jeopardy — {finalRound.category}</p>
        </div>

        <div
          className="fj-clue-area"
          onClick={() => { if (!answerRevealed && allAnswersSubmitted) { setAnswerRevealed(true); onAnswerRevealed?.() } }}
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
            <div className="fj-coop-scoring-inner">
              {/* Display all player-submitted answers for host review */}
              {submissions.length > 0 && (
                <div className="fj-coop-answers-section">
                  <h3 className="fj-coop-answers-title">Team Answers</h3>
                  <div className="fj-coop-answers-list">
                    {submissions.map(s => (
                      <div key={s.playerName} className="fj-coop-answer-item">
                        <span className="fj-coop-answer-player">{s.playerName}</span>
                        <span className="fj-coop-answer-text">{s.answer}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Team marking buttons */}
              <div className="fj-coop-mark-section">
                <p className="fj-coop-mark-label">Team Result:</p>
                <div className="fj-player-actions">
                  <button
                    type="button"
                    onClick={() => handleCoopMark('correct')}
                    className={coopMarking === 'correct' ? 'fj-btn-correct-active' : 'fj-btn-correct'}
                  >
                    Correct
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCoopMark('incorrect')}
                    className={coopMarking === 'incorrect' ? 'fj-btn-incorrect-active' : 'fj-btn-incorrect'}
                  >
                    Incorrect
                  </button>
                </div>
              </div>

              <div className="fj-finish-row">
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={coopMarking === null}
                  className="fj-finish-btn"
                >
                  Finish Game
                </button>
              </div>
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

  // ─── Competitive Mode Rendering (existing behavior) ────────────────────────────

  // Category phase — styled like regular round category reveal
  if (phase === 'category') {
    return (
      <div
        className="fj-category-wrapper"
        onClick={() => { if (allWagersSubmitted) { setPhase('clue'); onClueRevealed?.() } }}
      >
        <div className="fj-category-bg">
          <EtherealShadows
            color="rgba(0, 22, 153, 1)"
            animation={{ scale: 100, speed: 90 }}
            noise={{ opacity: 1, scale: 1.2 }}
            sizing="fill"
          />
        </div>
        <div className="fj-category-content">
          <p className="fj-category-label">Final Jeopardy Category</p>
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
