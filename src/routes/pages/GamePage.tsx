import { useEffect, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { supabase } from '../../utils/supabase'
import { normalizeGame } from '../../utils/gameNormalizer'
import type {
  ActiveClue,
  ClueState,
  GamePhase,
  GameSession,
  NormalizedGame,
  Player,
  RoundName,
} from '../../types/game'
import { PlayerEntry } from '../../components/game/PlayerEntry'
import { GameBoard } from '../../components/game/GameBoard'
import { ClueScreen } from '../../components/game/ClueScreen'
import { DailyDoubleScreen } from '../../components/game/DailyDoubleScreen'
import { DailyDoubleWager } from '../../components/game/DailyDoubleWager'
import { FinalJeopardy } from '../../components/game/FinalJeopardy'
import { RoundTransition } from '../../components/game/RoundTransition'
import { GameOver } from '../../components/game/GameOver'

const ROUND_LABELS: Record<RoundName | 'final', string> = {
  single: 'Jeopardy!',
  double: 'Double Jeopardy!',
  triple: 'Triple Jeopardy!',
  quadruple: 'Quadruple Jeopardy!',
  quintuple: 'Quintuple Jeopardy!',
  sextuple: 'Sextuple Jeopardy!',
  final: 'Final Jeopardy!',
}

const ROUND_ORDER: RoundName[] = ['single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple']

export function GamePage() {
  const { gameId } = useParams({ strict: false }) as { gameId: string }
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [game, setGame] = useState<NormalizedGame | null>(null)
  const [session, setSession] = useState<GameSession | null>(null)
  const [phase, setPhase] = useState<GamePhase>('player-entry')
  const [activeClue, setActiveClue] = useState<ActiveClue | null>(null)

  // Fix #11: Track whether categories have been revealed per round
  const [categoriesRevealed, setCategoriesRevealed] = useState<Record<number, boolean>>({})

  // Fix #7: Daily Double state
  const [ddSelectedPlayer, setDdSelectedPlayer] = useState<string | null>(null)
  const [ddWager, setDdWager] = useState<number | null>(null)

  // Load game from Supabase Storage on mount
  useEffect(() => {
    async function loadGame() {
      try {
        // Get game name and creator from games table
        const { data: gameRow, error: fetchErr } = await supabase
          .from('games')
          .select('game_name, created_by')
          .eq('id', gameId)
          .single()

        if (fetchErr || !gameRow) {
          setError('Game not found.')
          setLoading(false)
          return
        }

        // Get current user to verify authentication
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError('Not authenticated.')
          setLoading(false)
          return
        }

        // Build storage path: if created_by is set, game is under that folder; otherwise it's at the root
        const storagePath = gameRow.created_by
          ? `${gameRow.created_by}/${gameRow.game_name}.json`
          : `${gameRow.game_name}.json`
        const { data: fileData, error: downloadErr } = await supabase.storage
          .from('games')
          .download(storagePath)

        if (downloadErr || !fileData) {
          setError('Could not load game file.')
          setLoading(false)
          return
        }

        const text = await fileData.text()
        const raw = JSON.parse(text)

        if (raw.rounds && raw.final && typeof raw.totalRounds === 'number') {
          setGame(raw as NormalizedGame)
        } else {
          const gameObj = raw.game ?? raw
          const result = normalizeGame({ game: gameObj })
          if (!result.ok) {
            setError(result.error)
            setLoading(false)
            return
          }
          setGame(result.game)
        }

        setLoading(false)
      } catch {
        setError('Failed to load game.')
        setLoading(false)
      }
    }

    loadGame()
  }, [gameId])

  // ─── Phase transition handlers ───────────────────────────────────────────

  function handlePlay(players: Player[]) {
    if (!game) return

    const orderedRoundNames = ROUND_ORDER.filter(name => name in game.rounds)

    // Build initial clue states
    const clueStates: Record<string, ClueState> = {}
    for (const roundName of orderedRoundNames) {
      const categories = game.rounds[roundName]
      if (!categories) continue
      for (let catIdx = 0; catIdx < categories.length; catIdx++) {
        for (let clueIdx = 0; clueIdx < categories[catIdx].clues.length; clueIdx++) {
          const key = `${roundName}-${catIdx}-${clueIdx}`
          const playerMarkings: Record<string, 'correct' | 'incorrect' | null> = {}
          players.forEach(p => { playerMarkings[p.name] = null })
          clueStates[key] = { chosen: false, playerMarkings }
        }
      }
    }

    setSession({
      game,
      gameId,
      players,
      currentRoundIndex: 0,
      orderedRoundNames,
      clueStates,
    })
    setPhase('category-reveal')
  }

  function handleClueSelect(categoryIndex: number, clueIndex: number) {
    if (!session) return

    const roundName = session.orderedRoundNames[session.currentRoundIndex]
    const categories = session.game.rounds[roundName]
    const clue = categories[categoryIndex].clues[clueIndex]

    setActiveClue({ roundName, categoryIndex, clueIndex })

    if (clue.dailyDouble) {
      setDdSelectedPlayer(null)
      setDdWager(null)
      setPhase('daily-double')
    } else {
      setPhase('clue')
    }
  }

  // Fix #7: DD player selection
  function handleDDPlayerSelect(playerName: string) {
    setDdSelectedPlayer(playerName)
    setPhase('daily-double-wager')
  }

  // Fix #7: DD wager submission
  function handleDDWagerSubmit(wager: number) {
    setDdWager(wager)
    setPhase('clue')
  }

  function handleMark(playerName: string, result: 'correct' | 'incorrect' | null) {
    if (!session || !activeClue) return

    const key = `${activeClue.roundName}-${activeClue.categoryIndex}-${activeClue.clueIndex}`
    const clueState = session.clueStates[key]
    const clue = session.game.rounds[activeClue.roundName][activeClue.categoryIndex].clues[activeClue.clueIndex]

    // Use DD wager if applicable, otherwise clue value
    let pointValue = clue.value
    if (clue.dailyDouble && ddWager != null && playerName === ddSelectedPlayer) {
      pointValue = ddWager
    }

    const prev = clueState.playerMarkings[playerName]

    // Update player score with reversal logic
    const updatedPlayers = session.players.map(p => {
      if (p.name !== playerName) return p

      let newScore = p.score
      let newCorrect = p.correctCount
      let newIncorrect = p.incorrectCount
      let newCorrectDD = p.correctDailyDoubles
      let newIncorrectDD = p.incorrectDailyDoubles
      let newTotalEarned = p.totalEarned

      // Reverse previous marking
      if (prev === 'correct') { newScore -= pointValue; newCorrect--; newTotalEarned -= pointValue }
      if (prev === 'incorrect') { newScore += pointValue; newIncorrect-- }

      // Apply new marking (null means unmark — only reverse was needed)
      if (result === 'correct') { newScore += pointValue; newCorrect++; newTotalEarned += pointValue }
      if (result === 'incorrect') { newScore -= pointValue; newIncorrect++ }

      // Track Daily Double stats
      if (clue.dailyDouble && playerName === ddSelectedPlayer) {
        if (prev === 'correct') newCorrectDD--
        if (prev === 'incorrect') newIncorrectDD--
        if (result === 'correct') newCorrectDD++
        if (result === 'incorrect') newIncorrectDD++
      }

      return { ...p, score: newScore, correctCount: newCorrect, incorrectCount: newIncorrect, correctDailyDoubles: newCorrectDD, incorrectDailyDoubles: newIncorrectDD, totalEarned: newTotalEarned }
    })

    // Update clue state markings
    const updatedClueStates = {
      ...session.clueStates,
      [key]: {
        ...clueState,
        playerMarkings: { ...clueState.playerMarkings, [playerName]: result },
      },
    }

    setSession({
      ...session,
      players: updatedPlayers,
      clueStates: updatedClueStates,
    })
  }

  function handleReturnToBoard() {
    if (!session || !activeClue) return

    const key = `${activeClue.roundName}-${activeClue.categoryIndex}-${activeClue.clueIndex}`

    // Mark clue as chosen
    const updatedClueStates = {
      ...session.clueStates,
      [key]: { ...session.clueStates[key], chosen: true },
    }

    const updatedSession = { ...session, clueStates: updatedClueStates }
    setSession(updatedSession)
    setActiveClue(null)
    setDdSelectedPlayer(null)
    setDdWager(null)

    // Check if all clues in current round are chosen
    const roundName = session.orderedRoundNames[session.currentRoundIndex]
    const categories = session.game.rounds[roundName]
    const allChosen = categories.every((cat, catIdx) =>
      cat.clues.every((_, clueIdx) => {
        const k = `${roundName}-${catIdx}-${clueIdx}`
        return updatedClueStates[k]?.chosen ?? false
      })
    )

    if (allChosen) {
      setPhase('round-transition')
    } else {
      setPhase('board')
    }
  }

  function handleContinueRound() {
    if (!session) return

    const nextIndex = session.currentRoundIndex + 1

    if (nextIndex >= session.orderedRoundNames.length) {
      setPhase('final-jeopardy')
    } else {
      setSession({ ...session, currentRoundIndex: nextIndex })
      setPhase('category-reveal')
    }
  }

  function handleFJComplete(updatedPlayers: Player[]) {
    if (!session) return
    setSession({ ...session, players: updatedPlayers })
    setPhase('game-over')
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <svg
          className="animate-spin h-8 w-8 text-slate-300"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <p className="text-slate-300">Loading game…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-800 bg-slate-900/95 p-10 shadow-2xl">
          <p className="text-rose-400 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => navigate({ to: '/home' })}
            className="rounded-full bg-[#6A1B9A] px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'player-entry') {
    return (
      <PlayerEntry
        onPlay={handlePlay}
        onBack={() => navigate({ to: '/home/library' })}
      />
    )
  }

  if (!session) return null

  // Fix #2: Full-screen overlay for all active game phases (after player-entry)
  const gameContent = renderGamePhase()

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'black' }}>
      {gameContent}
    </div>
  )

  function renderGamePhase() {
    if (phase === 'category-reveal' || phase === 'board') {
      const roundName = session!.orderedRoundNames[session!.currentRoundIndex]
      const categories = session!.game.rounds[roundName]
      const roundIdx = session!.currentRoundIndex
      const isRevealed = categoriesRevealed[roundIdx] ?? false

      return (
        <GameBoard
          categories={categories}
          clueStates={session!.clueStates}
          roundName={roundName}
          players={session!.players}
          onClueSelect={handleClueSelect}
          skipReveal={isRevealed}
          onAllRevealed={() => {
            setCategoriesRevealed(prev => ({ ...prev, [roundIdx]: true }))
          }}
        />
      )
    }

    if (phase === 'daily-double') {
      return (
        <DailyDoubleScreen
          players={session!.players}
          onPlayerSelect={handleDDPlayerSelect}
        />
      )
    }

    if (phase === 'daily-double-wager' && ddSelectedPlayer && activeClue) {
      const player = session!.players.find(p => p.name === ddSelectedPlayer)!
      const roundName = activeClue.roundName
      const category = session!.game.rounds[roundName][activeClue.categoryIndex]

      return (
        <DailyDoubleWager
          player={player}
          categoryName={category.category}
          onSubmit={handleDDWagerSubmit}
        />
      )
    }

    if (phase === 'clue' && activeClue) {
      const roundName = activeClue.roundName
      const category = session!.game.rounds[roundName][activeClue.categoryIndex]
      const clue = category.clues[activeClue.clueIndex]
      const key = `${roundName}-${activeClue.categoryIndex}-${activeClue.clueIndex}`
      const clueState = session!.clueStates[key]

      // Build wagers map for DD
      const wagers: Record<string, number> | null =
        clue.dailyDouble && ddSelectedPlayer && ddWager != null
          ? { [ddSelectedPlayer]: ddWager }
          : null

      return (
        <ClueScreen
          clue={clue}
          categoryName={category.category}
          players={session!.players}
          wagers={wagers}
          playerMarkings={clueState.playerMarkings}
          onMark={handleMark}
          onReturn={handleReturnToBoard}
          ddPlayer={clue.dailyDouble ? ddSelectedPlayer : null}
        />
      )
    }

    if (phase === 'round-transition') {
      const nextIndex = session!.currentRoundIndex + 1
      const label = nextIndex >= session!.orderedRoundNames.length
        ? ROUND_LABELS.final
        : ROUND_LABELS[session!.orderedRoundNames[nextIndex]]

      return <RoundTransition label={label} onContinue={handleContinueRound} />
    }

    if (phase === 'final-jeopardy') {
      return (
        <FinalJeopardy
          finalRound={session!.game.final}
          players={session!.players}
          onComplete={handleFJComplete}
        />
      )
    }

    if (phase === 'game-over') {
      return (
        <GameOver
          players={session!.players}
          gameId={gameId}
          onBackToHome={() => navigate({ to: '/home' })}
        />
      )
    }

    return null
  }
}
