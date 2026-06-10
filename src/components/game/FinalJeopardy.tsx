import { useEffect, useState } from 'react'
import type { FinalRound, Player } from '../../types/game'
import './FinalJeopardy.css'

interface FinalJeopardyProps {
  finalRound: FinalRound
  players: Player[]
  onComplete: (updatedPlayers: Player[]) => void
}

type FJPhase = 'category' | 'wager' | 'clue' | 'scoring'

export function FinalJeopardy({ finalRound, players, onComplete }: FinalJeopardyProps) {
  const [phase, setPhase] = useState<FJPhase>('category')
  const [wagers, setWagers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    players.forEach(p => { initial[p.name] = '' })
    return initial
  })
  const [wagerErrors, setWagerErrors] = useState<Record<string, string>>({})
  const [answerRevealed, setAnswerRevealed] = useState(false)
  const [markings, setMarkings] = useState<Record<string, 'correct' | 'incorrect' | null>>(() => {
    const initial: Record<string, 'correct' | 'incorrect' | null> = {}
    players.forEach(p => { initial[p.name] = null })
    return initial
  })
  const [localPlayers, setLocalPlayers] = useState<Player[]>(players)

  // Keyboard handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (phase === 'category') {
          setPhase('wager')
        } else if (phase === 'clue' && !answerRevealed) {
          setAnswerRevealed(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase, answerRevealed])

  function getMaxWager(player: Player): number {
    return player.score > 0 ? player.score : 1000
  }

  function validateWagers(): boolean {
    const errors: Record<string, string> = {}
    let valid = true

    for (const player of localPlayers) {
      const wagerStr = wagers[player.name]
      const wagerNum = Number(wagerStr)

      if (!wagerStr || isNaN(wagerNum)) {
        errors[player.name] = 'Enter a valid number.'
        valid = false
        continue
      }

      const maxWager = getMaxWager(player)
      const minWager = 0

      if (wagerNum < minWager || wagerNum > maxWager) {
        if (player.score <= 0) {
          errors[player.name] = `Wager must be between 0 and $1,000.`
        } else {
          errors[player.name] = `Wager must be between $0 and $${maxWager.toLocaleString()}.`
        }
        valid = false
      }
    }

    setWagerErrors(errors)
    return valid
  }

  function handleRevealClue() {
    if (validateWagers()) {
      setPhase('clue')
    }
  }

  function handleMark(playerName: string, result: 'correct' | 'incorrect') {
    const wagerAmount = Number(wagers[playerName])
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

  const allWagersEntered = localPlayers.every(p => {
    const v = wagers[p.name]
    return v !== '' && !isNaN(Number(v))
  })

  const allMarked = localPlayers.every(p => markings[p.name] !== null)

  // Category phase
  if (phase === 'category') {
    return (
      <div
        className="fj-category-wrapper"
        onClick={() => setPhase('wager')}
      >
        <div className="fj-category-content">
          <p className="fj-category-label">Final Jeopardy</p>
          <h1 className="fj-category-name">
            {finalRound.category}
          </h1>
          <p className="fj-category-hint">Click or press Space to continue</p>
        </div>
      </div>
    )
  }

  // Wager phase
  if (phase === 'wager') {
    return (
      <div className="fj-wager-page">
        <div className="fj-wager-card">
          <h2 className="fj-wager-title">Final Jeopardy Wagers</h2>
          <p className="fj-wager-subtitle">
            Category: <span className="fj-wager-category-name">{finalRound.category}</span>
          </p>

          <div className="fj-wager-list">
            {localPlayers.map(player => (
              <div key={player.name}>
                <div className="fj-wager-player-header">
                  <label className="fj-wager-player-label">
                    {player.name}
                  </label>
                  <span className="fj-wager-player-info">
                    Score: ${player.score.toLocaleString()} • Max: ${getMaxWager(player).toLocaleString()}
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={getMaxWager(player)}
                  value={wagers[player.name]}
                  onChange={e => {
                    setWagers(prev => ({ ...prev, [player.name]: e.target.value }))
                    if (wagerErrors[player.name]) {
                      setWagerErrors(prev => { const next = { ...prev }; delete next[player.name]; return next })
                    }
                  }}
                  className="fj-wager-input"
                />
                {wagerErrors[player.name] && (
                  <p className="fj-wager-error">{wagerErrors[player.name]}</p>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleRevealClue}
            disabled={!allWagersEntered}
            className="fj-reveal-btn"
          >
            Reveal Clue
          </button>
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
        onClick={() => { if (!answerRevealed) setAnswerRevealed(true) }}
      >
        <div className="fj-clue-content">
          {!answerRevealed ? (
            <p className="fj-clue-text">
              {finalRound.html ? (
                <span dangerouslySetInnerHTML={{ __html: finalRound.clue }} />
              ) : (
                finalRound.clue
              )}
            </p>
          ) : (
            <p className="fj-clue-answer">
              {finalRound.html ? (
                <span dangerouslySetInnerHTML={{ __html: finalRound.solution }} />
              ) : (
                finalRound.solution
              )}
            </p>
          )}
        </div>
      </div>

      {answerRevealed && (
        <div className="fj-scoring">
          <div className="fj-scoring-inner">
            {localPlayers.map(player => {
              const wagerAmount = Number(wagers[player.name])
              const marking = markings[player.name]

              return (
                <div key={player.name} className="fj-player-row">
                  <div className="fj-player-info">
                    <span className="fj-player-name">{player.name}</span>
                    <span className="fj-player-wager">Wager: ${wagerAmount}</span>
                  </div>
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
            Click or press Space to reveal answer
          </p>
        </div>
      )}
    </div>
  )
}
