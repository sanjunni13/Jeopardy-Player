// @vitest-environment jsdom
/**
 * Preservation property tests — betting-submission-fixes, Property 6.
 *
 * Property 6: Preservation — Non-Betting Channel Messages Unchanged
 *
 * **Validates: Requirements 3.6, 3.7, 3.9**
 *
 * These tests MUST PASS on unfixed code. They pin the CURRENT, observed behavior
 * of everything outside the bug condition so the two fixes cannot silently move it:
 *
 *  - Every `ChannelMessage` variant other than `betting_submitted` / `betting_done`
 *    round-trips through `broadcastMessage` → `onChannelMessage` with the same
 *    broadcast event name, the same payload, and the same listener dispatch
 *    branch as the pinned original implementation (Req 3.9).
 *  - A non-empty submit from `PlayerBettingPanel` still sends exactly one message
 *    carrying every placed bet (Req 3.6). The broadcast EVENT NAME is deliberately
 *    not asserted here — that is the bug, and task 2's exploration test owns it.
 *    These assertions hold before and after the fix.
 *  - The betting finalization guard still fires at most once (Req 3.7).
 *
 * The "original" implementation is pinned as a local reference copy rather than
 * pulled from git history, matching the approach used for the round-result
 * preservation tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import fc from 'fast-check'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type {
  BuzzEvent,
  BuzzState,
  ChannelMessage,
  FinalJeopardySubmission,
  SessionPhase,
  SessionPlayer,
} from '../types/session'
import { broadcastMessage, onChannelMessage } from './sessionChannel'
import { PlayerBettingPanel } from '../components/player/PlayerBettingPanel'

// The Supabase client is only used for channel construction, which these tests
// replace with a fake channel. Stubbing it keeps `sessionChannel` itself real.
vi.mock('./supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(async () => {}),
  },
}))

// ─── Pinned original implementation ───────────────────────────────────────────

/** The broadcast event name observed on unfixed code for both publish and subscribe. */
const ORIGINAL_BROADCAST_EVENT = 'session_event'

/** Reference copy of `broadcastMessage` as observed on unfixed code. */
async function broadcastMessage_original(
  channel: RealtimeChannel,
  message: ChannelMessage
): Promise<void> {
  await channel.send({
    type: 'broadcast',
    event: ORIGINAL_BROADCAST_EVENT,
    payload: message,
  } as Parameters<RealtimeChannel['send']>[0])
}

/**
 * Registers a broadcast handler for an explicit event name, bypassing the
 * production helper. Used to pin the original subscription and to prove nothing
 * is delivered on the stale `game_message` event.
 */
function onRawBroadcast(
  channel: RealtimeChannel,
  event: string,
  cb: (payload: { payload: unknown }) => void
): void {
  const raw = channel as unknown as {
    on: (type: string, filter: { event: string }, cb: (payload: { payload: unknown }) => void) => void
  }
  raw.on('broadcast', { event }, cb)
}

/** Reference copy of `onChannelMessage` as observed on unfixed code. */
function onChannelMessage_original(
  channel: RealtimeChannel,
  callback: (message: ChannelMessage) => void
): void {
  onRawBroadcast(channel, ORIGINAL_BROADCAST_EVENT, (payload) => {
    callback(payload.payload as ChannelMessage)
  })
}

// ─── Fake channel ─────────────────────────────────────────────────────────────

interface Envelope {
  type: string
  event: string
  payload: unknown
}

interface FakeChannel {
  channel: RealtimeChannel
  /** Every envelope handed to `channel.send`, in order. */
  sent: Envelope[]
  /** Broadcast handlers registered on the channel, with the event they filter on. */
  handlers: { event: string; cb: (arg: { payload: unknown }) => void }[]
}

/**
 * A channel whose `send` records the full envelope and fans out ONLY to handlers
 * registered for that exact broadcast event name — the routing Supabase Realtime
 * performs. Payloads are JSON round-tripped, as they are over the wire.
 */
function createFakeChannel(): FakeChannel {
  const sent: Envelope[] = []
  const handlers: { event: string; cb: (arg: { payload: unknown }) => void }[] = []

  const channel = {
    send: vi.fn(async (envelope: Envelope) => {
      sent.push(envelope)
      const overTheWire = JSON.parse(JSON.stringify(envelope.payload)) as unknown
      for (const handler of handlers) {
        if (handler.event === envelope.event) {
          handler.cb({ payload: overTheWire })
        }
      }
      return 'ok'
    }),
    on: vi.fn(
      (
        type: string,
        filter: { event?: string },
        cb: (arg: { payload: unknown }) => void
      ) => {
        if (type === 'broadcast' && filter?.event) {
          handlers.push({ event: filter.event, cb })
        }
        return channel
      }
    ),
    subscribe: vi.fn(),
    track: vi.fn(async () => {}),
    untrack: vi.fn(async () => {}),
    presenceState: vi.fn(() => ({})),
  }

  return { channel: channel as unknown as RealtimeChannel, sent, handlers }
}

// ─── Reference listener ───────────────────────────────────────────────────────

/**
 * Maps a delivered message onto the branch a listener dispatches it to — one case
 * per `ChannelMessage` variant, mirroring the `switch` in `GamePage` /
 * `PlaySessionPage`. Anything whose `type` is missing or unrecognised falls
 * through to `'unhandled'`, so a dropped or renamed discriminant is caught.
 */
function dispatchBranch(message: ChannelMessage): string {
  switch (message.type) {
    case 'phase_change':
      return 'phase_change'
    case 'player_joined':
      return 'player_joined'
    case 'player_rejoined':
      return 'player_rejoined'
    case 'player_removed':
      return 'player_removed'
    case 'clue_activated':
      return 'clue_activated'
    case 'clue_deactivated':
      return 'clue_deactivated'
    case 'buzz':
      return 'buzz'
    case 'buzz_queue_update':
      return 'buzz_queue_update'
    case 'buzzer_locked':
      return 'buzzer_locked'
    case 'buzzer_unlocked':
      return 'buzzer_unlocked'
    case 'buzz_state_sync':
      return 'buzz_state_sync'
    case 'buzz_queue_cleared':
      return 'buzz_queue_cleared'
    case 'player_incorrect':
      return 'player_incorrect'
    case 'fj_wager_received':
      return 'fj_wager_received'
    case 'fj_all_wagers_in':
      return 'fj_all_wagers_in'
    case 'fj_submission_received':
      return 'fj_submission_received'
    case 'fj_reveal':
      return 'fj_reveal'
    case 'fj_score_update':
      return 'fj_score_update'
    case 'coop_pool_update':
      return 'coop_pool_update'
    case 'session_ended':
      return 'session_ended'
    case 'auction_start':
      return 'auction_start'
    case 'auction_bid':
      return 'auction_bid'
    case 'auction_result':
      return 'auction_result'
    case 'auction_complete':
      return 'auction_complete'
    case 'betting_start':
      return 'betting_start'
    case 'betting_placed':
      return 'betting_placed'
    case 'betting_complete':
      return 'betting_complete'
    case 'gambling_balance_update':
      return 'gambling_balance_update'
    default:
      return 'unhandled'
  }
}

interface Recorder {
  handler: (message: ChannelMessage) => void
  received: ChannelMessage[]
  branches: string[]
}

function createRecorder(): Recorder {
  const received: ChannelMessage[] = []
  const branches: string[] = []
  return {
    handler: (message: ChannelMessage) => {
      received.push(message)
      branches.push(dispatchBranch(message))
    },
    received,
    branches,
  }
}

// ─── Generators ───────────────────────────────────────────────────────────────

const PLAYERS = ['Alice', 'Bob', 'Charlie']

const playerNameArb = fc.constantFrom(...PLAYERS)
const scoreArb = fc.integer({ min: -5000, max: 20000 })
const isoArb = fc.constantFrom(
  '2024-01-01T00:00:00.000Z',
  '2024-06-15T12:30:45.000Z',
  '2025-03-09T23:59:59.000Z'
)

const sessionPlayerArb: fc.Arbitrary<SessionPlayer> = fc.record({
  name: playerNameArb,
  score: scoreArb,
  joinedAt: isoArb,
})

const buzzEventArb: fc.Arbitrary<BuzzEvent> = fc.record({
  playerName: playerNameArb,
  timestamp: fc.integer({ min: 0, max: 4_000_000_000 }),
})

const buzzStateArb: fc.Arbitrary<BuzzState> = fc.record({
  clueActive: fc.boolean(),
  queue: fc.array(buzzEventArb, { maxLength: 3 }),
  lockedOut: fc.uniqueArray(playerNameArb, { maxLength: 3 }),
  systemLocked: fc.boolean(),
})

const fjSubmissionArb: fc.Arbitrary<FinalJeopardySubmission> = fc.record({
  playerName: playerNameArb,
  wager: fc.integer({ min: 0, max: 10000 }),
  answer: fc.string({ maxLength: 40 }),
  submittedAt: isoArb,
})

const phaseArb = fc.constantFrom<SessionPhase>('lobby', 'buzzer', 'final-jeopardy', 'ended')

const balancesArb = fc.dictionary(playerNameArb, scoreArb, { maxKeys: 3 })

const betTypeArb = fc.constantFrom(
  'round_leader',
  'most_incorrect',
  'most_correct',
  'biggest_earner',
  'highest_single_clue',
  'daily_double_finder'
)

/**
 * One arbitrary per `ChannelMessage` variant, excluding the two variants inside the
 * bug condition. The keyed record type makes exhaustiveness a compile-time check:
 * a new variant added to the union will not type-check until it is generated here.
 */
const messageArbByType: Record<
  Exclude<ChannelMessage['type'], 'betting_submitted' | 'betting_done'>,
  fc.Arbitrary<ChannelMessage>
> = {
  phase_change: phaseArb.map((phase): ChannelMessage => ({ type: 'phase_change', phase })),
  player_joined: sessionPlayerArb.map((player): ChannelMessage => ({ type: 'player_joined', player })),
  player_rejoined: sessionPlayerArb.map((player): ChannelMessage => ({ type: 'player_rejoined', player })),
  player_removed: playerNameArb.map((playerName): ChannelMessage => ({ type: 'player_removed', playerName })),
  clue_activated: fc.constant<ChannelMessage>({ type: 'clue_activated' }),
  clue_deactivated: fc.constant<ChannelMessage>({ type: 'clue_deactivated' }),
  buzz: buzzEventArb.map(
    (e): ChannelMessage => ({ type: 'buzz', playerName: e.playerName, timestamp: e.timestamp })
  ),
  buzz_queue_update: fc
    .array(buzzEventArb, { maxLength: 3 })
    .map((queue): ChannelMessage => ({ type: 'buzz_queue_update', queue })),
  buzzer_locked: fc.constant<ChannelMessage>({ type: 'buzzer_locked' }),
  buzzer_unlocked: fc.constant<ChannelMessage>({ type: 'buzzer_unlocked' }),
  buzz_state_sync: buzzStateArb.map((buzzState): ChannelMessage => ({ type: 'buzz_state_sync', buzzState })),
  buzz_queue_cleared: fc
    .uniqueArray(playerNameArb, { maxLength: 3 })
    .map((lockedOut): ChannelMessage => ({ type: 'buzz_queue_cleared', lockedOut })),
  player_incorrect: playerNameArb.map((playerName): ChannelMessage => ({ type: 'player_incorrect', playerName })),
  fj_wager_received: playerNameArb.map((playerName): ChannelMessage => ({ type: 'fj_wager_received', playerName })),
  fj_all_wagers_in: fc.constant<ChannelMessage>({ type: 'fj_all_wagers_in' }),
  fj_submission_received: playerNameArb.map(
    (playerName): ChannelMessage => ({ type: 'fj_submission_received', playerName })
  ),
  fj_reveal: fc
    .record({ index: fc.integer({ min: -1, max: 5 }), submission: fjSubmissionArb })
    .map(({ index, submission }): ChannelMessage => ({ type: 'fj_reveal', index, submission })),
  fj_score_update: fc
    .record({ playerName: playerNameArb, newScore: scoreArb })
    .map(({ playerName, newScore }): ChannelMessage => ({ type: 'fj_score_update', playerName, newScore })),
  coop_pool_update: fc
    .record({ teamPool: scoreArb, targetScore: fc.integer({ min: 0, max: 50000 }) })
    .map(({ teamPool, targetScore }): ChannelMessage => ({ type: 'coop_pool_update', teamPool, targetScore })),
  session_ended: fc.constant<ChannelMessage>({ type: 'session_ended' }),
  auction_start: fc
    .record({
      category: fc.string({ maxLength: 30 }),
      categoryIndex: fc.integer({ min: 0, max: 5 }),
      roundName: fc.constantFrom('Jeopardy', 'Double Jeopardy'),
      timerDuration: fc.integer({ min: 5, max: 120 }),
      playerBalances: balancesArb,
    })
    .map((m): ChannelMessage => ({ type: 'auction_start', ...m })),
  auction_bid: fc
    .record({
      playerName: playerNameArb,
      categoryIndex: fc.integer({ min: 0, max: 5 }),
      amount: fc.integer({ min: 0, max: 5000 }),
    })
    .map((m): ChannelMessage => ({ type: 'auction_bid', ...m })),
  auction_result: fc
    .record({
      categoryIndex: fc.integer({ min: 0, max: 5 }),
      winner: fc.option(playerNameArb, { nil: null }),
      winningBid: fc.integer({ min: 0, max: 5000 }),
    })
    .map((m): ChannelMessage => ({ type: 'auction_result', ...m })),
  auction_complete: fc
    .dictionary(fc.constantFrom('0', '1', '2'), playerNameArb, { maxKeys: 3 })
    .map((ownership): ChannelMessage => ({ type: 'auction_complete', ownership })),
  betting_start: fc
    .record({
      availableBets: fc.array(
        fc.record({ betType: betTypeArb, description: fc.string({ maxLength: 40 }) }),
        { maxLength: 4 }
      ),
      timerDuration: fc.integer({ min: 5, max: 120 }),
      playerBalances: balancesArb,
    })
    .map((m): ChannelMessage => ({ type: 'betting_start', ...m })),
  betting_placed: fc
    .record({
      playerName: playerNameArb,
      betType: betTypeArb,
      wager: fc.integer({ min: 1, max: 5000 }),
      prediction: playerNameArb,
    })
    .map((m): ChannelMessage => ({ type: 'betting_placed', ...m })),
  betting_complete: fc.constant<ChannelMessage>({ type: 'betting_complete' }),
  gambling_balance_update: balancesArb.map(
    (balances): ChannelMessage => ({ type: 'gambling_balance_update', balances })
  ),
}

const NON_BETTING_TYPES = Object.keys(messageArbByType) as (keyof typeof messageArbByType)[]

/** Any `ChannelMessage` outside the bug condition. */
const nonBettingMessageArb: fc.Arbitrary<ChannelMessage> = fc.oneof(
  ...NON_BETTING_TYPES.map((t) => messageArbByType[t])
)

// ─── Property 6: non-betting messages unchanged (Req 3.9) ─────────────────────

describe('Property 6: Preservation — Non-Betting Channel Messages Unchanged', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pinned observation: representative messages publish on the subscribed event and arrive intact', async () => {
    const samples: ChannelMessage[] = [
      { type: 'phase_change', phase: 'final-jeopardy' },
      { type: 'buzz', playerName: 'Alice', timestamp: 1712345678901 },
      {
        type: 'fj_reveal',
        index: 0,
        submission: {
          playerName: 'Bob',
          wager: 1200,
          answer: 'Who is Ada Lovelace?',
          submittedAt: '2024-01-01T00:00:00.000Z',
        },
      },
      { type: 'gambling_balance_update', balances: { Alice: 3400, Bob: 1200 } },
      { type: 'auction_bid', playerName: 'Charlie', categoryIndex: 2, amount: 400 },
    ]

    for (const message of samples) {
      const fake = createFakeChannel()
      const recorder = createRecorder()
      onChannelMessage(fake.channel, recorder.handler)

      await broadcastMessage(fake.channel, message)

      expect(fake.sent).toHaveLength(1)
      expect(fake.sent[0].type).toBe('broadcast')
      expect(fake.sent[0].event).toBe(ORIGINAL_BROADCAST_EVENT)
      expect(fake.sent[0].payload).toEqual(message)
      expect(recorder.received).toEqual([message])
      expect(recorder.branches).toEqual([message.type])
    }
  })

  it('every non-betting variant round-trips to its own dispatch branch', async () => {
    for (const type of NON_BETTING_TYPES) {
      const [message] = fc.sample(messageArbByType[type], { numRuns: 1, seed: 20240601 })

      const fake = createFakeChannel()
      const recorder = createRecorder()
      onChannelMessage(fake.channel, recorder.handler)

      await broadcastMessage(fake.channel, message)

      expect(recorder.branches).toEqual([type])
      expect(recorder.received).toEqual([message])
    }
  })

  it('for any non-betting message, the envelope and dispatch branch match the pinned original', async () => {
    await fc.assert(
      fc.asyncProperty(nonBettingMessageArb, async (message) => {
        const current = createFakeChannel()
        const currentRecorder = createRecorder()
        onChannelMessage(current.channel, currentRecorder.handler)

        const original = createFakeChannel()
        const originalRecorder = createRecorder()
        onChannelMessage_original(original.channel, originalRecorder.handler)

        await broadcastMessage(current.channel, message)
        await broadcastMessage_original(original.channel, message)

        // Exactly one broadcast, envelope identical to the original implementation.
        expect(current.sent).toHaveLength(1)
        expect(original.sent).toHaveLength(1)
        expect(current.sent[0].event).toBe(original.sent[0].event)
        expect(current.sent[0].type).toBe(original.sent[0].type)
        expect(current.sent[0].payload).toEqual(original.sent[0].payload)
        // Payload survives the wire unchanged.
        expect(current.sent[0].payload).toEqual(message)
        expect(currentRecorder.received).toEqual([message])
        // Same listener dispatch branch as the original.
        expect(currentRecorder.branches).toEqual(originalRecorder.branches)
        expect(currentRecorder.branches).toEqual([message.type])
      }),
      { numRuns: 200 }
    )
  })

  it('for any non-betting message, delivery goes only to the subscribed event, never to game_message', async () => {
    await fc.assert(
      fc.asyncProperty(nonBettingMessageArb, async (message) => {
        const fake = createFakeChannel()
        const subscribed = createRecorder()
        const stale = createRecorder()

        onChannelMessage(fake.channel, subscribed.handler)
        // A raw listener on the stale event name receives nothing.
        onRawBroadcast(fake.channel, 'game_message', (payload) => {
          stale.handler(payload.payload as ChannelMessage)
        })

        await broadcastMessage(fake.channel, message)

        expect(subscribed.received).toHaveLength(1)
        expect(stale.received).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Req 3.6: one submit message carries every placed bet ─────────────────────

const PLAYER_NAME = 'Alice'
const PLAYER_BALANCE = 1000

/** Four available types so placing up to three never trips the auto-finalize path. */
const AVAILABLE_BETS = [
  { betType: 'round_leader', description: 'Who will lead after this round?' },
  { betType: 'most_incorrect', description: 'Who will get the most wrong?' },
  { betType: 'most_correct', description: 'Who will get the most correct?' },
  { betType: 'biggest_earner', description: 'Who will earn the most?' },
]

interface PlacedBet {
  betType: string
  wager: number
  prediction: string
}

/** Non-empty, one bet per type, cumulatively within balance. */
const placedBetsArb = fc.uniqueArray(
  fc.record({
    betType: fc.constantFrom(...AVAILABLE_BETS.map((b) => b.betType)),
    wager: fc.integer({ min: 1, max: 300 }),
    prediction: fc.constantFrom(...PLAYERS),
  }),
  { minLength: 1, maxLength: 3, selector: (b) => b.betType }
)

function renderPanel(channel: RealtimeChannel, onBettingDone: () => void) {
  return render(
    createElement(PlayerBettingPanel, {
      availableBets: AVAILABLE_BETS,
      playerBalance: PLAYER_BALANCE,
      timerDuration: 60,
      channel,
      playerName: PLAYER_NAME,
      players: PLAYERS,
      onBettingDone,
    })
  )
}

function placeAndSubmit(bets: PlacedBet[]) {
  for (const bet of bets) {
    fireEvent.change(screen.getByLabelText('Bet Type'), { target: { value: bet.betType } })
    fireEvent.change(screen.getByLabelText('Prediction'), { target: { value: bet.prediction } })
    fireEvent.change(screen.getByLabelText('Wager'), { target: { value: String(bet.wager) } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))
  }
  fireEvent.click(screen.getByRole('button', { name: 'Submit Bets' }))
}

describe('Preservation — a non-empty submit sends exactly one message with every bet (Req 3.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('pinned observation: two bets go out in a single betting_submitted message', () => {
    const fake = createFakeChannel()
    const onBettingDone = vi.fn()
    renderPanel(fake.channel, onBettingDone)

    const bets: PlacedBet[] = [
      { betType: 'round_leader', wager: 100, prediction: 'Bob' },
      { betType: 'most_incorrect', wager: 200, prediction: 'Charlie' },
    ]
    placeAndSubmit(bets)

    // Exactly one message, regardless of which broadcast event it goes out on.
    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0].type).toBe('broadcast')
    const payload = fake.sent[0].payload as {
      type: string
      playerName: string
      bets: PlacedBet[]
    }
    expect(payload.type).toBe('betting_submitted')
    expect(payload.playerName).toBe(PLAYER_NAME)
    expect(payload.bets).toEqual(bets)
    // Panel finalizes on that device.
    expect(screen.getByText('Betting Complete')).toBeTruthy()
    expect(onBettingDone).toHaveBeenCalledTimes(1)
  })

  it('for any non-empty placed-bet list, exactly one message carries every bet', () => {
    fc.assert(
      fc.property(placedBetsArb, (bets) => {
        const fake = createFakeChannel()
        const onBettingDone = vi.fn()
        renderPanel(fake.channel, onBettingDone)

        try {
          placeAndSubmit(bets)

          expect(fake.sent).toHaveLength(1)
          const payload = fake.sent[0].payload as {
            type: string
            playerName: string
            bets: PlacedBet[]
          }
          expect(payload.type).toBe('betting_submitted')
          expect(payload.playerName).toBe(PLAYER_NAME)
          // Every placed bet is present exactly once, in order.
          expect(payload.bets).toEqual(bets)
          expect(screen.getByText('Betting Complete')).toBeTruthy()
          expect(onBettingDone).toHaveBeenCalledTimes(1)
        } finally {
          cleanup()
        }
      }),
      { numRuns: 25 }
    )
  })
})

// ─── Req 3.7: finalization runs at most once ──────────────────────────────────

/**
 * Mirrors the one-shot finalization guard in `GamePage`: `finalizeBetting` returns
 * early when `bettingResolvedRef.current` is already set, the auto-finalize effect
 * fires only once every player is in `bettingPlayersDone`, and the host's
 * "End Betting" button calls the same guarded function.
 */
function createFinalizationHarness(players: string[]) {
  let resolved = false
  let finalizeCount = 0
  const playersDone = new Set<string>()

  function finalizeBetting(): void {
    if (resolved) return
    resolved = true
    finalizeCount++
  }

  /** The auto-finalize effect body. */
  function runAutoFinalizeEffect(): void {
    if (resolved) return
    const allDone = players.every((p) => playersDone.has(p))
    if (allDone && playersDone.size > 0) {
      finalizeBetting()
    }
  }

  return {
    markDone(playerName: string): void {
      playersDone.add(playerName)
      runAutoFinalizeEffect()
    },
    forceEnd(): void {
      finalizeBetting()
    },
    get finalizeCount(): number {
      return finalizeCount
    },
    get allDone(): boolean {
      return players.length > 0 && players.every((p) => playersDone.has(p))
    },
  }
}

type FinalizationEvent = { kind: 'done'; playerName: string } | { kind: 'forceEnd' }

describe('Preservation — betting finalization runs at most once (Req 3.7)', () => {
  it('pinned observation: all players done finalizes once, a later force-end is a no-op', () => {
    const harness = createFinalizationHarness(PLAYERS)

    harness.markDone('Alice')
    expect(harness.finalizeCount).toBe(0)
    harness.markDone('Bob')
    expect(harness.finalizeCount).toBe(0)
    harness.markDone('Charlie')
    expect(harness.finalizeCount).toBe(1)

    harness.forceEnd()
    harness.markDone('Alice')
    expect(harness.finalizeCount).toBe(1)
  })

  it('for any interleaving of done notifications and force-ends, finalization happens at most once', () => {
    const eventArb: fc.Arbitrary<FinalizationEvent> = fc.oneof(
      { weight: 4, arbitrary: playerNameArb.map((playerName): FinalizationEvent => ({ kind: 'done', playerName })) },
      { weight: 1, arbitrary: fc.constant<FinalizationEvent>({ kind: 'forceEnd' }) }
    )

    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 12 }), (events) => {
        const harness = createFinalizationHarness(PLAYERS)

        for (const event of events) {
          if (event.kind === 'done') harness.markDone(event.playerName)
          else harness.forceEnd()
        }

        // Never more than once — the wager deduction and ledger append are not idempotent.
        expect(harness.finalizeCount).toBeLessThanOrEqual(1)
        // …and exactly once whenever something should have triggered it.
        const shouldHaveFired = events.some((e) => e.kind === 'forceEnd') || harness.allDone
        expect(harness.finalizeCount).toBe(shouldHaveFired ? 1 : 0)
      }),
      { numRuns: 200 }
    )
  })
})
