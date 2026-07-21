import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import type { ChannelMessage } from '../types/session'
import type { DisplayFullSyncPayload, DisplayPhase } from '../types/display'
import type { DisplayState } from './useDisplaySession'

// ─── State Transition Reducer (mirrors handleMessage logic from useDisplaySession) ──

/**
 * A pure reducer that replicates the state transition logic from the
 * useDisplaySession hook's handleMessage callback. This allows testing
 * state transitions without rendering the hook.
 */
function displayStateReducer(state: DisplayState, message: ChannelMessage): DisplayState {
  switch (message.type) {
    case 'display_full_sync': {
      const payload = message.state
      // In the real hook, activeClue is resolved from game data.
      // For testing state transitions, we simulate with null (no game loaded).
      return {
        ...state,
        phase: payload.phase,
        currentRoundIndex: payload.currentRoundIndex,
        currentRoundName: payload.currentRoundName,
        chosenClues: new Set(payload.chosenClueKeys),
        players: payload.players,
        activeClue: null, // Would be resolved from game data in real hook
        answerRevealed: payload.answerRevealed,
        timerRemaining: payload.timerRemaining,
        timerActive: payload.timerRemaining !== null,
        dailyDoublePlayer: payload.dailyDoublePlayer,
        dailyDoubleWager: payload.dailyDoubleWager,
        buzzedPlayer: null,
        buzzResult: null,
      }
    }

    case 'display_clue_selected':
      return {
        ...state,
        phase: message.isDailyDouble ? 'daily-double' : 'clue',
        activeClue: null, // Would be resolved from game data
        answerRevealed: false,
        buzzedPlayer: null,
        buzzResult: null,
        timerRemaining: null,
        timerActive: false,
      }

    case 'display_answer_revealed':
      return { ...state, answerRevealed: true }

    case 'display_board_return': {
      const newChosenClues = new Set(state.chosenClues)
      newChosenClues.add(message.clueKey)
      return {
        ...state,
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
    }

    case 'display_scores_update':
      return { ...state, players: message.players }

    case 'display_round_transition':
      return {
        ...state,
        phase: 'round-transition',
        currentRoundIndex: message.roundIndex,
        currentRoundName: message.roundName,
      }

    case 'display_phase_change':
      return { ...state, phase: message.phase }

    case 'display_buzz_in':
      return { ...state, buzzedPlayer: message.playerName, buzzResult: null }

    case 'display_buzz_result':
      return { ...state, buzzedPlayer: message.playerName, buzzResult: message.result }

    case 'display_timer_tick':
      return { ...state, timerRemaining: message.remaining, timerActive: true }

    case 'display_timer_expired':
      return { ...state, timerRemaining: 0, timerActive: false }

    case 'display_dd_player_selected':
      return { ...state, phase: 'daily-double-wager', dailyDoublePlayer: message.playerName }

    case 'display_dd_wager_confirmed':
      return {
        ...state,
        phase: 'clue',
        dailyDoublePlayer: message.playerName,
        dailyDoubleWager: message.wager,
      }

    case 'display_fj_category':
      return {
        ...state,
        phase: 'final-jeopardy',
        fjState: {
          category: message.category,
          clueText: '',
          solution: '',
          submissions: [],
          revealedIndex: -1,
        },
      }

    case 'display_fj_clue_revealed':
      return {
        ...state,
        fjState: state.fjState
          ? { ...state.fjState, clueText: message.clueText }
          : null,
      }

    case 'display_fj_reveal': {
      if (!state.fjState) return state
      const updatedSubmissions = [...state.fjState.submissions]
      updatedSubmissions[message.index] = message.submission
      return {
        ...state,
        fjState: {
          ...state.fjState,
          submissions: updatedSubmissions,
          revealedIndex: message.index,
        },
      }
    }

    case 'display_game_over':
      return { ...state, phase: 'game-over' }

    case 'session_ended':
      return { ...state, phase: 'game-over' }

    default:
      return state
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function applyMessages(messages: ChannelMessage[]): DisplayState {
  return messages.reduce(displayStateReducer, createInitialDisplayState())
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const displayPhaseArb: fc.Arbitrary<DisplayPhase> = fc.constantFrom(
  'waiting', 'board', 'clue', 'daily-double', 'daily-double-wager',
  'round-transition', 'final-jeopardy', 'game-over'
)

const playerNameArb = fc.string({ minLength: 1, maxLength: 20 })

const displayPlayerArb: fc.Arbitrary<{ name: string; score: number }> = fc.record({
  name: playerNameArb,
  score: fc.integer({ min: -10000, max: 100000 }),
})

const roundNameArb = fc.constantFrom('single', 'double', 'triple', 'quadruple')

const clueKeyArb = fc.tuple(
  roundNameArb,
  fc.integer({ min: 0, max: 5 }),
  fc.integer({ min: 0, max: 4 })
).map(([round, cat, clue]) => `${round}-${cat}-${clue}`)

const fullSyncPayloadArb: fc.Arbitrary<DisplayFullSyncPayload> = fc.record({
  phase: displayPhaseArb,
  currentRoundIndex: fc.integer({ min: 0, max: 5 }),
  currentRoundName: roundNameArb,
  chosenClueKeys: fc.array(clueKeyArb, { minLength: 0, maxLength: 30 }),
  players: fc.array(displayPlayerArb, { minLength: 0, maxLength: 10 }),
  activeClue: fc.option(
    fc.record({
      roundName: roundNameArb,
      categoryIndex: fc.integer({ min: 0, max: 5 }),
      clueIndex: fc.integer({ min: 0, max: 4 }),
    }),
    { nil: null }
  ),
  answerRevealed: fc.boolean(),
  timerRemaining: fc.option(fc.integer({ min: 0, max: 30 }), { nil: null }),
  dailyDoublePlayer: fc.option(playerNameArb, { nil: null }),
  dailyDoubleWager: fc.option(fc.integer({ min: 5, max: 10000 }), { nil: null }),
})

/** Generates display messages that the reducer can process (excluding non-display types) */
const displayMessageArb: fc.Arbitrary<ChannelMessage> = fc.oneof(
  fullSyncPayloadArb.map(state => ({ type: 'display_full_sync' as const, state })),
  fc.record({
    type: fc.constant('display_clue_selected' as const),
    roundName: roundNameArb,
    categoryIndex: fc.integer({ min: 0, max: 5 }),
    clueIndex: fc.integer({ min: 0, max: 4 }),
    isDailyDouble: fc.boolean(),
  }),
  fc.constant({ type: 'display_answer_revealed' as const }),
  clueKeyArb.map(clueKey => ({ type: 'display_board_return' as const, clueKey })),
  fc.array(displayPlayerArb, { minLength: 0, maxLength: 10 }).map(players => ({
    type: 'display_scores_update' as const,
    players,
  })),
  fc.record({
    type: fc.constant('display_round_transition' as const),
    roundIndex: fc.integer({ min: 0, max: 5 }),
    roundName: roundNameArb,
  }),
  displayPhaseArb.map(phase => ({ type: 'display_phase_change' as const, phase })),
  playerNameArb.map(playerName => ({ type: 'display_buzz_in' as const, playerName })),
  fc.record({
    type: fc.constant('display_buzz_result' as const),
    playerName: playerNameArb,
    result: fc.constantFrom('correct' as const, 'incorrect' as const),
  }),
  fc.integer({ min: 0, max: 30 }).map(remaining => ({
    type: 'display_timer_tick' as const,
    remaining,
  })),
  fc.constant({ type: 'display_timer_expired' as const }),
  playerNameArb.map(playerName => ({ type: 'display_dd_player_selected' as const, playerName })),
  fc.record({
    type: fc.constant('display_dd_wager_confirmed' as const),
    playerName: playerNameArb,
    wager: fc.integer({ min: 5, max: 10000 }),
  }),
  fc.constant({ type: 'display_game_over' as const, winner: null as string | null }),
  fc.constant({ type: 'session_ended' as const }),
)

// ─── Property 2: Full sync contains all needed information ────────────────────

/**
 * **Validates: Requirements 9.2, 9.3**
 *
 * After processing a display_full_sync message, the display state should have the
 * correct phase, round info, chosen clues, players, and active clue (null without game data).
 * The Full_Sync payload provides sufficient information to reconstruct the display state.
 */
describe('Property 2: Full sync contains all needed information', () => {
  it('after full sync, phase matches the payload phase', () => {
    fc.assert(
      fc.property(fullSyncPayloadArb, (payload) => {
        const state = applyMessages([{ type: 'display_full_sync', state: payload }])
        expect(state.phase).toBe(payload.phase)
      }),
      { numRuns: 100 }
    )
  })

  it('after full sync, round index and name match the payload', () => {
    fc.assert(
      fc.property(fullSyncPayloadArb, (payload) => {
        const state = applyMessages([{ type: 'display_full_sync', state: payload }])
        expect(state.currentRoundIndex).toBe(payload.currentRoundIndex)
        expect(state.currentRoundName).toBe(payload.currentRoundName)
      }),
      { numRuns: 100 }
    )
  })

  it('after full sync, chosenClues contains exactly the keys from payload', () => {
    fc.assert(
      fc.property(fullSyncPayloadArb, (payload) => {
        const state = applyMessages([{ type: 'display_full_sync', state: payload }])
        const expected = new Set(payload.chosenClueKeys)
        expect(state.chosenClues).toEqual(expected)
      }),
      { numRuns: 100 }
    )
  })

  it('after full sync, players match the payload players', () => {
    fc.assert(
      fc.property(fullSyncPayloadArb, (payload) => {
        const state = applyMessages([{ type: 'display_full_sync', state: payload }])
        expect(state.players).toEqual(payload.players)
      }),
      { numRuns: 100 }
    )
  })

  it('after full sync, answerRevealed matches the payload', () => {
    fc.assert(
      fc.property(fullSyncPayloadArb, (payload) => {
        const state = applyMessages([{ type: 'display_full_sync', state: payload }])
        expect(state.answerRevealed).toBe(payload.answerRevealed)
      }),
      { numRuns: 100 }
    )
  })

  it('after full sync, timer state is derived from payload timerRemaining', () => {
    fc.assert(
      fc.property(fullSyncPayloadArb, (payload) => {
        const state = applyMessages([{ type: 'display_full_sync', state: payload }])
        expect(state.timerRemaining).toBe(payload.timerRemaining)
        expect(state.timerActive).toBe(payload.timerRemaining !== null)
      }),
      { numRuns: 100 }
    )
  })

  it('after full sync, daily double state matches payload', () => {
    fc.assert(
      fc.property(fullSyncPayloadArb, (payload) => {
        const state = applyMessages([{ type: 'display_full_sync', state: payload }])
        expect(state.dailyDoublePlayer).toBe(payload.dailyDoublePlayer)
        expect(state.dailyDoubleWager).toBe(payload.dailyDoubleWager)
      }),
      { numRuns: 100 }
    )
  })

  it('after full sync, transient buzz state is reset', () => {
    fc.assert(
      fc.property(fullSyncPayloadArb, (payload) => {
        // Start with some buzzer state already set
        const preState: DisplayState = {
          ...createInitialDisplayState(),
          buzzedPlayer: 'SomePlayer',
          buzzResult: 'correct',
        }
        const state = displayStateReducer(preState, { type: 'display_full_sync', state: payload })
        expect(state.buzzedPlayer).toBeNull()
        expect(state.buzzResult).toBeNull()
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 3: Display phase matches host phase ─────────────────────────────

/**
 * **Validates: Requirements 9.2**
 *
 * After processing any sequence of display messages, the phase should be consistent
 * with the last phase-setting message. Phase-setting messages include:
 * display_phase_change, display_full_sync, display_board_return, display_clue_selected,
 * display_round_transition, display_dd_player_selected, display_dd_wager_confirmed,
 * display_fj_category, display_game_over, and session_ended.
 */
describe('Property 3: Display phase matches host phase', () => {
  it('display_phase_change always sets the phase to the message phase', () => {
    fc.assert(
      fc.property(
        fc.array(displayMessageArb, { minLength: 0, maxLength: 20 }),
        displayPhaseArb,
        (precedingMessages, targetPhase) => {
          const allMessages: ChannelMessage[] = [
            ...precedingMessages,
            { type: 'display_phase_change', phase: targetPhase },
          ]
          const state = applyMessages(allMessages)
          expect(state.phase).toBe(targetPhase)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('display_full_sync always sets phase to the sync payload phase', () => {
    fc.assert(
      fc.property(
        fc.array(displayMessageArb, { minLength: 0, maxLength: 20 }),
        fullSyncPayloadArb,
        (precedingMessages, payload) => {
          const allMessages: ChannelMessage[] = [
            ...precedingMessages,
            { type: 'display_full_sync', state: payload },
          ]
          const state = applyMessages(allMessages)
          expect(state.phase).toBe(payload.phase)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('display_board_return always sets phase to "board"', () => {
    fc.assert(
      fc.property(
        fc.array(displayMessageArb, { minLength: 0, maxLength: 20 }),
        clueKeyArb,
        (precedingMessages, clueKey) => {
          const allMessages: ChannelMessage[] = [
            ...precedingMessages,
            { type: 'display_board_return', clueKey },
          ]
          const state = applyMessages(allMessages)
          expect(state.phase).toBe('board')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('display_game_over always sets phase to "game-over"', () => {
    fc.assert(
      fc.property(
        fc.array(displayMessageArb, { minLength: 0, maxLength: 20 }),
        (precedingMessages) => {
          const allMessages: ChannelMessage[] = [
            ...precedingMessages,
            { type: 'display_game_over', winner: null },
          ]
          const state = applyMessages(allMessages)
          expect(state.phase).toBe('game-over')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('session_ended always sets phase to "game-over"', () => {
    fc.assert(
      fc.property(
        fc.array(displayMessageArb, { minLength: 0, maxLength: 20 }),
        (precedingMessages) => {
          const allMessages: ChannelMessage[] = [
            ...precedingMessages,
            { type: 'session_ended' },
          ]
          const state = applyMessages(allMessages)
          expect(state.phase).toBe('game-over')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('display_round_transition always sets phase to "round-transition"', () => {
    fc.assert(
      fc.property(
        fc.array(displayMessageArb, { minLength: 0, maxLength: 20 }),
        fc.integer({ min: 0, max: 5 }),
        roundNameArb,
        (precedingMessages, roundIndex, roundName) => {
          const allMessages: ChannelMessage[] = [
            ...precedingMessages,
            { type: 'display_round_transition', roundIndex, roundName },
          ]
          const state = applyMessages(allMessages)
          expect(state.phase).toBe('round-transition')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('display_clue_selected sets phase to "clue" or "daily-double" based on isDailyDouble', () => {
    fc.assert(
      fc.property(
        fc.array(displayMessageArb, { minLength: 0, maxLength: 20 }),
        roundNameArb,
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 4 }),
        fc.boolean(),
        (precedingMessages, roundName, categoryIndex, clueIndex, isDailyDouble) => {
          const allMessages: ChannelMessage[] = [
            ...precedingMessages,
            { type: 'display_clue_selected', roundName, categoryIndex, clueIndex, isDailyDouble },
          ]
          const state = applyMessages(allMessages)
          const expectedPhase = isDailyDouble ? 'daily-double' : 'clue'
          expect(state.phase).toBe(expectedPhase)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ─── Property 5: Chosen clues accumulate monotonically ────────────────────────

/**
 * **Validates: Requirements 4.4**
 *
 * After any sequence of display_board_return messages, the chosenClues set only grows
 * (never shrinks). Each board_return adds a key but never removes one.
 */
describe('Property 5: Chosen clues accumulate monotonically', () => {
  it('chosenClues set size never decreases after processing board_return messages', () => {
    fc.assert(
      fc.property(
        fc.array(clueKeyArb, { minLength: 1, maxLength: 30 }),
        (clueKeys) => {
          const messages: ChannelMessage[] = clueKeys.map(clueKey => ({
            type: 'display_board_return' as const,
            clueKey,
          }))

          let state = createInitialDisplayState()
          let previousSize = 0

          for (const msg of messages) {
            state = displayStateReducer(state, msg)
            expect(state.chosenClues.size).toBeGreaterThanOrEqual(previousSize)
            previousSize = state.chosenClues.size
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every clue key from board_return is present in the final chosenClues set', () => {
    fc.assert(
      fc.property(
        fc.array(clueKeyArb, { minLength: 1, maxLength: 30 }),
        (clueKeys) => {
          const messages: ChannelMessage[] = clueKeys.map(clueKey => ({
            type: 'display_board_return' as const,
            clueKey,
          }))

          const state = applyMessages(messages)

          for (const key of clueKeys) {
            expect(state.chosenClues.has(key)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('chosenClues only grows across mixed message sequences containing board_return', () => {
    fc.assert(
      fc.property(
        fc.array(displayMessageArb, { minLength: 1, maxLength: 30 }),
        (messages) => {
          // Filter to only track board_return messages for monotonicity,
          // but apply all messages. Note: full_sync can reset chosenClues,
          // so we track monotonicity only between full_sync boundaries.
          let state = createInitialDisplayState()
          for (const msg of messages) {
            const previousClues = new Set(state.chosenClues)
            state = displayStateReducer(state, msg)

            if (msg.type === 'display_full_sync') {
              // Full sync resets - update our baseline
            } else if (msg.type === 'display_board_return') {
              // After board_return, all previous clues should still be present
              for (const key of previousClues) {
                expect(state.chosenClues.has(key)).toBe(true)
              }
              // Size should be >= previous
              expect(state.chosenClues.size).toBeGreaterThanOrEqual(previousClues.size)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('board_return with duplicate clue key does not change set size', () => {
    fc.assert(
      fc.property(
        clueKeyArb,
        fc.integer({ min: 2, max: 5 }),
        (clueKey, repeatCount) => {
          const messages: ChannelMessage[] = Array.from({ length: repeatCount }, () => ({
            type: 'display_board_return' as const,
            clueKey,
          }))

          const state = applyMessages(messages)
          // The same key added multiple times should only appear once in the set
          expect(state.chosenClues.size).toBe(1)
          expect(state.chosenClues.has(clueKey)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
