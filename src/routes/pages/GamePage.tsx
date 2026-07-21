import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { supabase } from '../../utils/supabase'
import { normalizeGame } from '../../utils/gameNormalizer'
import { createSession, endSession, updateSessionPhase, updateBuzzState, updateSessionState, fetchSession, cleanupStaleSessions, updateSessionPlayers, updateFinalJeopardyState } from '../../utils/sessionApi'
import { debounce } from '../../utils/debounce'
import { createSessionChannel, subscribeToChannel, unsubscribeFromChannel, broadcastMessage, onChannelMessage, onPresenceChange } from '../../utils/sessionChannel'
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
  ToggleConfig,
} from '../../types/game'
import type { BuzzState, FinalJeopardyState, SessionPlayer, ChannelMessage } from '../../types/session'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { PlayerEntry } from '../../components/game/PlayerEntry'
import { exportGamePdf, exportCoopGamePdf } from '../../utils/exportGamePdf'
import { incrementTimesPlayed } from '../../utils/gameApi'
import { GameBoard } from '../../components/game/GameBoard'
import { ClueScreen } from '../../components/game/ClueScreen'
import { DailyDoubleScreen } from '../../components/game/DailyDoubleScreen'
import { DailyDoubleWager } from '../../components/game/DailyDoubleWager'
import { WagerEntry } from '../../components/game/WagerEntry'
import { FinalJeopardy } from '../../components/game/FinalJeopardy'
import { RoundTransition } from '../../components/game/RoundTransition'
// GameOver is kept on disk but no longer rendered — AnalyticsScreen takes its place
// import { GameOver } from '../../components/game/GameOver'
import { AnalyticsScreen } from '../../components/game/AnalyticsScreen'
import { CoopScoreboard } from '../../components/game/CoopScoreboard'
import { CoopGameOver } from '../../components/game/CoopGameOver'
import { CheatSheet } from '../../components/game/CheatSheet'
import { shouldShowCheatSheet } from '../../utils/cheatSheetVisibility'
import { applyModifiers } from '../../utils/gameToggles'
import { calculateBoardTotal, calculateTargetScore, applyCoopScoring, getCoopDailyDoubleMaxWager } from '../../utils/coopScoring'
import { useClueTimer } from '../../hooks/useClueTimer'
import { ActiveRulesIndicator } from '../../components/game/ActiveRulesIndicator'
import { GameSettingsPanel } from '../../components/game/GameSettingsPanel'
import { DEFAULT_TOGGLE_CONFIG } from '../../types/game'

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
  const [gameName, setGameName] = useState<string | null>(null)
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false)
  const [qrPopupOpen, setQrPopupOpen] = useState(false)

  // Session system state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [hostUserId, setHostUserId] = useState<string | null>(null)
  const sessionChannelRef = useRef<RealtimeChannel | null>(null)
  const playerEntryNamesRef = useRef<string[]>([])

  // Debounced buzz-state DB writer (300 ms) — coalesces rapid buzz events into
  // a single PATCH so we don't exhaust browser HTTP connections during active play.
  // The ref ensures a stable identity across renders without recreating the debounce timer.
  const debouncedUpdateBuzzStateRef = useRef(
    debounce((id: string, state: BuzzState) => {
      updateBuzzState(id, state).catch(() => {})
    }, 300)
  )

  // Session realtime state (for host panels)
  const [sessionPlayers, setSessionPlayers] = useState<SessionPlayer[]>([])
  const [onlinePlayers, setOnlinePlayers] = useState<string[]>([])
  const [buzzState, setBuzzState] = useState<BuzzState>({
    clueActive: false,
    queue: [],
    lockedOut: [],
    systemLocked: false,
  })
  const [finalJeopardyState, setFinalJeopardyState] = useState<FinalJeopardyState>({
    wagers: [],
    submissions: [],
    revealedIndex: -1,
  })

  // Fix #7: Daily Double state
  const [ddSelectedPlayer, setDdSelectedPlayer] = useState<string | null>(null)
  const [ddWager, setDdWager] = useState<number | null>(null)
  // Track whether the current clue is a daily double (for buzzer logic)
  const [isDailyDouble, setIsDailyDouble] = useState(false)
  const [clueAnswerRevealed, setClueAnswerRevealed] = useState(false)
  const [fjAnswerRevealed, setFjAnswerRevealed] = useState(false)

  // Steal bonus tracking (Task 9.5)
  const [stealBonusAwardedTo, setStealBonusAwardedTo] = useState<string | null>(null)

  // Co-op Final Jeopardy wager tracking
  const coopFjWagerRef = useRef<number>(0)



  // Timer state (Task 9.6)
  const [isTimesUp, setIsTimesUp] = useState(false)

  // Game settings toggle state (lifted from PlayerEntry for separate card layout)
  const [toggleConfig, setToggleConfig] = useState<ToggleConfig>(DEFAULT_TOGGLE_CONFIG)
  const [hasSettingsErrors, setHasSettingsErrors] = useState(false)

  function handleConfigChange(config: ToggleConfig, hasErrors: boolean) {
    setToggleConfig(config)
    setHasSettingsErrors(hasErrors)
  }



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
        setGameName(gameRow.game_name as string)

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
        let authFolder: string
        if (gameRow.created_by) {
          const { data: creatorData } = await supabase
            .from('players')
            .select('auth_uuid')
            .eq('id', gameRow.created_by)
            .single()

          authFolder = creatorData?.auth_uuid ?? user.id
        } else {
          // No created_by — default to current user's folder
          authFolder = user.id
        }

        const gameName = gameRow.game_name as string
        const basePath = `${authFolder}/${gameName}.json`

        // Try downloading with the resolved auth folder
        let { data: fileData, error: downloadErr } = await supabase.storage
          .from('games')
          .download(basePath)

        // If that fails and we used a creator's folder, fall back to current user's folder
        if ((downloadErr || !fileData) && authFolder !== user.id) {
          const fallbackPath = `${user.id}/${gameName}.json`
          const retry = await supabase.storage.from('games').download(fallbackPath)
          fileData = retry.data
          downloadErr = retry.error
        }

        // Last resort: try the bucket root (legacy games without folder prefix)
        if (downloadErr || !fileData) {
          const rootPath = `${gameName}.json`
          const retry = await supabase.storage.from('games').download(rootPath)
          fileData = retry.data
          downloadErr = retry.error
        }

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
        // Fire-and-forget cleanup of old/stale sessions
        cleanupStaleSessions().catch(() => {})
        try {
          const ch = createSessionChannel(gameSessionRow.id)
          // Register presence listeners BEFORE subscribing (required by Supabase)
          onPresenceChange(ch, {
            onSync: (names) => {
              setOnlinePlayers(names)
            },
          })
          // Register message listener before subscription
          onChannelMessage(ch, (message: ChannelMessage) => {
            switch (message.type) {
              case 'player_joined':
                setSessionPlayers(prev => {
                  // If player already exists (rejoin), don't duplicate
                  const exists = prev.some(p => p.name.toLowerCase() === message.player.name.toLowerCase())
                  if (exists) return prev
                  return [...prev, message.player]
                })
                break
              case 'player_rejoined':
                // Player reconnected — no action needed on host, they're already in the list
                break
              case 'player_removed':
                // Host initiated — remove from session players list
                setSessionPlayers(prev => prev.filter(p => p.name.toLowerCase() !== message.playerName.toLowerCase()))
                break
              case 'buzz':
                setBuzzState(prev => {
                  // Prevent duplicate buzzes from same player
                  if (prev.queue.some(e => e.playerName === message.playerName)) {
                    return prev
                  }
                  const newState = {
                    ...prev,
                    queue: [...prev.queue, { playerName: message.playerName, timestamp: message.timestamp }],
                  }
                  // Debounced persist to DB — coalesces rapid multi-player buzzes into
                  // a single PATCH instead of one per buzz event.
                  debouncedUpdateBuzzStateRef.current(gameSessionRow.id, newState)
                  return newState
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
              case 'fj_wager_received':
                // Fetch latest wagers from DB when a player submits their wager
                fetchSession(gameSessionRow.id).then(s => {
                  if (s) {
                    setFinalJeopardyState(s.final_jeopardy_state)
                  }
                }).catch(() => {})
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
          // Subscribe AFTER all listeners are registered
          await subscribeToChannel(ch)
          sessionChannelRef.current = ch
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

  // ─── Session phase sync + buzz state sync ────────────────────────────────
  // Combined effect: updates session phase and buzz state together in a single
  // PATCH wherever both change on the same phase transition (fix #3).
  // setBuzzState calls here are intentional — they sync local state with the
  // external Supabase session system as part of the same phase transition.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!sessionId) return

    if (phase === 'final-jeopardy') {
      // For co-op: write coopMode to DB FIRST (before phase change), so players see it on fetchSession
      if (session?.toggleConfig.coop.enabled) {
        updateFinalJeopardyState(sessionId, {
          wagers: [],
          submissions: [],
          revealedIndex: -1,
          coopMode: true,
        }).then(() => {
          // Only broadcast phase change AFTER DB write completes
          updateSessionPhase(sessionId, 'final-jeopardy').catch(() => {})
          if (sessionChannelRef.current) {
            broadcastMessage(sessionChannelRef.current, { type: 'phase_change', phase: 'final-jeopardy' }).catch(() => {})
            broadcastMessage(sessionChannelRef.current, {
              type: 'coop_pool_update',
              teamPool: session.teamPool,
              targetScore: session.targetScore,
            }).catch(() => {})
          }
        }).catch(() => {
          // Still broadcast even if DB write fails
          updateSessionPhase(sessionId, 'final-jeopardy').catch(() => {})
          if (sessionChannelRef.current) {
            broadcastMessage(sessionChannelRef.current, { type: 'phase_change', phase: 'final-jeopardy' }).catch(() => {})
          }
        })
      } else {
        // Competitive mode: no sequencing needed
        updateSessionPhase(sessionId, 'final-jeopardy').catch(() => {})
        if (sessionChannelRef.current) {
          broadcastMessage(sessionChannelRef.current, { type: 'phase_change', phase: 'final-jeopardy' }).catch(() => {})
        }
      }
      // Sync current player scores to the session DB so buzzer players know their max wager
      if (session) {
        const sessionPlayersWithScores = session.players.map(p => ({
          name: p.name,
          score: p.score,
          joinedAt: new Date().toISOString(),
        }))
        updateSessionPlayers(sessionId, sessionPlayersWithScores).catch(() => {})
      }
    } else if (phase === 'clue' && activeClue && !isDailyDouble) {
      // Enter clue screen: buzzers start LOCKED, queue cleared.
      // Batch phase + buzz_state into a single PATCH.
      const newBuzzState: BuzzState = {
        clueActive: true,
        queue: [],
        lockedOut: [],
        systemLocked: true,
      }
      setBuzzState(newBuzzState)
      updateSessionState(sessionId, 'buzzer', newBuzzState).catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'buzz_state_sync', buzzState: newBuzzState }).catch(() => {})
      }
    } else if (phase === 'board' || phase === 'category-reveal') {
      // Return to board: deactivate clue, reset buzz state to idle.
      // Batch phase + buzz_state into a single PATCH (fix #3).
      const newBuzzState: BuzzState = {
        clueActive: false,
        queue: [],
        lockedOut: [],
        systemLocked: false,
      }
      setBuzzState(newBuzzState)
      updateSessionState(sessionId, 'buzzer', newBuzzState).catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'buzz_state_sync', buzzState: newBuzzState }).catch(() => {})
      }
    } else if (phase === 'daily-double' || phase === 'daily-double-wager' || phase === 'wager-entry' || phase === 'round-transition') {
      updateSessionPhase(sessionId, 'buzzer').catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'phase_change', phase: 'buzzer' }).catch(() => {})
      }
    } else if (phase === 'game-over') {
      endSession(sessionId).catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'session_ended' }).catch(() => {})
      }
      // Increment times_played for co-op mode (competitive mode handles this in AnalyticsScreen)
      if (session?.toggleConfig.coop.enabled) {
        incrementTimesPlayed(gameId).catch(() => {})
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, phase, activeClue, isDailyDouble])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ─── FJ state polling: periodically fetch latest FJ state during Final Jeopardy ──
  useEffect(() => {
    if (!sessionId || phase !== 'final-jeopardy') return
    const interval = setInterval(() => {
      fetchSession(sessionId).then(s => {
        if (s) {
          setFinalJeopardyState(s.final_jeopardy_state)
        }
      }).catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [sessionId, phase])

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

  // ─── Timer-expiry buzzer locking (Task 9.6) ──────────────────────────────
  const handleTimerExpire = useCallback(() => {
    new Audio(`${import.meta.env.BASE_URL}sounds/times-up.mp3`).play().catch(() => {})
    handleBuzzerLock()
    setIsTimesUp(true)
  }, [handleBuzzerLock])

  const timer = useClueTimer({
    enabled: (session?.toggleConfig.timedClues.enabled ?? false) && phase === 'clue' && !isDailyDouble,
    duration: session?.toggleConfig.timedClues.timerDuration ?? 30,
    onExpire: handleTimerExpire,
  })

  function handlePlay(players: Player[], config: ToggleConfig) {
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

    const boardTotal = calculateBoardTotal(game)
    const targetScore = calculateTargetScore(boardTotal, config.coop.targetPercentage)

    setSession({
      game,
      gameId,
      players,
      currentRoundIndex: 0,
      orderedRoundNames,
      clueStates,
      dailyDoubleRecords: [],
      toggleConfig: config,
      streakCounts: {},
      perRoundIncorrect: {},
      activeWagers: null,
      teamPool: 0,
      targetScore,
      boardTotal,
    })
    setPhase('category-reveal')

    // Broadcast initial co-op state to player devices
    if (config.coop.enabled && sessionChannelRef.current) {
      broadcastMessage(sessionChannelRef.current, {
        type: 'coop_pool_update',
        teamPool: 0,
        targetScore,
      }).catch(() => {})
    }
  }

  function handleClueSelect(categoryIndex: number, clueIndex: number) {
    if (!session) return

    setClueAnswerRevealed(false)
    setStealBonusAwardedTo(null)

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
      // When Wagering Mode is active and clue is NOT a Daily Double,
      // show the wager entry screen before revealing the clue
      if (session.toggleConfig.wagering.enabled) {
        setPhase('wager-entry')
      } else {
        setPhase('clue')
      }
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

    // Build the updated playerMarkings FIRST (applyModifiers needs the post-change state)
    const updatedPlayerMarkings = { ...clueState.playerMarkings, [playerName]: result }

    // ─── Co-op Mode scoring ─────────────────────────────────────────────────
    if (session.toggleConfig.coop.enabled) {
      // Determine base value: use wager if wagering is active and player has a recorded wager
      let baseValue = clue.value
      if (clue.dailyDouble && ddWager != null && playerName === ddSelectedPlayer) {
        baseValue = ddWager
      } else if (session.toggleConfig.wagering.enabled && session.activeWagers && session.activeWagers[playerName] != null) {
        baseValue = session.activeWagers[playerName]
      }

      const coopResult = applyCoopScoring({
        prevMarking: prev,
        newMarking: result,
        baseValue,
        currentPool: session.teamPool,
      })

      // Still update individual player analytics (correctCount, incorrectCount, totalEarned)
      const updatedPlayers = session.players.map(p => {
        if (p.name !== playerName) return p

        let newCorrect = p.correctCount
        let newIncorrect = p.incorrectCount
        let newTotalEarned = p.totalEarned
        let newCorrectDD = p.correctDailyDoubles
        let newIncorrectDD = p.incorrectDailyDoubles

        if (prev === 'correct') { newCorrect--; newTotalEarned -= baseValue }
        if (prev === 'incorrect') { newIncorrect-- }
        if (result === 'correct') { newCorrect++; newTotalEarned += baseValue }
        if (result === 'incorrect') { newIncorrect++ }

        // Track Daily Double stats
        if (clue.dailyDouble && playerName === ddSelectedPlayer) {
          if (prev === 'correct') newCorrectDD--
          if (prev === 'incorrect') newIncorrectDD--
          if (result === 'correct') newCorrectDD++
          if (result === 'incorrect') newIncorrectDD++
        }

        return { ...p, correctCount: newCorrect, incorrectCount: newIncorrect, totalEarned: newTotalEarned, correctDailyDoubles: newCorrectDD, incorrectDailyDoubles: newIncorrectDD }
      })

      // Update clue state markings
      const updatedClueStates = {
        ...session.clueStates,
        [key]: {
          ...clueState,
          playerMarkings: updatedPlayerMarkings,
        },
      }

      const newSession = {
        ...session,
        players: updatedPlayers,
        clueStates: updatedClueStates,
        teamPool: coopResult.newPool,
      }
      setSession(newSession)

      // Broadcast co-op pool update to buzzer players
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, {
          type: 'coop_pool_update',
          teamPool: newSession.teamPool,
          targetScore: session.targetScore,
        }).catch(() => {})
      }

      return
    }

    // ─── Competitive Mode scoring (unchanged) ───────────────────────────────

    // Determine whether to use applyModifiers (non-DD clues with any enabled modifier)
    const hasModifiers =
      session.toggleConfig.rulesEngine.enabled ||
      session.toggleConfig.wagering.enabled
    const useModifiers = hasModifiers && !clue.dailyDouble

    // Track updated streak and perRoundIncorrect for session state
    const updatedStreakCounts = { ...session.streakCounts }
    const updatedPerRoundIncorrect = { ...session.perRoundIncorrect }

    // Update player score with reversal logic
    const updatedPlayers = session.players.map(p => {
      if (p.name !== playerName) return p

      let newScore = p.score
      let newCorrect = p.correctCount
      let newIncorrect = p.incorrectCount
      let newCorrectDD = p.correctDailyDoubles
      let newIncorrectDD = p.incorrectDailyDoubles
      let newTotalEarned = p.totalEarned

      if (useModifiers) {
        // Determine base value: use wager if wagering is active and player has a recorded wager
        let baseValue = clue.value
        if (session.toggleConfig.wagering.enabled && session.activeWagers && session.activeWagers[playerName] != null) {
          baseValue = session.activeWagers[playerName]
        }

        const modResult = applyModifiers({
          playerName,
          prevMarking: prev,
          newMarking: result,
          baseValue,
          toggleConfig: session.toggleConfig,
          streakCount: session.streakCounts[playerName] ?? 0,
          perRoundIncorrect: session.perRoundIncorrect[playerName] ?? 0,
          playerMarkings: updatedPlayerMarkings,
        })

        newScore += modResult.scoreDelta
        updatedStreakCounts[playerName] = modResult.newStreakCount
        updatedPerRoundIncorrect[playerName] = modResult.newPerRoundIncorrect

        // Track steal bonus for ClueScreen indicator (Task 9.5)
        if (modResult.stealBonusApplied) {
          setStealBonusAwardedTo(playerName)
        }

        // Analytics tracking: correctCount, incorrectCount, totalEarned
        if (prev === 'correct') { newCorrect--; newTotalEarned -= baseValue }
        if (prev === 'incorrect') { newIncorrect-- }
        if (result === 'correct') { newCorrect++; newTotalEarned += baseValue }
        if (result === 'incorrect') { newIncorrect++ }
      } else {
        // Standard scoring (DD clues or no modifiers active)
        // Reverse previous marking
        if (prev === 'correct') { newScore -= pointValue; newCorrect--; newTotalEarned -= pointValue }
        if (prev === 'incorrect') { newScore += pointValue; newIncorrect-- }

        // Apply new marking (null means unmark — only reverse was needed)
        if (result === 'correct') { newScore += pointValue; newCorrect++; newTotalEarned += pointValue }
        if (result === 'incorrect') { newScore -= pointValue; newIncorrect++ }
      }

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
        playerMarkings: updatedPlayerMarkings,
      },
    }

    setSession({
      ...session,
      players: updatedPlayers,
      clueStates: updatedClueStates,
      streakCounts: updatedStreakCounts,
      perRoundIncorrect: updatedPerRoundIncorrect,
    })
  }

  function handleReturnToBoard() {
    if (!session || !activeClue) return

    setClueAnswerRevealed(false)
    setStealBonusAwardedTo(null)
    timer.reset()
    setIsTimesUp(false)

    const key = `${activeClue.roundName}-${activeClue.categoryIndex}-${activeClue.clueIndex}`
    const clue = session.game.rounds[activeClue.roundName][activeClue.categoryIndex].clues[activeClue.clueIndex]

    // Mark clue as chosen
    const updatedClueStates = {
      ...session.clueStates,
      [key]: { ...session.clueStates[key], chosen: true },
    }

    // Append a DailyDoubleRecord when this clue was a resolved Daily Double
    let updatedDDRecords = session.dailyDoubleRecords
    if (clue.dailyDouble && ddSelectedPlayer != null && ddWager != null) {
      const outcome = session.clueStates[key].playerMarkings[ddSelectedPlayer]
      if (outcome === 'correct' || outcome === 'incorrect') {
        updatedDDRecords = [
          ...updatedDDRecords,
          { clueKey: key, playerName: ddSelectedPlayer, wager: ddWager, outcome },
        ]
      }
    }

    const updatedSession = { ...session, clueStates: updatedClueStates, dailyDoubleRecords: updatedDDRecords }
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

      // Broadcast co-op pool state so player devices know co-op is active
      if (session.toggleConfig.coop.enabled && sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, {
          type: 'coop_pool_update',
          teamPool: session.teamPool,
          targetScore: session.targetScore,
        }).catch(() => {})
      }
    } else {
      // Reset perRoundIncorrect for the new round (Requirement 7.5)
      setSession({ ...session, currentRoundIndex: nextIndex, perRoundIncorrect: {} })
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: '2rem', padding: '2rem', minHeight: '100vh', boxSizing: 'border-box', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 1 auto' }}>
          <PlayerEntry
            onPlay={handlePlay}
            onBack={() => navigate({ to: '/home/library' })}
            toggleConfig={toggleConfig}
            hasSettingsErrors={hasSettingsErrors}
            onPlayerAdded={(playerName) => {
              playerEntryNamesRef.current = [...playerEntryNamesRef.current, playerName]
              if (sessionId) {
                const sessionPlayers = playerEntryNamesRef.current.map(n => ({
                  name: n, score: 0, joinedAt: new Date().toISOString(),
                }))
                updateSessionPlayers(sessionId, sessionPlayers).catch(() => {})
              }
              if (sessionChannelRef.current) {
                broadcastMessage(sessionChannelRef.current, {
                  type: 'player_joined',
                  player: { name: playerName, score: 0, joinedAt: new Date().toISOString() },
                }).catch(() => {})
              }
            }}
            onPlayerRemoved={(playerName) => {
              playerEntryNamesRef.current = playerEntryNamesRef.current.filter(
                n => n.toLowerCase() !== playerName.toLowerCase()
              )
              if (sessionId) {
                const sessionPlayers = playerEntryNamesRef.current.map(n => ({
                  name: n, score: 0, joinedAt: new Date().toISOString(),
                }))
                updateSessionPlayers(sessionId, sessionPlayers).catch(() => {})
              }
              if (sessionChannelRef.current) {
                broadcastMessage(sessionChannelRef.current, { type: 'player_removed', playerName }).catch(() => {})
              }
            }}
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
                <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
                  Player names <strong style={{ color: '#f1f5f9' }}>MUST</strong> match exactly when joining.
                </p>
              </div>
            </BackgroundGradient>
          </div>
        )}
        <div style={{ flex: '0 0 auto', paddingTop: '2rem' }}>
          <BackgroundGradient>
            <div style={{ maxWidth: '20rem', padding: '1.5rem', borderRadius: '1.5rem', border: '1px solid rgb(30 41 59)', background: 'rgb(15 23 42 / 0.95)', boxShadow: '0 25px 50px -12px rgb(15 23 42 / 0.3)' }}>
              <GameSettingsPanel onConfigChange={handleConfigChange} boardTotal={game ? calculateBoardTotal(game) : undefined} />
              {game && (
                <>
                  <hr style={{ border: 'none', borderTop: '1px solid rgb(51 65 85)', margin: '1.25rem 0' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
                      Download a print-ready PDF with clue grids and answer key
                    </p>
                    <button
                      type="button"
                      onClick={() => exportGamePdf(game, gameName ?? undefined)}
                      className="player-play-btn"
                      style={{ marginTop: '0.25rem', width: 'auto', paddingLeft: '1.5rem', paddingRight: '1.5rem' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Export PDF
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </BackgroundGradient>
        </div>
      </div>
    )
  }

  if (!session) return null

  // Fix #2: Full-screen overlay for all active game phases (after player-entry)
  const hiddenPhases: GamePhase[] = ['player-entry', 'game-over']
  const showCheatSheet = shouldShowCheatSheet(gameSource, fromLibrary) && !hiddenPhases.includes(phase)
  const gameContent = renderGamePhase()

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
            onlinePlayers={onlinePlayers}
          />
        </div>
      )}
      {sessionId && phase === 'final-jeopardy' && (
        <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 60, maxWidth: 400, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
          <FinalJeopardyHostPanel
            players={sessionPlayers}
            finalJeopardyState={finalJeopardyState}
            showAnswers={fjAnswerRevealed}
            onlinePlayers={onlinePlayers}
          />
        </div>
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
                <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
                  Player names <strong style={{ color: '#f1f5f9' }}>MUST</strong> match exactly when joining.
                </p>
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

      const actionButtons = (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, paddingRight: '0.5rem' }}>
          {sessionId && (
            <button
              type="button"
              onClick={() => setQrPopupOpen(true)}
              className="rounded-full bg-[#6A1B9A] px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition hover:bg-[#7B1FA2] hover:shadow-xl"
            >
              Buzzer Code
            </button>
          )}
          {showCheatSheet && (
            <button
              type="button"
              onClick={() => setCheatSheetOpen(true)}
              className="rounded-full bg-[#6A1B9A] px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition hover:bg-[#7B1FA2] hover:shadow-xl"
            >
              Answer Sheet
            </button>
          )}
        </div>
      )

      const coopScoreboardEl = session!.toggleConfig.coop.enabled
        ? (
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', backgroundColor: '#001699' }}>
            <CoopScoreboard teamPool={session!.teamPool} targetScore={session!.targetScore} playerNames={session!.players.map(p => p.name)} />
            {actionButtons}
          </div>
        )
        : undefined

      return (
        <>
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
            customScoreboard={coopScoreboardEl}
          />
          {/* For competitive mode, show buttons as fixed overlay since they're not in the scoreboard */}
          {!session!.toggleConfig.coop.enabled && (
            <div style={{ position: 'fixed', bottom: '1rem', right: '1rem', zIndex: 45, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {sessionId && (
                <button type="button" onClick={() => setQrPopupOpen(true)} className="rounded-full bg-[#6A1B9A] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-[#7B1FA2] hover:shadow-xl">Buzzer Code</button>
              )}
              {showCheatSheet && (
                <button type="button" onClick={() => setCheatSheetOpen(true)} className="rounded-full bg-[#6A1B9A] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-[#7B1FA2] hover:shadow-xl">Answer Sheet</button>
              )}
            </div>
          )}
        </>
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

      // In co-op mode, use co-op DD max wager; pass a player with score = teamPool
      const ddPlayer = session!.toggleConfig.coop.enabled
        ? { ...player, score: getCoopDailyDoubleMaxWager(session!.teamPool) }
        : player

      return (
        <DailyDoubleWager
          player={ddPlayer}
          categoryName={category.category}
          onSubmit={handleDDWagerSubmit}
        />
      )
    }

    if (phase === 'wager-entry' && activeClue) {
      return (
        <>
          <ActiveRulesIndicator config={session!.toggleConfig} />
          <WagerEntry
            players={session!.players}
            wagerFloor={session!.toggleConfig.wagering.wagerFloor}
            onReveal={(wagers) => {
              setSession(prev => prev ? { ...prev, activeWagers: wagers } : prev)
              setPhase('clue')
            }}
          />
          {session!.toggleConfig.coop.enabled && (
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, width: '100vw' }}>
              <CoopScoreboard teamPool={session!.teamPool} targetScore={session!.targetScore} playerNames={session!.players.map(p => p.name)} />
            </div>
          )}
        </>
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
          : session!.toggleConfig.wagering.enabled && session!.activeWagers
            ? session!.activeWagers
            : null

      return (
        <>
          <ActiveRulesIndicator config={session!.toggleConfig} />
          <ClueScreen
            clue={clue}
            categoryName={category.category}
            players={session!.players}
            wagers={wagers}
            playerMarkings={clueState.playerMarkings}
            onMark={handleMark}
            onReturn={handleReturnToBoard}
            ddPlayer={clue.dailyDouble ? ddSelectedPlayer : null}
            modifierConfig={session!.toggleConfig}
            streakCounts={session!.streakCounts}
            perRoundIncorrect={session!.perRoundIncorrect}
            stealBonusAwardedTo={stealBonusAwardedTo}
            timerRemaining={timer.remaining}
            isTimesUp={isTimesUp}
            onAnswerRevealed={() => {
              setClueAnswerRevealed(true)
              timer.stop()
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
          {session!.toggleConfig.coop.enabled && (
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60, width: '100vw' }}>
              <CoopScoreboard teamPool={session!.teamPool} targetScore={session!.targetScore} playerNames={session!.players.map(p => p.name)} />
            </div>
          )}
        </>
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
            <div style={{ position: 'fixed', bottom: '18%', left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '1.5rem', borderRadius: '1rem', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgb(51 65 85)', maxWidth: '22rem'}}>
              <p style={{ color: '#f1f5f9', fontSize: '0.875rem', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                <strong>Last chance to join!</strong> Scan this QR code to submit your Final Jeopardy answer on your phone.
              </p>
              <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0, textAlign: 'center', lineHeight: 1.4 }}>
                  Player names <strong style={{ color: '#f1f5f9' }}>MUST</strong> match exactly when joining.
                </p>
              <SessionQRCode sessionId={sessionId} />
              <p style={{ color: '#94a3b8', fontSize: '0.75rem', textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
                If you're already on the buzzer page, stay there — it will automatically switch to the wager submission page.
              </p>
            </div>
          )}
        </>
      )
    }

    if (phase === 'final-jeopardy') {
      const isCoopActive = session!.toggleConfig.coop.enabled

      return (
        <FinalJeopardy
          finalRound={session!.game.final}
          players={session!.players}
          onComplete={handleFJComplete}
          onClueRevealed={handleFJClueRevealed}
          wagers={finalJeopardyState.wagers}
          allWagersSubmitted={isCoopActive ? true : finalJeopardyState.wagers.length >= session!.players.length}
          allAnswersSubmitted={isCoopActive ? true : finalJeopardyState.submissions.length >= session!.players.length}
          coopMode={isCoopActive}
          teamPool={isCoopActive ? session!.teamPool : undefined}
          onCoopWagerSubmit={isCoopActive ? (wager: number) => {
            coopFjWagerRef.current = wager
          } : undefined}
          onCoopMarkAnswer={isCoopActive ? (result: 'correct' | 'incorrect') => {
            const wager = coopFjWagerRef.current
            const newPool = result === 'correct'
              ? session!.teamPool + wager
              : session!.teamPool - wager
            setSession(prev => prev ? { ...prev, teamPool: newPool } : prev)
            // Broadcast pool update
            if (sessionChannelRef.current) {
              broadcastMessage(sessionChannelRef.current, {
                type: 'coop_pool_update',
                teamPool: newPool,
                targetScore: session!.targetScore,
              }).catch(() => {})
            }
            // Transition to game-over after FJ marking in co-op
            setPhase('game-over')
          } : undefined}
          submissions={finalJeopardyState.submissions}
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
      // Co-op mode: render CoopGameOver (skip leaderboard submission)
      if (session!.toggleConfig.coop.enabled) {
        return (
          <CoopGameOver
            teamPool={session!.teamPool}
            targetScore={session!.targetScore}
            boardTotal={session!.boardTotal}
            players={session!.players}
            onExportPdf={() => {
              exportCoopGamePdf({
                teamPool: session!.teamPool,
                targetScore: session!.targetScore,
                boardTotal: session!.boardTotal,
                players: session!.players.map(p => ({
                  name: p.name,
                  correctCount: p.correctCount,
                  incorrectCount: p.incorrectCount,
                  totalEarned: p.totalEarned,
                })),
              })
            }}
            onPlayAgain={() => navigate({ to: '/home' })}
          />
        )
      }

      // Competitive mode: render AnalyticsScreen (with leaderboard submission)
      return (
        <AnalyticsScreen
          session={session!}
          gameId={gameId}
          onBackToHome={() => navigate({ to: '/home' })}
        />
      )
    }

    return null
  }
}
