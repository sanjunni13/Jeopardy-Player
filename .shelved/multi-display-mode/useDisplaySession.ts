import { useState, useEffect, useRef, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../utils/supabase'
import { normalizeGame } from '../utils/gameNormalizer'
import {
  createSessionChannel,
  subscribeToChannel,
  unsubscribeFromChannel,
  broadcastMessage,
  onChannelMessage,
  createReconnectionHandler,
} from '../utils/sessionChannel'
import type { ChannelMessage } from '../types/session'
import type { DisplayFullSyncPayload, DisplayPhase } from '../types/display'
import type { NormalizedGame } from '../types/game'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface DisplayPlayer {
  name: string
  score: number
}

export interface DisplayActiveClue {
  category: string
  value: number
  clueText: string
  html: boolean
  solution: string
}

export interface DisplayFJState {
  category: string
  clueText: string
  solution: string
  teamWager?: number
  submissions: Array<{ playerName: string; answer: string; wager: number; correct?: boolean }>
  revealedIndex: number
}

export interface DisplayState {
  phase: DisplayPhase
  game: NormalizedGame | null
  currentRoundIndex: number
  currentRoundName: string
  chosenClues: Set<string>
  players: DisplayPlayer[]
  activeClue: DisplayActiveClue | null
  answerRevealed: boolean
  buzzedPlayer: string | null
  buzzResult: 'correct' | 'incorrect' | null
  timerRemaining: number | null
  timerActive: boolean
  dailyDoublePlayer: string | null
  dailyDoubleWager: number | null
  fjState: DisplayFJState | null
}

export interface UseDisplaySessionResult {
  displayState: DisplayState
  connectionState: ConnectionState
  error: string | null
  hostDisconnected: boolean
}

// ─── Initial State ────────────────────────────────────────────────────────────

function createInitialDisplayState(): DisplayState {
  return {
    phase: 'waiting',
    game: null,
    currentRoundIndex: 0,
    currentRoundName: 'single',
    chosenClues: new Set<string>(),
    players: [],
    activeClue: null,
    answerRevealed: false,
    buzzedPlayer: null,
    buzzResult: null,
    timerRemaining: null,
    timerActive: false,
    dailyDoublePlayer: null,
    dailyDoubleWager: null,
    fjState: null,
  }
}

// ─── Round Order (matching GamePage) ──────────────────────────────────────────

const ROUND_ORDER = ['single', 'double', 'triple', 'quadruple', 'quintuple', 'sextuple'] as const

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages the display page's connection to a game session.
 * Fetches game data, subscribes to the realtime channel, tracks display presence,
 * and processes incoming state messages to maintain a local DisplayState.
 *
 * This hook is read-only — it never modifies game state. The only outbound messages
 * are `display_sync_request` and presence tracking.
 */
export function useDisplaySession(sessionId: string): UseDisplaySessionResult {
  const [displayState, setDisplayState] = useState<DisplayState>(createInitialDisplayState)
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [hostDisconnected, setHostDisconnected] = useState(false)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const reconnectionRef = useRef<ReturnType<typeof createReconnectionHandler> | null>(null)
  const mountedRef = useRef(true)
  const gameRef = useRef<NormalizedGame | null>(null)
  const lastMessageTimeRef = useRef<number>(0)

  // ─── Resolve Active Clue from Game Data ─────────────────────────────────

  const resolveActiveClue = useCallback(
    (roundName: string, categoryIndex: number, clueIndex: number): DisplayActiveClue | null => {
      const game = gameRef.current
      if (!game) return null

      const categories = game.rounds[roundName as keyof typeof game.rounds]
      if (!categories || !categories[categoryIndex]) return null

      const category = categories[categoryIndex]
      const clue = category.clues[clueIndex]
      if (!clue) return null

      return {
        category: category.category,
        value: clue.value,
        clueText: clue.clue,
        html: clue.html,
        solution: clue.solution,
      }
    },
    []
  )

  // ─── Load Game File from Storage Path ─────────────────────────────────

  const loadGameFile = useCallback(async (storagePath: string) => {
    try {
      const { data: fileData, error: downloadErr } = await supabase.storage
        .from('games')
        .download(storagePath)

      if (downloadErr || !fileData) return

      const text = await fileData.text()
      const raw = JSON.parse(text)

      let normalizedGame: NormalizedGame
      if (raw.rounds && raw.final && typeof raw.totalRounds === 'number') {
        normalizedGame = raw as NormalizedGame
      } else {
        const gameObj = raw.game ?? raw
        const result = normalizeGame({ game: gameObj })
        if (!result.ok) return
        normalizedGame = result.game
      }

      gameRef.current = normalizedGame

      const orderedRoundNames = ROUND_ORDER.filter(name => name in normalizedGame.rounds)
      const initialRoundName = orderedRoundNames[0] ?? 'single'

      setDisplayState(prev => ({
        ...prev,
        game: normalizedGame,
        currentRoundName: prev.currentRoundName || initialRoundName,
      }))
    } catch {
      // Non-fatal: display will work without game data (clue text won't resolve locally)
    }
  }, [])

  // ─── Handle Full Sync ───────────────────────────────────────────────────

  const handleFullSync = useCallback(
    (payload: DisplayFullSyncPayload) => {
      // If game data hasn't been loaded yet and payload includes the storage path, load it
      if (!gameRef.current && payload.gameStoragePath) {
        loadGameFile(payload.gameStoragePath)
      }

      setDisplayState(prev => {
        // Prefer activeClueContent sent directly (no game file needed)
        const activeClue = payload.activeClueContent
          ? payload.activeClueContent
          : payload.activeClue
            ? resolveActiveClue(payload.activeClue.roundName, payload.activeClue.categoryIndex, payload.activeClue.clueIndex)
            : null

        return {
          ...prev,
          phase: payload.phase,
          currentRoundIndex: payload.currentRoundIndex,
          currentRoundName: payload.currentRoundName,
          chosenClues: new Set(payload.chosenClueKeys),
          players: payload.players,
          activeClue,
          answerRevealed: payload.answerRevealed,
          timerRemaining: payload.timerRemaining,
          timerActive: payload.timerRemaining !== null,
          dailyDoublePlayer: payload.dailyDoublePlayer,
          dailyDoubleWager: payload.dailyDoubleWager,
          // Reset transient state on full sync
          buzzedPlayer: null,
          buzzResult: null,
        }
      })
    },
    [resolveActiveClue, loadGameFile]
  )

  // ─── Message Handler ────────────────────────────────────────────────────

  const handleMessage = useCallback(
    (message: ChannelMessage) => {
      // Update last message time and clear disconnect flag on any message
      lastMessageTimeRef.current = Date.now()
      setHostDisconnected(false)

      switch (message.type) {
        case 'display_full_sync':
          handleFullSync(message.state)
          break

        case 'display_clue_selected':
          setDisplayState(prev => {
            // Prefer clue data sent directly in the message (no game file needed)
            const activeClue = message.clue
              ? {
                  category: message.clue.category,
                  value: message.clue.value,
                  clueText: message.clue.clueText,
                  html: message.clue.html,
                  solution: message.clue.solution,
                }
              : resolveActiveClue(
                  message.roundName,
                  message.categoryIndex,
                  message.clueIndex
                )
            return {
              ...prev,
              phase: message.isDailyDouble ? 'daily-double' : 'clue',
              activeClue,
              answerRevealed: false,
              buzzedPlayer: null,
              buzzResult: null,
              timerRemaining: null,
              timerActive: false,
            }
          })
          break

        case 'display_answer_revealed':
          setDisplayState(prev => ({ ...prev, answerRevealed: true }))
          break

        case 'display_board_return':
          setDisplayState(prev => {
            const newChosenClues = new Set(prev.chosenClues)
            newChosenClues.add(message.clueKey)
            return {
              ...prev,
              phase: 'board',
              chosenClues: newChosenClues,
              activeClue: null,
              answerRevealed: false,
              buzzedPlayer: null,
              buzzResult: null,
              timerRemaining: null,
              timerActive: false,
              dailyDoublePlayer: null,
              dailyDoubleWager: null,
            }
          })
          break

        case 'display_scores_update':
          setDisplayState(prev => ({ ...prev, players: message.players }))
          break

        case 'display_round_transition':
          setDisplayState(prev => ({
            ...prev,
            phase: 'round-transition',
            currentRoundIndex: message.roundIndex,
            currentRoundName: message.roundName,
          }))
          break

        case 'display_phase_change':
          setDisplayState(prev => ({ ...prev, phase: message.phase }))
          break

        case 'display_buzz_in':
          setDisplayState(prev => ({
            ...prev,
            buzzedPlayer: message.playerName,
            buzzResult: null,
          }))
          break

        case 'display_buzz_result':
          setDisplayState(prev => ({
            ...prev,
            buzzedPlayer: message.playerName,
            buzzResult: message.result,
          }))
          break

        case 'display_timer_tick':
          setDisplayState(prev => ({
            ...prev,
            timerRemaining: message.remaining,
            timerActive: true,
          }))
          break

        case 'display_timer_expired':
          setDisplayState(prev => ({
            ...prev,
            timerRemaining: 0,
            timerActive: false,
          }))
          break

        case 'display_dd_player_selected':
          setDisplayState(prev => ({
            ...prev,
            phase: 'daily-double-wager',
            dailyDoublePlayer: message.playerName,
          }))
          break

        case 'display_dd_wager_confirmed':
          setDisplayState(prev => ({
            ...prev,
            phase: 'clue',
            dailyDoublePlayer: message.playerName,
            dailyDoubleWager: message.wager,
          }))
          break

        case 'display_fj_category':
          setDisplayState(prev => ({
            ...prev,
            phase: 'final-jeopardy',
            fjState: {
              category: message.category,
              clueText: '',
              solution: '',
              submissions: [],
              revealedIndex: -1,
            },
          }))
          break

        case 'display_fj_clue_revealed':
          setDisplayState(prev => ({
            ...prev,
            fjState: prev.fjState
              ? { ...prev.fjState, clueText: message.clueText }
              : null,
          }))
          break

        case 'display_fj_reveal':
          setDisplayState(prev => {
            if (!prev.fjState) return prev
            const updatedSubmissions = [...prev.fjState.submissions]
            updatedSubmissions[message.index] = message.submission
            return {
              ...prev,
              fjState: {
                ...prev.fjState,
                submissions: updatedSubmissions,
                revealedIndex: message.index,
              },
            }
          })
          break

        case 'display_game_over':
          setDisplayState(prev => ({ ...prev, phase: 'game-over' }))
          break

        case 'session_ended':
          setDisplayState(prev => ({ ...prev, phase: 'game-over' }))
          break

        default:
          // Ignore messages not relevant to the display
          break
      }
    },
    [handleFullSync, resolveActiveClue]
  )

  // ─── Request Sync ───────────────────────────────────────────────────────

  const requestSync = useCallback((channel: RealtimeChannel) => {
    broadcastMessage(channel, { type: 'display_sync_request' }).catch(() => {})
  }, [])

  // ─── Main Effect: Initialize ────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true
    let cleaned = false

    async function initialize() {
      try {
        // 1. Fetch session row to get game_id and host_user_id
        const { data: sessionRow, error: sessionErr } = await supabase
          .from('game_sessions')
          .select('game_id, host_user_id, phase')
          .eq('id', sessionId)
          .maybeSingle()

        if (cleaned || !mountedRef.current) return

        if (sessionErr || !sessionRow) {
          setError('Session not found or has ended.')
          setConnectionState('error')
          return
        }

        if (sessionRow.phase === 'ended') {
          setError('Session not found or has ended.')
          setConnectionState('error')
          return
        }

        // 2. Subscribe to realtime channel (game file will be loaded after receiving full sync)
        const channel = createSessionChannel(sessionId)

        // Register message listener before subscribing
        onChannelMessage(channel, handleMessage)

        try {
          await subscribeToChannel(channel)
        } catch {
          if (cleaned || !mountedRef.current) return
          setError('Failed to connect to session channel.')
          setConnectionState('error')
          return
        }

        if (cleaned || !mountedRef.current) {
          await unsubscribeFromChannel(channel)
          return
        }

        channelRef.current = channel
        lastMessageTimeRef.current = Date.now()
        setConnectionState('connected')

        // 4. Track presence as a display
        channel.track({
          type: 'display',
          connectedAt: new Date().toISOString(),
        }).catch(() => {})

        // 5. Broadcast display_sync_request to get current state from host
        requestSync(channel)

        // 6. Set up reconnection handler
        const reconnection = createReconnectionHandler(sessionId, {
          onReconnecting: () => {
            if (!cleaned && mountedRef.current) {
              setConnectionState('connecting')
            }
          },
          onReconnected: (newChannel) => {
            if (cleaned || !mountedRef.current) {
              unsubscribeFromChannel(newChannel)
              return
            }
            channelRef.current = newChannel
            onChannelMessage(newChannel, handleMessage)
            setConnectionState('connected')
            setError(null)

            // Re-track presence and re-request sync on reconnect
            newChannel.track({
              type: 'display',
              connectedAt: new Date().toISOString(),
            }).catch(() => {})
            requestSync(newChannel)
          },
          onReconnectFailed: () => {
            if (!cleaned && mountedRef.current) {
              setConnectionState('error')
              setError('Connection lost. Please refresh.')
            }
          },
        })
        reconnectionRef.current = reconnection
      } catch {
        if (!cleaned && mountedRef.current) {
          setError('Failed to initialize display session.')
          setConnectionState('error')
        }
      }
    }

    initialize()

    return () => {
      cleaned = true
      mountedRef.current = false
      if (reconnectionRef.current) {
        reconnectionRef.current.stopReconnection()
      }
      if (channelRef.current) {
        unsubscribeFromChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [sessionId, handleMessage, requestSync])

  // ─── Host Disconnect Detection ──────────────────────────────────────────

  useEffect(() => {
    // Only check for host disconnect when connected
    if (connectionState !== 'connected') return

    const DISCONNECT_TIMEOUT_MS = 60_000
    const CHECK_INTERVAL_MS = 10_000

    const intervalId = setInterval(() => {
      if (Date.now() - lastMessageTimeRef.current > DISCONNECT_TIMEOUT_MS) {
        setHostDisconnected(true)
      }
    }, CHECK_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [connectionState])

  return { displayState, connectionState, error, hostDisconnected }
}
