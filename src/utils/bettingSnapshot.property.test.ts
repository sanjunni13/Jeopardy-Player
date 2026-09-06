// @vitest-environment jsdom
/**
 * Bug condition exploration test — betting-submission-fixes, Property 4.
 *
 * Property 4: Bug Condition — Betting Snapshot Survives A Reload
 *
 * **Validates: Requirements 1.7, 2.6, 2.7**
 *
 * Bug Condition `C_restore`: the betting phase lives only in `PlaySessionPage`
 * component state (`gamblingPhase` / `bettingData`), populated exclusively by the
 * `betting_start` broadcast. The persisted session phase is `'buzzer'`, so
 * reloading the buzzer page mid-betting drops the player onto `BuzzerPage` with no
 * way back into the betting form, and a player who already submitted or skipped
 * loses that fact and can submit again.
 *
 * These tests are EXPECTED TO FAIL on unfixed code. The failure is the
 * deliverable:
 *   - `src/utils/bettingSnapshot.ts` does not exist yet (task 9.5 adds it), so the
 *     round-trip property has no subject to load.
 *   - `PlaySessionPage` performs no snapshot restore on mount, so a remount with
 *     `session.phase === 'buzzer'` renders `BuzzerPage`.
 *   - `PlayerBettingPanel` has no `initialPlacedBets` / `initialFinalized`
 *     seeding, so a restored player who already submitted sees the active form.
 *
 * No source file is modified by this test file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { createElement } from 'react'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ChannelMessage, GameSessionRow } from '../types/session'
import { onChannelMessage } from './sessionChannel'

// The Supabase client is only needed for channel construction, which these tests
// replace with a fake channel. Stubbing it keeps `sessionChannel` itself real.
vi.mock('./supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(async () => {}),
  },
}))

const TEST_SESSION_ID = 'SNAP01'

const hoisted = vi.hoisted(() => ({
  gameSession: {
    session: null as GameSessionRow | null,
    connectionState: 'connected' as string,
    channel: null as RealtimeChannel | null,
    error: null as string | null,
  },
  sessionId: 'SNAP01',
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ sessionId: hoisted.sessionId }),
}))

vi.mock('../hooks/useGameSession', () => ({
  useGameSession: () => hoisted.gameSession,
}))

// Imported after the mocks above so PlaySessionPage picks them up.
import { PlaySessionPage } from '../routes/pages/PlaySessionPage'

// ─── Intended snapshot module contract (design Change 10, task 9.5) ──────────

interface BettingSnapshot {
  availableBets: { betType: string; description: string }[]
  timerDuration: number
  playerBalances: Record<string, number>
  placedBets: { betType: string; wager: number; prediction: string }[]
  finalized: boolean
}

interface BettingSnapshotModule {
  persistBettingSnapshot: (sessionId: string, snapshot: BettingSnapshot) => void
  restoreBettingSnapshot: (sessionId: string) => BettingSnapshot | null
  clearBettingSnapshot: (sessionId: string) => void
}

/** sessionStorage key the snapshot is expected to live under (design Change 10). */
function snapshotKey(sessionId: string): string {
  return `betting_state_${sessionId}`
}

// Resolved at runtime rather than through a static import so a missing module
// fails as an informative assertion inside the test instead of a file-level
// transform error that would stop the component-level checks from running.
const SNAPSHOT_MODULE_SPECIFIER = './bettingSnapshot'

async function loadSnapshotModule(): Promise<BettingSnapshotModule> {
  // Vitest runs from the project root, so the module path is stable.
  const expectedPath = resolve(process.cwd(), 'src/utils/bettingSnapshot.ts')
  if (!existsSync(expectedPath)) {
    throw new Error(
      `Betting snapshot module missing: expected ${expectedPath} to export ` +
        'persistBettingSnapshot / restoreBettingSnapshot / clearBettingSnapshot, ' +
        'keyed on sessionStorage["betting_state_${sessionId}"] (design Change 10, task 9.5).',
    )
  }

  let loaded: Record<string, unknown>
  try {
    loaded = (await import(/* @vite-ignore */ SNAPSHOT_MODULE_SPECIFIER)) as Record<string, unknown>
  } catch (error) {
    throw new Error(
      `Betting snapshot module at ${expectedPath} failed to load: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }

  const required = ['persistBettingSnapshot', 'restoreBettingSnapshot', 'clearBettingSnapshot']
  const missing = required.filter((name) => typeof loaded[name] !== 'function')
  if (missing.length > 0) {
    throw new Error(
      `Betting snapshot module at ${expectedPath} does not export: ${missing.join(', ')}`,
    )
  }

  return loaded as unknown as BettingSnapshotModule
}

// ─── Generators ──────────────────────────────────────────────────────────────

const BET_TYPES = [
  'round_leader',
  'most_incorrect',
  'most_correct',
  'highest_single_clue',
  'daily_double_finder',
  'sweep_category',
  'zero_score_round',
  'no_wrong_answers',
  'first_incorrect',
  'biggest_earner',
  'bottom_feeder',
] as const

const PLAYER_NAMES = ['Alice', 'Bob', 'Charlie', 'Dana'] as const

const betTypeArb = fc.constantFrom(...BET_TYPES)
const playerNameArb = fc.constantFrom(...PLAYER_NAMES)
const sessionIdArb = fc.stringMatching(/^[A-Z0-9]{6}$/)

const snapshotArb: fc.Arbitrary<BettingSnapshot> = fc.record({
  availableBets: fc.uniqueArray(
    fc.record({ betType: betTypeArb, description: fc.string({ maxLength: 40 }) }),
    { selector: (bet) => bet.betType, minLength: 1, maxLength: 5 },
  ),
  timerDuration: fc.integer({ min: 0, max: 600 }),
  playerBalances: fc.dictionary(playerNameArb, fc.integer({ min: 0, max: 10_000 }), {
    minKeys: 1,
    maxKeys: 4,
  }),
  placedBets: fc.uniqueArray(
    fc.record({
      betType: betTypeArb,
      wager: fc.integer({ min: 1, max: 5_000 }),
      prediction: playerNameArb,
    }),
    { selector: (bet) => bet.betType, maxLength: 4 },
  ),
  finalized: fc.boolean(),
})

// ─── Fake channel ─────────────────────────────────────────────────────────────

interface Envelope {
  type: string
  event: string
  payload: Record<string, unknown>
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
 * performs.
 */
function createFakeChannel(): FakeChannel {
  const sent: Envelope[] = []
  const handlers: { event: string; cb: (arg: { payload: unknown }) => void }[] = []

  const channel = {
    send: vi.fn(async (envelope: Envelope) => {
      sent.push(envelope)
      for (const handler of handlers) {
        if (handler.event === envelope.event) {
          handler.cb({ payload: envelope.payload })
        }
      }
      return 'ok'
    }),
    on: vi.fn((type: string, filter: { event?: string }, cb: (arg: { payload: unknown }) => void) => {
      if (type === 'broadcast' && filter?.event) {
        handlers.push({ event: filter.event, cb })
      }
      return channel
    }),
    subscribe: vi.fn(),
    track: vi.fn(async () => {}),
    untrack: vi.fn(async () => {}),
    presenceState: vi.fn(() => ({})),
  }

  return { channel: channel as unknown as RealtimeChannel, sent, handlers }
}

/**
 * The broadcast event name every listener in the app subscribes to, read straight
 * out of the production `onChannelMessage` helper rather than hardcoded.
 */
function subscribedBroadcastEvent(): string {
  const probe = createFakeChannel()
  onChannelMessage(probe.channel, () => {})
  expect(probe.handlers).toHaveLength(1)
  return probe.handlers[0].event
}

const SUBSCRIBED_EVENT = subscribedBroadcastEvent()

/** Delivers a message to the page exactly as the host's broadcast would. */
function deliver(fake: FakeChannel, message: ChannelMessage): void {
  act(() => {
    for (const handler of fake.handlers) {
      if (handler.event === SUBSCRIBED_EVENT) {
        handler.cb({ payload: message })
      }
    }
  })
}

// ─── Session fixture ─────────────────────────────────────────────────────────

function makeSession(): GameSessionRow {
  return {
    id: TEST_SESSION_ID,
    host_user_id: 'host-1',
    game_id: 'game-1',
    // The host writes 'buzzer' for its own `betting` phase — nothing persisted
    // identifies an active betting phase. This is the `C_restore` precondition.
    phase: 'buzzer',
    is_locked: false,
    players: [
      { name: 'Alice', score: 0, joinedAt: new Date().toISOString() },
      { name: 'Bob', score: 0, joinedAt: new Date().toISOString() },
    ],
    buzz_state: { clueActive: false, queue: [], lockedOut: [], systemLocked: false },
    final_jeopardy_state: { wagers: [], submissions: [], revealedIndex: -1 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

type BettingStartMessage = Extract<ChannelMessage, { type: 'betting_start' }>

const BETTING_START: BettingStartMessage = {
  type: 'betting_start',
  availableBets: [
    { betType: 'round_leader', description: 'Who will lead after this round?' },
    { betType: 'most_incorrect', description: 'Who will get the most wrong?' },
    { betType: 'most_correct', description: 'Who will get the most correct?' },
  ],
  timerDuration: 60,
  playerBalances: { Alice: 1000, Bob: 1000 },
}

// ─── Property 4: snapshot round-trip ─────────────────────────────────────────

describe('Property 4: Bug Condition - Betting Snapshot Survives A Reload', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('restore(persist(snapshot)) deep-equals the original snapshot', async () => {
    const snapshotModule = await loadSnapshotModule()

    fc.assert(
      fc.property(sessionIdArb, snapshotArb, (sessionId, snapshot) => {
        sessionStorage.clear()

        snapshotModule.persistBettingSnapshot(sessionId, snapshot)

        // Tab-scoped, under the documented key
        expect(sessionStorage.getItem(snapshotKey(sessionId))).not.toBeNull()

        expect(snapshotModule.restoreBettingSnapshot(sessionId)).toEqual(snapshot)

        // Clearing removes it (host sends betting_complete / session_ended)
        snapshotModule.clearBettingSnapshot(sessionId)
        expect(snapshotModule.restoreBettingSnapshot(sessionId)).toBeNull()
      }),
      { numRuns: 200 },
    )
  })

  it('pinned example: a submitted snapshot round-trips with its finalized flag', async () => {
    const snapshotModule = await loadSnapshotModule()

    const snapshot: BettingSnapshot = {
      availableBets: [
        { betType: 'round_leader', description: 'Who will lead after this round?' },
        { betType: 'most_incorrect', description: 'Who will get the most wrong?' },
      ],
      timerDuration: 60,
      playerBalances: { Alice: 1000, Bob: 1000 },
      placedBets: [{ betType: 'round_leader', wager: 250, prediction: 'Bob' }],
      finalized: true,
    }

    snapshotModule.persistBettingSnapshot(TEST_SESSION_ID, snapshot)
    expect(snapshotModule.restoreBettingSnapshot(TEST_SESSION_ID)).toEqual(snapshot)
  })
})

// ─── Component-level check: reload during betting (C_restore) ────────────────

describe('C_restore: reloading the buzzer page mid-betting', () => {
  let fake: FakeChannel

  beforeEach(() => {
    sessionStorage.clear()
    // The player already joined — same pattern PlaySessionPage restores names with
    sessionStorage.setItem(`buzzer_name_${TEST_SESSION_ID}`, 'Alice')
    fake = createFakeChannel()
    hoisted.sessionId = TEST_SESSION_ID
    hoisted.gameSession = {
      session: makeSession(),
      connectionState: 'connected',
      channel: fake.channel,
      error: null,
    }
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('restores the betting panel after a remount while the persisted phase is buzzer', () => {
    render(createElement(PlaySessionPage))

    // Betting starts — the panel is shown (this part works on unfixed code)
    deliver(fake, BETTING_START)
    expect(screen.getByRole('heading', { name: 'Place Your Bets' })).toBeInTheDocument()

    // Simulate a page reload: the tab unmounts and mounts again with no replay of
    // `betting_start`. sessionStorage survives a reload; component state does not.
    cleanup()
    render(createElement(PlaySessionPage))

    expect(
      screen.queryByRole('heading', { name: 'Place Your Bets' }),
      'after a reload during betting the player should land back on the betting panel, not the buzzer',
    ).toBeInTheDocument()
  })

  it('renders the finalized confirmation from a restored finalized snapshot and cannot double-submit', () => {
    const snapshot: BettingSnapshot = {
      availableBets: BETTING_START.availableBets,
      timerDuration: BETTING_START.timerDuration,
      playerBalances: BETTING_START.playerBalances,
      placedBets: [{ betType: 'round_leader', wager: 250, prediction: 'Bob' }],
      finalized: true,
    }
    sessionStorage.setItem(snapshotKey(TEST_SESSION_ID), JSON.stringify(snapshot))

    render(createElement(PlaySessionPage))

    expect(
      screen.queryByRole('heading', { name: 'Betting Complete' }),
      'a restored snapshot with finalized: true should render the finalized confirmation',
    ).toBeInTheDocument()
    expect(screen.getByText(/1 bet placed/)).toBeInTheDocument()

    // No path back to submitting: the active form must not be rendered
    expect(
      screen.queryByRole('button', { name: 'Submit Bets' }),
      'a restored finalized player must not be able to submit again',
    ).not.toBeInTheDocument()

    const submitted = fake.sent.filter(
      (envelope) => (envelope.payload as { type?: string }).type === 'betting_submitted',
    )
    expect(submitted).toHaveLength(0)
  })

  it('a restored in-progress snapshot keeps the bets the player already placed', () => {
    const snapshot: BettingSnapshot = {
      availableBets: BETTING_START.availableBets,
      timerDuration: BETTING_START.timerDuration,
      playerBalances: BETTING_START.playerBalances,
      placedBets: [{ betType: 'round_leader', wager: 250, prediction: 'Bob' }],
      finalized: false,
    }
    sessionStorage.setItem(snapshotKey(TEST_SESSION_ID), JSON.stringify(snapshot))

    render(createElement(PlaySessionPage))

    expect(
      screen.queryByRole('heading', { name: 'Place Your Bets' }),
      'a restored in-progress snapshot should render the active betting form',
    ).toBeInTheDocument()
    expect(screen.getByText('$250')).toBeInTheDocument()
    // The placed wager is still reserved against the balance
    expect(screen.getByText(/Available: \$750/)).toBeInTheDocument()

    // The player can still finish from the restored state
    fireEvent.click(screen.getByRole('button', { name: 'Submit Bets' }))
    const submitted = fake.sent.filter(
      (envelope) => (envelope.payload as { type?: string }).type === 'betting_submitted',
    )
    expect(submitted).toHaveLength(1)
    expect(submitted[0].payload.bets).toEqual(snapshot.placedBets)
  })
})
