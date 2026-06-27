import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { supabase } from '../../utils/supabase'
import { normalizeGame } from '../../utils/gameNormalizer'
import { createSession, endSession, updateSessionPhase, updateBuzzState, fetchSession } from '../../utils/sessionApi'
import { createSessionChannel, subscribeToChannel, unsubscribeFromChannel, broadcastMessage, onChannelMessage } from '../../utils/sessionChannel'
import { SessionQRCode } from '../../components/host/SessionQRCode'
import { BuzzerHostPanel } from '../../components/host/BuzzerHostPanel'
import { FinalJeopardyHostPanel } from '../../components/host/FinalJeopardyHostPanel'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import { BackButton } from '../../components/BackButton'
import type {
  ActiveClue,
  ClueState,
  GamePhase,
  GameSession,
  NormalizedGame,
  Player,
  RoundName,
} from '../../types/game'
import type { BuzzState, FinalJeopardyState, SessionPlayer, ChannelMessage } from '../../types/session'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { PlayerEntry } from '../../components/game/PlayerEntry'
import { GameBoard } from '../../components/game/GameBoard'
import { ClueScreen } from '../../components/game/ClueScreen'
import { DailyDoubleScreen } from '../../components/game/DailyDoubleScreen'
import { DailyDoubleWager } from '../../components/game/DailyDoubleWager'
import { FinalJeopardy } from '../../components/game/FinalJeopardy'
import { RoundTransition } from '../../components/game/RoundTransition'
import { GameOver } from '../../components/game/GameOver'
import { CheatSheetButton } from '../../components/game/CheatSheetButton'
import { CheatSheet } from '../../components/game/CheatSheet'
import { shouldShowCheatSheet } from '../../utils/cheatSheetVisibility'

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
  const locationState = useRouterState({ select: (s) => s.location.state }) as { fromLibrary?: boolean }
  const fromLibrary = locationState?.fromLibrary ?? false

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [game, setGame] = useState<NormalizedGame | null>(null)
  const [session, setSession] = useState<GameSession | null>(null)
  const [phase, setPhase] = useState<GamePhase>('player-entry')
  const [activeClue, setActiveClue] = useState<ActiveClue | null>(null)

  // Fix #11: Track whether categories have been revealed per round
  const [categoriesRevealed, setCategoriesRevealed] = useState<Record<number, boolean>>({})

  // Game source for answer sheet visibility
  const [gameSource, setGameSource] = useState<string | null>(null)
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false)
  const [qrPopupOpen, setQrPopupOpen] = useState(false)

  // Session system state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [hostUserId, setHostUserId] = useState<string | null>(null)
  const sessionChannelRef = useRef<RealtimeChannel | null>(null)

  // Session realtime state (for host panels)
  const [sessionPlayers, setSessionPlayers] = useState<SessionPlayer[]>([])
  const [buzzState, setBuzzState] = useState<BuzzState>({
    clueActive: false,
    queue: [],
    lockedOut: [],
    systemLocked: false,
  })
  const [finalJeopardyState, setFinalJeopardyState] = useState<FinalJeopardyState>({
    submissions: [],
    revealedIndex: -1,
  })

  // Fix #7: Daily Double state
  const [ddSelectedPlayer, setDdSelectedPlayer] = useState<string | null>(null)
  const [ddWager, setDdWager] = useState<number | null>(null)
  // Track whether the current clue is a daily double (for buzzer logic)
  const [isDailyDouble, setIsDailyDouble] = useState(false)
  const [clueAnswerRevealed, setClueAnswerRevealed] = useState(false)
  const [fjClueRevealed, setFjClueRevealed] = useState(false)
  const [fjAnswerRevealed, setFjAnswerRevealed] = useState(false)

  // Load game from Supabase Storage on mount
  useEffect(() => {
    async function loadGame() {
      try {
        // Get game name and creator from games table
        const { data: gameRow, error: fetchErr } = await supabase
          .from('games')
          .select('game_name, created_by, source')
          .eq('id', gameId)
          .single()

        if (fetchErr || !gameRow) {
          setError('Game not found.')
          setLoading(false)
          return
        }

        // Store game source for answer sheet visibility
        setGameSource(gameRow.source ?? null)

        // Get current user to verify authentication
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setError('Not authenticated.')
          setLoading(false)
          return
        }

        // Store the user ID for session creation
        setHostUserId(user.id)

        // Build storage path: games are stored under auth_uuid/{game_name}.json
        // Look up the creator's auth_uuid from the players table
        let storagePath: string
        if (gameRow.created_by) {
          const { data: creatorData } = await supabase
            .from('players')
            .select('auth_uuid')
            .eq('id', gameRow.created_by)
            .single()

          if (creatorData?.auth_uuid) {
            storagePath = `${creatorData.auth_uuid}/${gameRow.game_name}.json`
          } else {
            // Fallback: try using the current user's auth UUID
            storagePath = `${user.id}/${gameRow.game_name}.json`
          }
        } else {
          storagePath = `${gameRow.game_name}.json`
        }
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

  // ─── Create session once game is loaded and user is authenticated ─────────
  useEffect(() => {
    if (loading || !hostUserId || sessionId) return

    createSession(hostUserId, gameId)
      .then(async (gameSessionRow) => {
        setSessionId(gameSessionRow.id)
        try {
          const ch = createSessionChannel(gameSessionRow.id)
          await subscribeToChannel(ch)
          sessionChannelRef.current = ch
          // Register message listener immediately after subscription
          onChannelMessage(ch, (message: ChannelMessage) => {
            switch (message.type) {
              case 'player_joined':
                setSessionPlayers(prev => [...prev, message.player])
                break
              case 'buzz':
                setBuzzState(prev => {
                  // Prevent duplicate buzzes from same player
                  if (prev.queue.some(e => e.playerName === message.playerName)) {
                    return prev
                  }
                  return {
                    ...prev,
                    queue: [...prev.queue, { playerName: message.playerName, timestamp: message.timestamp }],
                  }
                })
                break
              case 'buzz_queue_update':
                setBuzzState(prev => ({ ...prev, queue: message.queue }))
                break
              case 'buzzer_locked':
                setBuzzState(prev => ({ ...prev, systemLocked: true, queue: [] }))
                break
              case 'buzzer_unlocked':
                setBuzzState(prev => ({ ...prev, systemLocked: false }))
                break
              case 'buzz_state_sync':
                setBuzzState(message.buzzState)
                break
              case 'buzz_queue_cleared':
                setBuzzState(prev => ({ ...prev, queue: [], lockedOut: message.lockedOut }))
                break
              case 'player_incorrect':
                setBuzzState(prev => ({
                  ...prev,
                  lockedOut: [...prev.lockedOut, message.playerName],
                }))
                break
              case 'fj_submission_received':
                // Fetch latest submissions from DB when a player submits
                fetchSession(gameSessionRow.id).then(s => {
                  if (s) {
                    setFinalJeopardyState(s.final_jeopardy_state)
                    setSessionPlayers(s.players)
                  }
                }).catch(() => {})
                break
              case 'fj_reveal':
                setFinalJeopardyState(prev => ({
                  ...prev,
                  revealedIndex: message.index,
                  submissions: prev.submissions.map((s, i) =>
                    i === message.index ? message.submission : s
                  ),
                }))
                break
              case 'fj_score_update':
                setSessionPlayers(prev =>
                  prev.map(p => p.name === message.playerName ? { ...p, score: message.newScore } : p)
                )
                break
              default:
                break
            }
          })
        } catch (err) {
          console.warn('[Session] Channel subscription failed:', err)
        }
      })
      .catch((err) => {
        console.error('[Session] Failed to create game session:', err)
      })
  }, [loading, hostUserId, gameId, sessionId])

  // ─── Session lifecycle: cleanup on unmount/navigation ────────────────────
  useEffect(() => {
    return () => {
      // End session and broadcast session_ended when component unmounts
      if (sessionId) {
        // Fire-and-forget cleanup
        endSession(sessionId).catch(() => {})
        if (sessionChannelRef.current) {
          broadcastMessage(sessionChannelRef.current, { type: 'session_ended' }).catch(() => {})
          unsubscribeFromChannel(sessionChannelRef.current).catch(() => {})
          sessionChannelRef.current = null
        }
      }
    }
  }, [sessionId])

  // ─── Session phase sync: update session phase when game phase changes ────
  useEffect(() => {
    if (!sessionId) return

    if (phase === 'final-jeopardy') {
      updateSessionPhase(sessionId, 'final-jeopardy').catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'phase_change', phase: 'final-jeopardy' }).catch(() => {})
      }
    } else if (phase === 'clue' || phase === 'board' || phase === 'category-reveal' || phase === 'daily-double' || phase === 'daily-double-wager' || phase === 'round-transition') {
      updateSessionPhase(sessionId, 'buzzer').catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'phase_change', phase: 'buzzer' }).catch(() => {})
      }
    } else if (phase === 'game-over') {
      endSession(sessionId).catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'session_ended' }).catch(() => {})
      }
    }
  }, [sessionId, phase])

  // ─── Activate/deactivate clue for buzzer system ──────────────────────────
  // This effect synchronizes local buzz state with the external Supabase system
  // when the game phase changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!sessionId) return

    if (phase === 'clue' && activeClue && !isDailyDouble) {
      // Enter clue screen: buzzers start LOCKED, queue cleared
      const newBuzzState: BuzzState = {
        clueActive: true,
        queue: [],
        lockedOut: [],
        systemLocked: true,
      }
      setBuzzState(newBuzzState)
      updateBuzzState(sessionId, newBuzzState).catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'buzz_state_sync', buzzState: newBuzzState }).catch(() => {})
      }
    } else if (phase === 'board' || phase === 'category-reveal') {
      // Deactivate — always reset to clean idle state
      const newBuzzState: BuzzState = {
        clueActive: false,
        queue: [],
        lockedOut: [],
        systemLocked: false,
      }
      setBuzzState(newBuzzState)
      updateBuzzState(sessionId, newBuzzState).catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'buzz_state_sync', buzzState: newBuzzState }).catch(() => {})
      }
    }
  }, [sessionId, phase, activeClue, isDailyDouble])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ─── Host panel handlers ─────────────────────────────────────────────────

  const handleBuzzerClearQueue = useCallback(() => {
    if (!sessionId) return
    setBuzzState(prev => {
      const currentLockedOut = [...prev.lockedOut, ...prev.queue.map(e => e.playerName)]
      const newBuzzState: BuzzState = {
        ...prev,
        queue: [],
        lockedOut: currentLockedOut,
      }
      updateBuzzState(sessionId, newBuzzState).catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'buzz_state_sync', buzzState: newBuzzState }).catch(() => {})
      }
      return newBuzzState
    })
  }, [sessionId])

  const handleBuzzerLock = useCallback(() => {
    if (!sessionId) return
    setBuzzState(prev => {
      const newBuzzState: BuzzState = { ...prev, systemLocked: true, queue: [] }
      updateBuzzState(sessionId, newBuzzState).catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'buzz_state_sync', buzzState: newBuzzState }).catch(() => {})
      }
      return newBuzzState
    })
  }, [sessionId])

  const handleBuzzerUnlock = useCallback(() => {
    if (!sessionId) return
    setBuzzState(prev => {
      const newBuzzState: BuzzState = { ...prev, systemLocked: false }
      updateBuzzState(sessionId, newBuzzState).catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'buzz_state_sync', buzzState: newBuzzState }).catch(() => {})
      }
      return newBuzzState
    })
  }, [sessionId])

  const handleFJClueRevealed = useCallback(() => {
    setFjClueRevealed(true)
    console.log('[FJ] Clue revealed, broadcasting buzz_state_sync with clueActive: true')
    if (sessionId && sessionChannelRef.current) {
      const newBuzzState: BuzzState = {
        clueActive: true,
        queue: [],
        lockedOut: [],
        systemLocked: false,
      }
      setBuzzState(newBuzzState)
      updateBuzzState(sessionId, newBuzzState).catch(() => {})
      broadcastMessage(sessionChannelRef.current, { type: 'buzz_state_sync', buzzState: newBuzzState }).catch((err) => {
        console.error('[FJ] Failed to broadcast buzz_state_sync:', err)
      })
    } else {
      console.warn('[FJ] Cannot broadcast: sessionId=', sessionId, 'channel=', sessionChannelRef.current)
    }
  }, [sessionId])

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

    setClueAnswerRevealed(false)

    const roundName = session.orderedRoundNames[session.currentRoundIndex]
    const categories = session.game.rounds[roundName]
    const clue = categories[categoryIndex].clues[clueIndex]

    setActiveClue({ roundName, categoryIndex, clueIndex })

    if (clue.dailyDouble) {
      setIsDailyDouble(true)
      setDdSelectedPlayer(null)
      setDdWager(null)
      setPhase('daily-double')
    } else {
      setIsDailyDouble(false)
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

    setClueAnswerRevealed(false)

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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '4rem', padding: '2rem', minHeight: '100vh', boxSizing: 'border-box' }}>
        <div style={{ flex: '0 1 auto' }}>
          <PlayerEntry
            onPlay={handlePlay}
            onBack={() => navigate({ to: '/home/library' })}
          />
        </div>
        {sessionId && (
          <div style={{ flex: '0 0 auto', paddingTop: '2rem' }}>
            <BackgroundGradient>
              <div style={{ maxWidth: '18rem', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', borderRadius: '1.5rem', border: '1px solid rgb(30 41 59)', background: 'rgb(15 23 42 / 0.95)', boxShadow: '0 25px 50px -12px rgb(15 23 42 / 0.3)' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f1f5f9', margin: 0, textAlign: 'center' }}>
                  Buzzer Code
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
                  Scan this QR code to join the game as a buzzer player
                </p>
                <SessionQRCode sessionId={sessionId} />
              </div>
            </BackgroundGradient>
          </div>
        )}
      </div>
    )
  }

  if (!session) return null

  // Fix #2: Full-screen overlay for all active game phases (after player-entry)
  const gameContent = renderGamePhase()
  const hiddenPhases: GamePhase[] = ['player-entry', 'game-over']
  const showCheatSheet = shouldShowCheatSheet(gameSource, fromLibrary) && !hiddenPhases.includes(phase)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'black' }}>
      {gameContent}
      {/* Buzzer host panel — top right on clue page, hidden when answer revealed or daily double */}
      {sessionId && phase === 'clue' && !clueAnswerRevealed && !isDailyDouble && (
        <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 60, maxWidth: 280 }}>
          <BuzzerHostPanel
            buzzState={buzzState}
            onClearQueue={handleBuzzerClearQueue}
            onLock={handleBuzzerLock}
            onUnlock={handleBuzzerUnlock}
          />
        </div>
      )}
      {sessionId && phase === 'final-jeopardy' && fjClueRevealed && (
        <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 60, maxWidth: 400, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
          <FinalJeopardyHostPanel
            players={sessionPlayers}
            finalJeopardyState={finalJeopardyState}
            showAnswers={fjAnswerRevealed}
          />
        </div>
      )}
      {/* QR Code popup button — next to answer sheet button */}
      {sessionId && (phase === 'category-reveal' || phase === 'board') && (
        <button
          type="button"
          onClick={() => setQrPopupOpen(true)}
          className="fixed bottom-4 z-40 rounded-full bg-[#6A1B9A] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-[#7B1FA2] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CE93D8] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          style={{ right: showCheatSheet ? '10rem' : '1rem' }}
        >
          Buzzer Code
        </button>
      )}
      {showCheatSheet && (
        <CheatSheetButton onClick={() => setCheatSheetOpen(true)} />
      )}
      {/* QR Code popup overlay */}
      {qrPopupOpen && sessionId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setQrPopupOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <BackgroundGradient>
              <div style={{ maxWidth: '20rem', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', borderRadius: '1.5rem', border: '1px solid rgb(30 41 59)', background: 'rgb(15 23 42 / 0.95)', boxShadow: '0 25px 50px -12px rgb(15 23 42 / 0.3)', position: 'relative' }}>
                <div style={{ alignSelf: 'flex-start' }}>
                  <BackButton onClick={() => setQrPopupOpen(false)} label="Close QR code" />
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f1f5f9', margin: 0, textAlign: 'center', marginTop: '1rem' }}>
                  Join on Your Phone
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
                  Scan this QR code to join the game as a buzzer player
                </p>
                <SessionQRCode sessionId={sessionId} />
              </div>
            </BackgroundGradient>
          </div>
        </div>
      )}
      {showCheatSheet && (
        <CheatSheet
          game={session.game}
          orderedRoundNames={session.orderedRoundNames}
          isOpen={cheatSheetOpen}
          onClose={() => setCheatSheetOpen(false)}
        />
      )}
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
          onAnswerRevealed={() => {
            setClueAnswerRevealed(true)
            // Lock buzzers and clear queue when answer is revealed
            if (sessionId) {
              const newBuzzState: BuzzState = {
                clueActive: false,
                queue: [],
                lockedOut: [],
                systemLocked: true,
              }
              setBuzzState(newBuzzState)
              updateBuzzState(sessionId, newBuzzState).catch(() => {})
              if (sessionChannelRef.current) {
                broadcastMessage(sessionChannelRef.current, { type: 'buzz_state_sync', buzzState: newBuzzState }).catch(() => {})
              }
            }
          }}
        />
      )
    }

    if (phase === 'round-transition') {
      const nextIndex = session!.currentRoundIndex + 1
      const isFinalJeopardyNext = nextIndex >= session!.orderedRoundNames.length
      const label = isFinalJeopardyNext
        ? ROUND_LABELS.final
        : ROUND_LABELS[session!.orderedRoundNames[nextIndex]]

      return (
        <>
          <RoundTransition label={label} onContinue={handleContinueRound} />
          {isFinalJeopardyNext && sessionId && (
            <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '1.5rem', borderRadius: '1rem', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgb(51 65 85)', maxWidth: '22rem'}}>
              <p style={{ color: '#f1f5f9', fontSize: '0.875rem', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                <strong>Last chance to join!</strong> Scan this QR code to submit your Final Jeopardy answer on your phone.
              </p>
              <SessionQRCode sessionId={sessionId} />
              <p style={{ color: '#94a3b8', fontSize: '0.75rem', textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
                If you're already on the buzzer page, stay there — it will automatically switch to the answer submission page.
              </p>
            </div>
          )}
        </>
      )
    }

    if (phase === 'final-jeopardy') {
      return (
        <FinalJeopardy
          finalRound={session!.game.final}
          players={session!.players}
          onComplete={handleFJComplete}
          onClueRevealed={handleFJClueRevealed}
          onAnswerRevealed={() => {
            setFjAnswerRevealed(true)
            // Lock submissions when answer is revealed
            if (sessionId && sessionChannelRef.current) {
              const newBuzzState: BuzzState = {
                clueActive: false,
                queue: [],
                lockedOut: [],
                systemLocked: true,
              }
              setBuzzState(newBuzzState)
              updateBuzzState(sessionId, newBuzzState).catch(() => {})
              broadcastMessage(sessionChannelRef.current, { type: 'buzz_state_sync', buzzState: newBuzzState }).catch(() => {})
            }
          }}
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
