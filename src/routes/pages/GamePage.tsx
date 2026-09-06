import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { supabase } from '../../utils/supabase'
import { normalizeGame } from '../../utils/gameNormalizer'
import { createSession, endSession, updateSessionPhase, updateBuzzState, updateSessionState, fetchSession, cleanupStaleSessions, updateSessionPlayers, updateFinalJeopardyState, updateGamblingState } from '../../utils/sessionApi'
import { debounce } from '../../utils/debounce'
import { createSessionChannel, subscribeToChannel, unsubscribeFromChannel, broadcastMessage, onChannelMessage, onPresenceChange } from '../../utils/sessionChannel'
import { SessionQRCode } from '../../components/host/SessionQRCode'

import { BuzzerHostPanel } from '../../components/host/BuzzerHostPanel'
import { FinalJeopardyHostPanel } from '../../components/host/FinalJeopardyHostPanel'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import { BackButton } from '../../components/BackButton'
import type {
  ActiveClue,
  ClueAnswerEvent,
  ClueState,
  GamePhase,
  GameSession,
  NormalizedGame,
  Player,
  RoundName,
  RoundTrackingData,
  SideBetType,
  ToggleConfig,
} from '../../types/game'
import type { BuzzState, FinalJeopardyState, SessionPlayer, ChannelMessage } from '../../types/session'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { PlayerEntry } from '../../components/game/PlayerEntry'
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
import { applyModifiers, computeLowestPositiveBalance } from '../../utils/gameToggles'
import { calculateBoardTotal, calculateTargetScore, applyCoopScoring, getCoopDailyDoubleMaxWager } from '../../utils/coopScoring'
import { useClueTimer } from '../../hooks/useClueTimer'
import { ActiveRulesIndicator } from '../../components/game/ActiveRulesIndicator'
import { GameSettingsPanel } from '../../components/game/GameSettingsPanel'
import { DEFAULT_TOGGLE_CONFIG } from '../../types/game'
import { CategoryAuction } from '../../components/game/CategoryAuction'
import { BettingSideGames } from '../../components/game/BettingSideGames'
import { AuctionStatusView } from '../../components/host/AuctionStatusView'
import { AuctionResultView } from '../../components/host/AuctionResultView'
import type { AuctionResultSummary } from '../../components/host/AuctionResultView'
import { BettingStatusView } from '../../components/host/BettingStatusView'
import { initializeGamblingScores, getCategoryOwnerMultiplier, resolveAuctionBids, appendLedgerEntry, computeRoundResult, BET_DESCRIPTIONS, shouldAutoResolveAuction } from '../../utils/gamblingScoring'
import { beginGamblingPhases, budgetViews, discardGamblingPhases, eligibleBidders, isAdmissibleCommitment, unspentBudget } from '../../utils/gamblingAllowance'
import { fundingSourceOf, settlePlacedWagers, settleRoundBets, settleWinningBid } from '../../utils/gamblingSettlement'
import type { GamblingBudgetState } from '../../utils/gamblingAllowance'

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

type SubmittedBet = { betType: string; wager: number; prediction: string }

/**
 * Runtime shape assertion for a `betting_submitted` payload.
 *
 * The `ChannelMessage` union member gives us the compile-time check, but the
 * payload crosses the realtime wire, where a peer on an older build could still
 * send a drifted shape. Both checks together are what caught the original bug.
 */
function isValidSubmittedBets(bets: unknown): bets is SubmittedBet[] {
  return (
    Array.isArray(bets) &&
    bets.every((bet) => {
      if (typeof bet !== 'object' || bet === null) return false
      const b = bet as Partial<SubmittedBet>
      return (
        typeof b.betType === 'string' &&
        typeof b.wager === 'number' &&
        Number.isFinite(b.wager) &&
        typeof b.prediction === 'string'
      )
    })
  )
}

export function GamePage() {
  const { gameId } = useParams({ strict: false }) as { gameId: string }
  const navigate = useNavigate()
  const locationState = useRouterState({ select: (s) => s.location.state }) as { fromLibrary?: boolean }
  const fromLibrary = locationState?.fromLibrary ?? false

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [game, setGame] = useState<NormalizedGame | null>(null)
  const [session, setSession] = useState<GameSession | null>(null)
  const sessionRef = useRef<GameSession | null>(null)
  // Keep ref in sync so setTimeout callbacks always have latest session
  useEffect(() => { sessionRef.current = session }, [session])
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
  // Mirror of `sessionId` for the auction/betting callbacks, which are memoised
  // with empty deps and read their inputs off refs.
  const sessionIdRef = useRef<string | null>(null)
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])
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

  // ─── Round tracking state for expanded bet resolution ────────────────────
  const [roundAnswerEvents, setRoundAnswerEvents] = useState<ClueAnswerEvent[]>([])
  const [startOfRoundScores, setStartOfRoundScores] = useState<Record<string, number>>({})
  const [dailyDoubleFinderPlayer, setDailyDoubleFinderPlayer] = useState<string | null>(null)
  const roundAnswerOrderRef = useRef(0)

  // Steal bonus tracking (Task 9.5)
  const [stealBonusAwardedTo, setStealBonusAwardedTo] = useState<string | null>(null)

  // Co-op Final Jeopardy wager tracking
  const coopFjWagerRef = useRef<number>(0)

  // ─── Multiplayer auction state ───────────────────────────────────────────
  const [auctionCategoryIndex, setAuctionCategoryIndex] = useState(0)
  const [auctionReceivedBids, setAuctionReceivedBids] = useState<Record<string, number>>({})
  const [auctionTimeRemaining, setAuctionTimeRemaining] = useState<number | null>(null)
  const [auctionIsRetry, setAuctionIsRetry] = useState(false)
  const [auctionResult, setAuctionResult] = useState<AuctionResultSummary | null>(null)
  const auctionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const auctionResolvedRef = useRef(false)
  const startBettingRef = useRef<() => void>(() => {})

  // ─── Gambling_Allowance budget state ─────────────────────────────────────
  // One record covering a round's Auction_Phase + Betting_Phase. Classification
  // and start-of-phase balances are frozen when the auction begins, so a
  // mid-round balance change never moves a player between funding sources
  // (Requirements 1.11, 1.12). The ref mirrors the state so the broadcast
  // callbacks — which are stable and read only from refs — always see the
  // latest budget.
  const [budgetState, setBudgetState] = useState<GamblingBudgetState | null>(null)
  const budgetStateRef = useRef<GamblingBudgetState | null>(null)
  useEffect(() => { budgetStateRef.current = budgetState }, [budgetState])

  // ─── Multiplayer betting state ───────────────────────────────────────────
  const [bettingReceivedBets, setBettingReceivedBets] = useState<Record<string, { count: number; totalWagered: number }>>({})
  const [bettingPlayersDone, setBettingPlayersDone] = useState<Set<string>>(new Set())
  const bettingResolvedRef = useRef(false)
  const bettingCollectedBetsRef = useRef<Array<{ playerName: string; betType: string; wager: number; prediction: string }>>([])




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
    const controller = new AbortController()

    async function loadGame() {
      try {
        // Get game metadata including storage_path from games table
        const { data: gameRow, error: fetchErr } = await supabase
          .from('games')
          .select('game_name, created_by, source, storage_path')
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

        // Download game file — use storage_path if available (single request)
        let fileData: Blob | null = null

        if (gameRow.storage_path) {
          const { data, error: downloadErr } = await supabase.storage
            .from('games')
            .download(gameRow.storage_path as string)
          if (!downloadErr && data) fileData = data
        }

        // Fallback chain for games without storage_path
        if (!fileData) {
          let authFolder: string
          if (gameRow.created_by) {
            const { data: creatorData } = await supabase
              .from('players')
              .select('auth_uuid')
              .eq('id', gameRow.created_by)
              .single()
            authFolder = creatorData?.auth_uuid ?? user.id
          } else {
            authFolder = user.id
          }

          const gameName = gameRow.game_name as string
          const basePath = `${authFolder}/${gameName}.json`

          const { data: d1, error: e1 } = await supabase.storage.from('games').download(basePath)
          if (!e1 && d1) {
            fileData = d1
          } else if (authFolder !== user.id) {
            const { data: d2, error: e2 } = await supabase.storage.from('games').download(`${user.id}/${gameName}.json`)
            if (!e2 && d2) fileData = d2
          }

          if (!fileData) {
            const { data: d3 } = await supabase.storage.from('games').download(`${gameRow.game_name as string}.json`)
            if (d3) fileData = d3
          }
        }

        if (!fileData) {
          setError('Could not load game file.')
          setLoading(false)
          return
        }

        if (controller.signal.aborted) return

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
        if (!controller.signal.aborted) {
          setError('Failed to load game.')
          setLoading(false)
        }
      }
    }

    loadGame()

    return () => { controller.abort() }
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
              case 'auction_bid':
                // Collect auction bids from player devices
                setAuctionReceivedBids(prev => ({
                  ...prev,
                  [message.playerName]: message.amount,
                }))
                break
              case 'betting_placed':
                // Collect betting placed messages from player devices
                bettingCollectedBetsRef.current = [
                  ...bettingCollectedBetsRef.current,
                  { playerName: message.playerName, betType: message.betType, wager: message.wager, prediction: message.prediction },
                ]
                setBettingReceivedBets(prev => {
                  const existing = prev[message.playerName] ?? { count: 0, totalWagered: 0 }
                  return {
                    ...prev,
                    [message.playerName]: {
                      count: existing.count + 1,
                      totalWagered: existing.totalWagered + message.wager,
                    },
                  }
                })
                break
              case 'betting_submitted': {
                // Batch submission: process all bets from a player at once.
                // Shape is checked by the ChannelMessage union at compile time
                // and re-checked here because the payload crosses the wire.
                const { playerName, bets } = message
                if (typeof playerName !== 'string' || !isValidSubmittedBets(bets)) {
                  console.warn('[Session] Ignoring malformed betting_submitted payload:', message)
                  break
                }
                for (const bet of bets) {
                  bettingCollectedBetsRef.current = [
                    ...bettingCollectedBetsRef.current,
                    { playerName, betType: bet.betType, wager: bet.wager, prediction: bet.prediction },
                  ]
                }
                setBettingReceivedBets(prev => {
                  const existing = prev[playerName] ?? { count: 0, totalWagered: 0 }
                  const totalNewWager = bets.reduce((sum, b) => sum + b.wager, 0)
                  return {
                    ...prev,
                    [playerName]: {
                      count: existing.count + bets.length,
                      totalWagered: existing.totalWagered + totalNewWager,
                    },
                  }
                })
                // Auto-mark player as done after batch submission
                setBettingPlayersDone(prev => new Set([...prev, playerName]))
                break
              }
              case 'betting_done':
                // Player finished betting (done or skipped)
                setBettingPlayersDone(prev => new Set([...prev, message.playerName]))
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
      // Final Jeopardy is not a gambling sub-phase, so clear any persisted
      // auction/betting state left from the previous round.
      updateGamblingState(sessionId, null).catch(() => {})

      // The wager range inputs, frozen for the whole phase. The
      // Lowest_Positive_Balance is computed once here, from the balances held at
      // the instant the wager phase begins, and persisted next to the configured
      // floor so the host surface (`WagerEntry`) and the player surface
      // (`FinalJeopardyEntryPage`) derive one identical range — including on a
      // device that loads after the phase change. Never recomputed in-phase.
      // Requirements: 4.7, 4.9, 4.10
      const wagerConfig: NonNullable<FinalJeopardyState['wagerConfig']> | null = session
        ? {
            wagerFloor: session.toggleConfig.wagering.wagerFloor,
            lowestPositiveBalance: computeLowestPositiveBalance(session.players),
          }
        : null

      // Write the phase config to the DB FIRST (before the phase change), so players see it on fetchSession
      if (session?.toggleConfig.coop.enabled) {
        updateFinalJeopardyState(sessionId, {
          wagers: [],
          submissions: [],
          revealedIndex: -1,
          coopMode: true,
          ...(wagerConfig ? { wagerConfig } : {}),
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
      } else if (wagerConfig) {
        // Competitive mode: same sequencing as co-op — the frozen wagerConfig has
        // to be in the DB before the phase change reaches a player device, or that
        // device would fall back to its own locally computed range.
        updateFinalJeopardyState(sessionId, {
          wagers: [],
          submissions: [],
          revealedIndex: -1,
          wagerConfig,
        }).then(() => {
          // Only broadcast phase change AFTER DB write completes
          updateSessionPhase(sessionId, 'final-jeopardy').catch(() => {})
          if (sessionChannelRef.current) {
            broadcastMessage(sessionChannelRef.current, { type: 'phase_change', phase: 'final-jeopardy' }).catch(() => {})
          }
        }).catch(() => {
          // Still broadcast even if DB write fails
          updateSessionPhase(sessionId, 'final-jeopardy').catch(() => {})
          if (sessionChannelRef.current) {
            broadcastMessage(sessionChannelRef.current, { type: 'phase_change', phase: 'final-jeopardy' }).catch(() => {})
          }
        })
      } else {
        // No session loaded, so there are no balances to freeze and nothing to write
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
      // Normal play has resumed (e.g. after the Betting_Phase settles into
      // 'category-reveal'), so clear any persisted gambling sub-phase — a device
      // recovering from the DB then leaves the auction/betting panel.
      updateGamblingState(sessionId, null).catch(() => {})
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, { type: 'buzz_state_sync', buzzState: newBuzzState }).catch(() => {})
      }
    } else if (phase === 'daily-double' || phase === 'daily-double-wager' || phase === 'wager-entry' || phase === 'round-transition' || phase === 'category-auction' || phase === 'betting') {
      updateSessionPhase(sessionId, 'buzzer').catch(() => {})
      // Clear the persisted gambling sub-phase whenever normal play resumes, but
      // NOT on entry to 'category-auction' / 'betting' themselves — those phases
      // persist their own gambling_state via startAuctionForCategory / startBetting.
      if (phase !== 'category-auction' && phase !== 'betting') {
        updateGamblingState(sessionId, null).catch(() => {})
      }
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

    // Initialize player scores with gambling starting balance if Gambling Problem mode is enabled
    const initializedPlayers = config.gambling.enabled
      ? initializeGamblingScores(players, config.gambling.startingBalance)
      : players

    setSession({
      game,
      gameId,
      players: initializedPlayers,
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
      gamblingLedger: [],
      categoryOwnership: {},
      activeSideBets: [],
    })

    // If gambling mode is on, go to auction first before category reveal
    if (config.gambling.enabled) {
      setPhase('category-auction')
    } else {
      setPhase('category-reveal')
    }

    // Snapshot start-of-round scores and reset round tracking for round 0
    const scoreSnapshot: Record<string, number> = {}
    for (const p of initializedPlayers) {
      scoreSnapshot[p.name] = p.score
    }
    setStartOfRoundScores(scoreSnapshot)
    setRoundAnswerEvents([])
    setDailyDoubleFinderPlayer(null)
    roundAnswerOrderRef.current = 0

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
    // Track the DD finder for round result computation (only first DD per round)
    if (dailyDoubleFinderPlayer === null) {
      setDailyDoubleFinderPlayer(playerName)
    }
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

      // ─── Track ClueAnswerEvent for round result computation (co-op) ───────
      if (result === 'correct' || result === 'incorrect') {
        setRoundAnswerEvents(prevEvents => {
          const filtered = prevEvents.filter(e => !(e.playerName === playerName && e.clueKey === key))
          const newEvent: ClueAnswerEvent = {
            playerName,
            clueKey: key,
            result,
            pointValue,
            // Co-op applies no category-ownership multiplier, so the credited
            // amount is the raw point value. Set explicitly rather than
            // relying on the `earnedPoints ?? pointValue` fallback.
            earnedPoints: pointValue,
            chronologicalOrder: roundAnswerOrderRef.current++,
            categoryIndex: activeClue.categoryIndex,
          }
          return [...filtered, newEvent]
        })
      } else {
        setRoundAnswerEvents(prevEvents =>
          prevEvents.filter(e => !(e.playerName === playerName && e.clueKey === key))
        )
      }

      return
    }

    // ─── Competitive Mode scoring (unchanged) ───────────────────────────────

    // Apply category ownership multiplier (Gambling Problem mode)
    const gamblingMultiplier = session.toggleConfig.gambling.enabled
      ? getCategoryOwnerMultiplier(activeClue.roundName, activeClue.categoryIndex, playerName, session.categoryOwnership)
      : 1

    // Determine whether to use applyModifiers (non-DD clues with any enabled modifier)
    const hasModifiers =
      session.toggleConfig.rulesEngine.enabled ||
      session.toggleConfig.wagering.enabled
    const useModifiers = hasModifiers && !clue.dailyDouble

    // Track updated streak and perRoundIncorrect for session state
    const updatedStreakCounts = { ...session.streakCounts }
    const updatedPerRoundIncorrect = { ...session.perRoundIncorrect }

    // Points actually credited for this event, computed once here so the score
    // update below and the recorded ClueAnswerEvent read the same number.
    let creditedPointValue: number
    if (useModifiers) {
      // Determine base value: use wager if wagering is active and player has a recorded wager
      let baseValue = clue.value
      if (session.toggleConfig.wagering.enabled && session.activeWagers && session.activeWagers[playerName] != null) {
        baseValue = session.activeWagers[playerName]
      }
      // Apply gambling ownership multiplier to base value
      creditedPointValue = baseValue * gamblingMultiplier
    } else {
      creditedPointValue = pointValue * gamblingMultiplier
    }

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
        // Modifier-adjusted base value, already multiplier-applied (hoisted above)
        const baseValue = creditedPointValue

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
        // Gambling multiplier already applied when hoisting creditedPointValue
        const effectivePointValue = creditedPointValue

        // Reverse previous marking
        if (prev === 'correct') { newScore -= effectivePointValue; newCorrect--; newTotalEarned -= effectivePointValue }
        if (prev === 'incorrect') { newScore += effectivePointValue; newIncorrect-- }

        // Apply new marking (null means unmark — only reverse was needed)
        if (result === 'correct') { newScore += effectivePointValue; newCorrect++; newTotalEarned += effectivePointValue }
        if (result === 'incorrect') { newScore -= effectivePointValue; newIncorrect++ }
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

    // ─── Ownership bonus ledger tracking ──────────────────────────────────
    let updatedLedger = session.gamblingLedger
    if (session.toggleConfig.gambling.enabled && gamblingMultiplier === 2 && result === 'correct') {
      // The bonus is the extra points earned from the 2x multiplier (i.e., the base clue value)
      const bonusAmount = clue.dailyDouble && ddWager != null ? ddWager : (
        session.toggleConfig.wagering.enabled && session.activeWagers && session.activeWagers[playerName] != null
          ? session.activeWagers[playerName]
          : clue.value
      )
      const categoryName = session.game.rounds[activeClue.roundName][activeClue.categoryIndex].category
      updatedLedger = appendLedgerEntry(updatedLedger, {
        type: 'ownership_bonus',
        playerName,
        amount: bonusAmount,
        label: categoryName,
      })
    }

    setSession({
      ...session,
      players: updatedPlayers,
      clueStates: updatedClueStates,
      streakCounts: updatedStreakCounts,
      perRoundIncorrect: updatedPerRoundIncorrect,
      gamblingLedger: updatedLedger,
    })

    // ─── Track ClueAnswerEvent for round result computation ─────────────────
    if (result === 'correct' || result === 'incorrect') {
      setRoundAnswerEvents(prevEvents => {
        // Remove any existing event for this player+clue (handles re-marking)
        const filtered = prevEvents.filter(e => !(e.playerName === playerName && e.clueKey === key))
        const newEvent: ClueAnswerEvent = {
          playerName,
          clueKey: key,
          result,
          pointValue,
          // Points actually credited, including the category-ownership multiplier
          earnedPoints: creditedPointValue,
          chronologicalOrder: roundAnswerOrderRef.current++,
          categoryIndex: activeClue.categoryIndex,
        }
        return [...filtered, newEvent]
      })
    } else {
      // result is null (unmarking) — remove any existing event for this player+clue
      setRoundAnswerEvents(prevEvents =>
        prevEvents.filter(e => !(e.playerName === playerName && e.clueKey === key))
      )
    }
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
      // Resolve side bets if gambling mode is active
      if (updatedSession.toggleConfig.gambling.enabled && updatedSession.activeSideBets.length > 0) {
        const roundName2 = updatedSession.orderedRoundNames[updatedSession.currentRoundIndex]
        const cats = updatedSession.game.rounds[roundName2]

        // Build cluesPerCategory for round tracking data
        const cluesPerCategory: Record<number, number> = {}
        for (let catIdx = 0; catIdx < cats.length; catIdx++) {
          cluesPerCategory[catIdx] = cats[catIdx].clues.length
        }

        // Construct RoundTrackingData from accumulated state
        const trackingData: RoundTrackingData = {
          players: updatedSession.players,
          startOfRoundScores,
          answerEvents: roundAnswerEvents,
          dailyDoubleFinderPlayer,
          cluesPerCategory,
        }

        // 1. Compute round result
        const roundResult = computeRoundResult(trackingData)

        // 2. Resolve round bets, funding-aware. A won bet funded from
        // Real_Balance is credited `wager * 2` (its wager having been deducted
        // when it was placed) and a won allowance-funded bet is credited
        // `wager * 1`, so the net Real_Balance change is `+wager` either way. A
        // lost bet applies no further change. Nothing is clamped at $0, so a
        // player at -$1,000 who wins a $500 allowance-funded bet lands at -$500.
        // `bet_won.amount` is the credit applied and `bet_lost.amount` is the
        // wager (Requirements 2.4, 2.5, 2.6, 2.12).
        const betSettlement = settleRoundBets(
          {
            players: updatedSession.players,
            ledger: updatedSession.gamblingLedger,
          },
          updatedSession.activeSideBets,
          roundResult,
        )

        // 3. `settleRoundBets` returns the ledger with every bet_won / bet_lost
        // entry already appended in bet order.
        const updatedPlayersWithPayouts = betSettlement.players
        const updatedLedger = betSettlement.ledger

        // 4. Update session with resolved players, updated ledger, and clear activeSideBets
        setSession(prev => prev ? {
          ...prev,
          ...updatedSession,
          players: updatedPlayersWithPayouts,
          gamblingLedger: updatedLedger,
          activeSideBets: [],
        } : prev)

        // 5. Broadcast gambling_balance_update with updated scores (multiplayer)
        if (sessionChannelRef.current) {
          const updatedBalances: Record<string, number> = {}
          for (const p of updatedPlayersWithPayouts) {
            updatedBalances[p.name] = p.score
          }
          broadcastMessage(sessionChannelRef.current, {
            type: 'gambling_balance_update',
            balances: updatedBalances,
          }).catch(() => {})
        }
      }

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

      // Reset round tracking state for the new round
      const scoreSnapshot: Record<string, number> = {}
      for (const p of session.players) {
        scoreSnapshot[p.name] = p.score
      }
      setStartOfRoundScores(scoreSnapshot)
      setRoundAnswerEvents([])
      setDailyDoubleFinderPlayer(null)
      roundAnswerOrderRef.current = 0

      // If gambling mode is active, resolve bets from previous round and go to auction
      if (session.toggleConfig.gambling.enabled) {
        setPhase('category-auction')
      } else {
        setPhase('category-reveal')
      }
    }
  }

  function handleFJComplete(updatedPlayers: Player[]) {
    if (!session) return
    setSession({ ...session, players: updatedPlayers })
    setPhase('game-over')
  }

  // ─── Multiplayer Auction Logic ───────────────────────────────────────────

  // Derived multiplayer check — reads ref; required for conditional rendering and effect guards.
  // The ref read is safe: sessionChannelRef is set once during session creation and never mutates during gameplay.
  /* eslint-disable react-hooks/refs */
  const isMultiplayer = sessionId !== null && sessionChannelRef.current !== null

  /**
   * Start auctioning a specific category in multiplayer mode.
   * Broadcasts auction_start and begins the countdown timer.
   */
  const startAuctionForCategory = useCallback((catIndex: number, isRetry: boolean) => {
    const currentSession = sessionRef.current
    if (!currentSession || !sessionChannelRef.current) return

    const roundName = currentSession.orderedRoundNames[currentSession.currentRoundIndex]
    const categories = currentSession.game.rounds[roundName]
    const category = categories[catIndex]
    const timerDuration = currentSession.toggleConfig.gambling.auctionTimer

    setAuctionCategoryIndex(catIndex)
    setAuctionReceivedBids({})
    setAuctionIsRetry(isRetry)
    setAuctionResult(null)
    setAuctionTimeRemaining(timerDuration)
    auctionResolvedRef.current = false

    // Build player balances to send (from ref to get latest scores)
    const playerBalances: Record<string, number> = {}
    for (const p of currentSession.players) {
      playerBalances[p.name] = p.score
    }

    // Spendable_Budget views for the bid panels (Requirements 1.3, 1.7, 1.13)
    const currentBudgetState = budgetStateRef.current
    const budgets = currentBudgetState
      ? budgetViews(currentBudgetState, currentSession.players)
      : undefined

    // Persist the auction sub-phase before broadcasting (persist-then-broadcast,
    // mirroring the Final Jeopardy path), so a device that misses the ephemeral
    // broadcast — or refreshes — recovers this same category from the DB instead
    // of being stranded on the locked buzzer.
    if (sessionIdRef.current) {
      updateGamblingState(sessionIdRef.current, {
        phase: 'auction',
        auction: { category: category.category, categoryIndex: catIndex, roundName, timerDuration, playerBalances, budgets },
      }).catch(() => {})
    }

    // Broadcast auction_start to player devices
    broadcastMessage(sessionChannelRef.current, {
      type: 'auction_start',
      category: category.category,
      categoryIndex: catIndex,
      roundName,
      timerDuration,
      playerBalances,
      budgets,
    }).catch(() => {})

    // Start countdown timer
    if (auctionTimerRef.current) {
      clearInterval(auctionTimerRef.current)
    }
    auctionTimerRef.current = setInterval(() => {
      setAuctionTimeRemaining(prev => {
        if (prev === null) return null
        if (prev <= 1) {
          if (auctionTimerRef.current) {
            clearInterval(auctionTimerRef.current)
            auctionTimerRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  /**
   * Resolve the current auction after timer expires or force-end.
   * Determines winner, applies deduction, appends ledger entry, broadcasts result.
   */
  const resolveCurrentAuction = useCallback(() => {
    if (!session || auctionResolvedRef.current) return
    auctionResolvedRef.current = true

    // Clear timer
    if (auctionTimerRef.current) {
      clearInterval(auctionTimerRef.current)
      auctionTimerRef.current = null
    }

    const roundName = session.orderedRoundNames[session.currentRoundIndex]
    const categories = session.game.rounds[roundName]
    const categoryName = categories[auctionCategoryIndex].category

    // The controller's authoritative Spendable_Budget for this round. The frozen
    // classification is normally created on entry to `category-auction`; the
    // fallback keeps resolution well-defined if it is ever missing.
    const authoritativeBudgetState = budgetStateRef.current ?? beginGamblingPhases(session.players)

    // Requirements 2.10, 2.11 — re-validate every bid that arrived over the
    // channel against that budget state before a winner is picked, so a bid of
    // $0 or less, or one beyond the player's unspent budget, is dropped here:
    // it cannot win, cannot force a tie, and leaves no ledger entry and no
    // balance change behind.
    const admissibleBids: Record<string, number> = {}
    for (const [playerName, amount] of Object.entries(auctionReceivedBids)) {
      if (isAdmissibleCommitment(amount, unspentBudget(authoritativeBudgetState, playerName))) {
        admissibleBids[playerName] = amount
      }
    }

    const result = resolveAuctionBids(admissibleBids, auctionIsRetry)

    if (result.isTied && !auctionIsRetry) {
      // First tie — show tie result, then trigger rebid
      setAuctionResult({ winner: null, winningBid: result.winningBid, categoryName, isTied: true, isReleased: false })

      setTimeout(() => {
        setAuctionResult(null)
        startAuctionForCategory(auctionCategoryIndex, true)
      }, 2500)

      // Broadcast result indicating tie/rebid
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, {
          type: 'auction_result',
          categoryIndex: auctionCategoryIndex,
          winner: null,
          winningBid: result.winningBid,
        }).catch(() => {})
      }
      return
    }

    // Winner determined (or second tie = release).
    // Settlement is funding-aware and lives in `gamblingSettlement`: an
    // allowance-funded winning bid only draws the Gambling_Allowance down and
    // leaves Real_Balance alone, a Real_Balance-funded bid is deducted and drawn
    // down, ownership is recorded identically either way, and the `bid` ledger
    // entry carries `fundedBy` (Requirements 2.1, 2.2, 2.9, 2.11).
    const settlement = settleWinningBid(
      {
        budgetState: authoritativeBudgetState,
        players: session.players,
        ledger: session.gamblingLedger,
        ownership: session.categoryOwnership,
      },
      {
        winner: result.winner,
        winningBid: result.winningBid,
        category: categoryName,
        roundName,
        categoryIndex: auctionCategoryIndex,
      },
    )

    const updatedPlayers = settlement.players
    const updatedLedger = settlement.ledger
    const updatedOwnership = { ...settlement.ownership }

    // A losing or dropped bid commits nothing, so the pool stays spendable for
    // the rest of the Auction_Phase and the Betting_Phase (Requirement 2.8).
    budgetStateRef.current = settlement.budgetState
    setBudgetState(settlement.budgetState)

    // Update session state
    setSession(prev => prev ? {
      ...prev,
      players: updatedPlayers,
      gamblingLedger: updatedLedger,
      categoryOwnership: updatedOwnership,
    } : prev)

    // Broadcast auction result
    if (sessionChannelRef.current) {
      broadcastMessage(sessionChannelRef.current, {
        type: 'auction_result',
        categoryIndex: auctionCategoryIndex,
        winner: result.winner,
        winningBid: result.winningBid,
      }).catch(() => {})

      // Broadcast updated balances after each category auction so player devices stay in sync
      const updatedBalancesAfterBid: Record<string, number> = {}
      for (const p of updatedPlayers) {
        updatedBalancesAfterBid[p.name] = p.score
      }
      broadcastMessage(sessionChannelRef.current, {
        type: 'gambling_balance_update',
        balances: updatedBalancesAfterBid,
      }).catch(() => {})
    }

    // Show auction result on host page
    setAuctionResult({
      winner: result.winner,
      winningBid: result.winningBid,
      categoryName,
      isTied: result.isTied,
      isReleased: result.isTied && !result.winner, // second tie = released
    })

    // Move to next category or complete auction phase
    const nextCatIndex = auctionCategoryIndex + 1
    if (nextCatIndex < categories.length) {
      // Brief delay to show result before starting next category auction
      setTimeout(() => {
        setAuctionResult(null)
        startAuctionForCategory(nextCatIndex, false)
      }, 3000)
    } else {
      // All categories auctioned — broadcast auction_complete and move to betting
      if (sessionChannelRef.current) {
        broadcastMessage(sessionChannelRef.current, {
          type: 'auction_complete',
          ownership: updatedOwnership,
        }).catch(() => {})

        // Broadcast updated balances
        const updatedBalances: Record<string, number> = {}
        for (const p of updatedPlayers) {
          updatedBalances[p.name] = p.score
        }
        broadcastMessage(sessionChannelRef.current, {
          type: 'gambling_balance_update',
          balances: updatedBalances,
        }).catch(() => {})
      }

      // Transition to betting phase after showing result
      setTimeout(() => {
        setAuctionResult(null)
        setPhase('betting')
        // Directly start the multiplayer betting broadcast (don't rely on effect timing)
        if (sessionChannelRef.current) {
          startBettingRef.current()
        }
      }, 2500)
    }
  }, [session, auctionCategoryIndex, auctionReceivedBids, auctionIsRetry, startAuctionForCategory])

  // Effect: auto-resolve auction when timer reaches 0
  useEffect(() => {
    if (phase !== 'category-auction' || !isMultiplayer) return
    if (shouldAutoResolveAuction(auctionTimeRemaining) && !auctionResolvedRef.current && session) {
      resolveCurrentAuction()
    }
  }, [auctionTimeRemaining, phase, isMultiplayer, session, resolveCurrentAuction])

  // Effect: auto-resolve auction when all players have bid
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (phase !== 'category-auction' || !isMultiplayer || !session) return
    if (auctionResolvedRef.current) return

    // Only players who can still commit at least $1 gate the auction, so a
    // player with no spendable budget left does not stall it (Requirement 1.8)
    const bidders = budgetState ? eligibleBidders(budgetState, session.players) : session.players
    const allPlayersBid = bidders.every(p => p.name in auctionReceivedBids)
    if (allPlayersBid && Object.keys(auctionReceivedBids).length > 0) {
      resolveCurrentAuction()
    }
  }, [auctionReceivedBids, phase, isMultiplayer, session, budgetState, resolveCurrentAuction])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Effect: start auction for first category when entering auction phase in multiplayer
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (phase !== 'category-auction' || !isMultiplayer || !session) return

    // Grant the Gambling_Allowance and freeze the classification before the
    // first auction broadcast (Requirements 1.1, 1.2). The ref is set first so
    // startAuctionForCategory sees the budget on this same tick.
    const freshBudgetState = beginGamblingPhases(session.players)
    budgetStateRef.current = freshBudgetState
    setBudgetState(freshBudgetState)

    // Start the auction for the first category
    startAuctionForCategory(0, false)

    return () => {
      if (auctionTimerRef.current) {
        clearInterval(auctionTimerRef.current)
        auctionTimerRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isMultiplayer])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ─── Multiplayer Betting Logic ──────────────────────────────────────────────

  /**
   * Start the multiplayer betting phase.
   * Broadcasts betting_start to player devices. No timer — ends when all players are done or host force-ends.
   */
  const startBetting = useCallback(() => {
    const currentSession = sessionRef.current
    if (!currentSession || !sessionChannelRef.current) return

    const roundName = currentSession.orderedRoundNames[currentSession.currentRoundIndex]
    const categories = currentSession.game.rounds[roundName]
    const timerDuration = currentSession.toggleConfig.gambling.auctionTimer
    const roundHasDailyDouble = categories.some(cat =>
      cat.clues.some(clue => clue.dailyDouble)
    )

    // Reset betting state
    setBettingReceivedBets({})
    setBettingPlayersDone(new Set())
    bettingResolvedRef.current = false
    bettingCollectedBetsRef.current = []

    // Build available bet types
    const availableBets: { betType: string; description: string }[] = [
      { betType: 'round_leader', description: BET_DESCRIPTIONS.round_leader },
      { betType: 'most_incorrect', description: BET_DESCRIPTIONS.most_incorrect },
      { betType: 'sweep_category', description: BET_DESCRIPTIONS.sweep_category },
      { betType: 'zero_score_round', description: BET_DESCRIPTIONS.zero_score_round },
      { betType: 'no_wrong_answers', description: BET_DESCRIPTIONS.no_wrong_answers },
      { betType: 'highest_single_clue', description: BET_DESCRIPTIONS.highest_single_clue },
      { betType: 'most_correct', description: BET_DESCRIPTIONS.most_correct },
      { betType: 'first_incorrect', description: BET_DESCRIPTIONS.first_incorrect },
      { betType: 'biggest_earner', description: BET_DESCRIPTIONS.biggest_earner },
      { betType: 'bottom_feeder', description: BET_DESCRIPTIONS.bottom_feeder },
    ]
    if (roundHasDailyDouble) {
      availableBets.push({ betType: 'daily_double_finder', description: BET_DESCRIPTIONS.daily_double_finder })
    }

    // Build player balances (from ref to get latest scores)
    const playerBalances: Record<string, number> = {}
    for (const p of currentSession.players) {
      playerBalances[p.name] = p.score
    }

    // Budget views carry the post-auction pool, so the betting panel starts from
    // the same $500 the auction already drew down (Requirement 1.4)
    const currentBudgetState = budgetStateRef.current
    const budgets = currentBudgetState
      ? budgetViews(currentBudgetState, currentSession.players)
      : undefined

    // Persist the betting sub-phase before broadcasting, so a device that misses
    // the ephemeral broadcast — or refreshes — recovers the betting panel from
    // the DB instead of being stranded on the locked buzzer.
    if (sessionIdRef.current) {
      updateGamblingState(sessionIdRef.current, {
        phase: 'betting',
        betting: { availableBets, timerDuration, playerBalances, budgets },
      }).catch(() => {})
    }

    // Broadcast betting_start to player devices
    broadcastMessage(sessionChannelRef.current, {
      type: 'betting_start',
      availableBets,
      timerDuration,
      playerBalances,
      budgets,
    }).catch(() => {})
  }, [])
  startBettingRef.current = startBetting

  /**
   * Finalize the multiplayer betting phase.
   * Applies wager deductions, appends ledger entries, stores bets, and broadcasts completion.
   */
  const finalizeBetting = useCallback(() => {
    if (!session || bettingResolvedRef.current) return
    bettingResolvedRef.current = true

    const collectedBets = bettingCollectedBetsRef.current

    // The controller's authoritative Spendable_Budget for this round, already
    // drawn down by any winning bids. The fallback keeps settlement
    // well-defined if the classification is ever missing.
    const authoritativeBudgetState = budgetStateRef.current ?? beginGamblingPhases(session.players)

    // Settle every collected wager in submission order. Each accepted wager
    // draws the shared pool down before the next is checked, so the cumulative
    // limit holds across the batch; a wager of $0 or less, or one beyond the
    // player's unspent budget, is rejected with no ledger entry and no balance
    // change. An allowance-funded wager only draws the Gambling_Allowance down
    // and leaves Real_Balance alone; a Real_Balance-funded wager is deducted
    // from `Player.score`. Both the `bet_placed` entry and the stored `SideBet`
    // carry `fundedBy`, so round-end resolution and analytics stay
    // funding-aware after the allowance is discarded
    // (Requirements 1.4, 2.3, 2.9, 2.10, 2.11).
    const settlement = settlePlacedWagers(
      {
        budgetState: authoritativeBudgetState,
        players: session.players,
        ledger: session.gamblingLedger,
      },
      collectedBets.map(bet => ({
        playerName: bet.playerName,
        betType: bet.betType as SideBetType,
        wager: bet.wager,
        prediction: bet.prediction,
      })),
    )

    const updatedPlayers = settlement.players
    const updatedLedger = settlement.ledger
    const activeSideBets = settlement.bets

    // Requirement 1.9 — the Betting_Phase has ended, so every unspent
    // Gambling_Allowance is discarded. Real_Balance is untouched by the
    // discard, and the next round's budgets come from a fresh
    // `beginGamblingPhases` call on entry to that round's Auction_Phase.
    const discardedBudgetState = discardGamblingPhases()
    budgetStateRef.current = discardedBudgetState
    setBudgetState(discardedBudgetState)

    // Update session state
    setSession(prev => prev ? {
      ...prev,
      players: updatedPlayers,
      gamblingLedger: updatedLedger,
      activeSideBets,
    } : prev)

    // The Betting_Phase has ended and normal play resumes, so clear the
    // persisted gambling sub-phase. A device that misses `betting_complete` then
    // recovers to the board on its next reconcile instead of staying on the
    // betting panel.
    if (sessionIdRef.current) {
      updateGamblingState(sessionIdRef.current, null).catch(() => {})
    }

    // Broadcast betting_complete
    if (sessionChannelRef.current) {
      broadcastMessage(sessionChannelRef.current, {
        type: 'betting_complete',
      }).catch(() => {})

      // Broadcast updated balances
      const updatedBalances: Record<string, number> = {}
      for (const p of updatedPlayers) {
        updatedBalances[p.name] = p.score
      }
      broadcastMessage(sessionChannelRef.current, {
        type: 'gambling_balance_update',
        balances: updatedBalances,
      }).catch(() => {})
    }

    // Move to category reveal
    setPhase('category-reveal')
  }, [session])

  // Effect: start betting when entering betting phase in multiplayer mode
  useEffect(() => {
    if (phase !== 'betting' || !isMultiplayer || !session) return

    startBetting()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isMultiplayer])

  // Effect: auto-finalize betting when all players are done
  useEffect(() => {
    if (phase !== 'betting' || !isMultiplayer || !session) return
    if (bettingResolvedRef.current) return

    const allDone = session.players.every(p => bettingPlayersDone.has(p.name))
    if (allDone && bettingPlayersDone.size > 0) {
      finalizeBetting()
    }
  }, [bettingPlayersDone, phase, isMultiplayer, session, finalizeBetting])

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
                      onClick={async () => {
                        const { exportGamePdf } = await import('../../utils/exportGamePdf')
                        exportGamePdf(game, gameName ?? undefined)
                      }}
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
  const hiddenPhases: GamePhase[] = ['player-entry', 'game-over', 'category-auction', 'betting']
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
    if (phase === 'category-auction' && session) {
      const roundName = session.orderedRoundNames[session.currentRoundIndex]
      const categories = session.game.rounds[roundName]
      const categoryNames = categories.map(c => c.category)

      // Multiplayer: render AuctionStatusView (read-only host view)
      if (isMultiplayer) {
        // Show result screen after bidding resolves
        if (auctionResult) {
          return <AuctionResultView result={auctionResult} players={session.players} />
        }

        return (
          <AuctionStatusView
            category={categories[auctionCategoryIndex]?.category ?? ''}
            categoryIndex={auctionCategoryIndex}
            players={session.players}
            receivedBids={auctionReceivedBids}
            timerDuration={session.toggleConfig.gambling.auctionTimer}
            timeRemaining={auctionTimeRemaining ?? 0}
            onForceEnd={() => {
              resolveCurrentAuction()
            }}
          />
        )
      }

      // Solo: render the CategoryAuction component. It owns the Spendable_Budget
      // for the solo Auction_Phase, so the classification is frozen here with a
      // fresh `beginGamblingPhases` call (Requirements 1.1, 1.2) and each winning
      // bid comes back carrying the funding source it was drawn from, which the
      // handler writes onto the `bid` ledger entry (Requirements 2.9, 2.12).
      return (
        <CategoryAuction
          categories={categoryNames}
          roundName={roundName}
          players={session.players}
          budgetState={beginGamblingPhases(session.players)}
          auctionTimer={session.toggleConfig.gambling.auctionTimer}
          onAuctionComplete={(ownership, updatedBalances, winningBids) => {
            setSession(prev => {
              if (!prev) return prev
              // Append ledger entries for each winning bid
              let ledger = prev.gamblingLedger
              for (const bid of winningBids) {
                ledger = appendLedgerEntry(ledger, {
                  type: 'bid',
                  playerName: bid.playerName,
                  amount: bid.amount,
                  label: bid.categoryName,
                  fundedBy: bid.fundedBy,
                })
              }
              return {
                ...prev,
                categoryOwnership: { ...prev.categoryOwnership, ...ownership },
                players: prev.players.map(p => ({
                  ...p,
                  score: updatedBalances[p.name] ?? p.score,
                })),
                gamblingLedger: ledger,
              }
            })
            // Move to betting phase
            setPhase('betting')
          }}
        />
      )
    }

    if (phase === 'betting' && session) {
      const roundName = session.orderedRoundNames[session.currentRoundIndex]
      const categories = session.game.rounds[roundName]
      // Check if this round has a Daily Double
      const roundHasDailyDouble = categories.some(cat =>
        cat.clues.some(clue => clue.dailyDouble)
      )

      // Multiplayer: render BettingStatusView (read-only host view)
      if (isMultiplayer) {
        return (
          <BettingStatusView
            players={session.players}
            receivedBets={bettingReceivedBets}
            playersDone={bettingPlayersDone}
            onForceEnd={() => {
              finalizeBetting()
            }}
          />
        )
      }

      // Solo: render existing BettingSideGames component. It validates wagers
      // against the Spendable_Budget and reports `fundedBy` on each completed bet;
      // the handler below writes that source onto the ledger entry and
      // `activeSideBets`, so round-end settlement is funding-aware. The solo path
      // has no Auction_Phase broadcast, so the budget is derived here from the
      // current player scores (Requirements 1.4, 2.3, 2.9, 2.12).
      return (
        <BettingSideGames
          players={session.players}
          budgetState={budgetState ?? beginGamblingPhases(session.players)}
          roundHasDailyDouble={roundHasDailyDouble}
          onBettingComplete={(bets, updatedBalances) => {
            const fundedBets = bets.map(bet => ({ ...bet, fundedBy: fundingSourceOf(bet) }))
            setSession(prev => {
              if (!prev) return prev
              // Append ledger entries for each bet placed
              let ledger = prev.gamblingLedger
              for (const bet of fundedBets) {
                ledger = appendLedgerEntry(ledger, {
                  type: 'bet_placed',
                  playerName: bet.playerName,
                  amount: bet.wager,
                  label: bet.betType,
                  fundedBy: bet.fundedBy,
                })
              }
              return {
                ...prev,
                activeSideBets: fundedBets,
                players: prev.players.map(p => ({
                  ...p,
                  score: updatedBalances[p.name] ?? p.score,
                })),
                gamblingLedger: ledger,
              }
            })
            // Move to category reveal then board
            setPhase('category-reveal')
          }}
        />
      )
    }

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
            categoryOwnership={session!.toggleConfig.gambling.enabled ? session!.categoryOwnership : undefined}
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
            categoryOwnerName={
              session!.toggleConfig.gambling.enabled
                ? session!.categoryOwnership[`${activeClue.roundName}-${activeClue.categoryIndex}`] ?? null
                : null
            }
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
            onExportPdf={async () => {
              const { exportCoopGamePdf } = await import('../../utils/exportGamePdf')
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
