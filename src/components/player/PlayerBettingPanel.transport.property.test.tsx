// @vitest-environment jsdom
/**
 * Bug condition exploration test — betting-submission-fixes, Property 2.
 *
 * Property 2: Bug Condition — Player Betting Messages Reach The Host
 *
 * **Validates: Requirements 1.4, 1.5, 2.4, 2.5, 3.6**
 *
 * These tests are EXPECTED TO FAIL on unfixed code. The failure is the deliverable:
 * it proves `C_transport` — the player-side betting call sites emit on the
 * `game_message` broadcast event while the only subscriber (`onChannelMessage`)
 * filters on `session_event`, so the host's `betting_submitted` / `betting_done`
 * branches never run.
 *
 * The subscribed event name is never hardcoded here: it is discovered by
 * registering a listener through the real `onChannelMessage` and reading back the
 * filter it asked for. The emitted event name comes from the real component code.
 *
 * This also discriminates root cause (b) transport mismatch from (d) DOM/state
 * timing: the fake channel fans out synchronously to every handler registered for
 * the emitted event, so if the event names matched, the host branch would run in
 * the same tick. A failure on the event-name assertion alone therefore points at
 * transport, not at rendering or state timing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import fc from 'fast-check'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ChannelMessage, GameSessionRow } from '../../types/session'
import { onChannelMessage } from '../../utils/sessionChannel'
import { PlayerBettingPanel } from './PlayerBettingPanel'

// The Supabase client is only needed for channel construction, which these tests
// replace with a fake channel. Stubbing it keeps `sessionChannel` itself real.
vi.mock('../../utils/supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(async () => {}),
  },
}))

const TEST_SESSION_ID = 'transport-test-session'

const hoisted = vi.hoisted(() => ({
  gameSession: {
    session: null as GameSessionRow | null,
    connectionState: 'connected' as string,
    channel: null as RealtimeChannel | null,
    error: null as string | null,
  },
  sessionId: 'transport-test-session',
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ sessionId: hoisted.sessionId }),
}))

vi.mock('../../hooks/useGameSession', () => ({
  useGameSession: () => hoisted.gameSession,
}))

// Imported after the mocks above so PlaySessionPage picks them up.
import { PlaySessionPage } from '../../routes/pages/PlaySessionPage'

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
 * registered for that exact broadcast event name — the same routing Supabase
 * Realtime performs.
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

// ─── Host listener (mirrors GamePage's betting cases) ─────────────────────────

interface HostRecorder {
  handler: (message: ChannelMessage) => void
  receivedBets: Record<string, { count: number; totalWagered: number }>
  playersDone: Set<string>
  collectedBets: { playerName: string; betType: string; wager: number; prediction: string }[]
}

/**
 * Reproduces the host's `betting_submitted` / `betting_done` handling from
 * `GamePage`: bet count + total wagered per player, plus the done set.
 */
function createHostRecorder(): HostRecorder {
  const receivedBets: Record<string, { count: number; totalWagered: number }> = {}
  const playersDone = new Set<string>()
  const collectedBets: { playerName: string; betType: string; wager: number; prediction: string }[] = []

  const handler = (message: ChannelMessage) => {
    const m = message as unknown as {
      type: string
      playerName: string
      bets?: { betType: string; wager: number; prediction: string }[]
    }
    if (m.type === 'betting_submitted') {
      const bets = m.bets ?? []
      for (const bet of bets) {
        collectedBets.push({ playerName: m.playerName, ...bet })
      }
      const existing = receivedBets[m.playerName] ?? { count: 0, totalWagered: 0 }
      receivedBets[m.playerName] = {
        count: existing.count + bets.length,
        totalWagered: existing.totalWagered + bets.reduce((sum, b) => sum + b.wager, 0),
      }
      playersDone.add(m.playerName)
    } else if (m.type === 'betting_done') {
      playersDone.add(m.playerName)
    }
  }

  return { handler, receivedBets, playersDone, collectedBets }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PLAYER_NAME = 'Alice'
const PLAYERS = ['Alice', 'Bob', 'Charlie']
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

/** Non-empty, unique-per-bet-type, cumulatively within balance. */
const placedBetsArb = fc.uniqueArray(
  fc.record({
    betType: fc.constantFrom(...AVAILABLE_BETS.map((b) => b.betType)),
    wager: fc.integer({ min: 1, max: 300 }),
    prediction: fc.constantFrom(...PLAYERS),
  }),
  { minLength: 1, maxLength: 3, selector: (b) => b.betType }
)

/** Drives the real panel UI to place each bet, then taps Submit Bets. */
function placeAndSubmit(bets: PlacedBet[]) {
  for (const bet of bets) {
    fireEvent.change(screen.getByLabelText('Bet Type'), { target: { value: bet.betType } })
    fireEvent.change(screen.getByLabelText('Prediction'), { target: { value: bet.prediction } })
    fireEvent.change(screen.getByLabelText('Wager'), { target: { value: String(bet.wager) } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))
  }
  fireEvent.click(screen.getByRole('button', { name: 'Submit Bets' }))
}

function makeSession(): GameSessionRow {
  return {
    id: TEST_SESSION_ID,
    host_user_id: 'host-uuid',
    game_id: 'game-1',
    phase: 'buzzer',
    is_locked: false,
    players: PLAYERS.map((name) => ({ name, score: 0, joinedAt: '2024-01-01T00:00:00Z' })),
    buzz_state: { clueActive: false, queue: [], lockedOut: [], systemLocked: false },
    final_jeopardy_state: { wagers: [], submissions: [], revealedIndex: -1 },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 2: Bug Condition — Player Betting Messages Reach The Host', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('pinned counterexample: two submitted bets reach the host on the subscribed event', () => {
    const fake = createFakeChannel()
    const host = createHostRecorder()
    onChannelMessage(fake.channel, host.handler)

    render(
      <PlayerBettingPanel
        availableBets={AVAILABLE_BETS}
        playerBalance={PLAYER_BALANCE}
        timerDuration={60}
        channel={fake.channel}
        playerName={PLAYER_NAME}
        players={PLAYERS}
        onBettingDone={vi.fn()}
      />
    )

    placeAndSubmit([
      { betType: 'round_leader', wager: 100, prediction: 'Bob' },
      { betType: 'most_incorrect', wager: 200, prediction: 'Charlie' },
    ])

    expect(fake.sent).toHaveLength(1)
    // Emitted event must be the one the app actually subscribes to.
    expect(fake.sent[0].event).toBe(SUBSCRIBED_EVENT)
    expect(fake.sent[0].payload.type).toBe('betting_submitted')
    // Host branch must have run.
    expect(host.receivedBets[PLAYER_NAME]).toEqual({ count: 2, totalWagered: 300 })
    expect(host.playersDone.has(PLAYER_NAME)).toBe(true)
  })

  it('for any non-empty placed-bet list, exactly one broadcast reaches the host listener intact', () => {
    fc.assert(
      fc.property(placedBetsArb, (bets) => {
        const fake = createFakeChannel()
        const host = createHostRecorder()
        onChannelMessage(fake.channel, host.handler)

        render(
          <PlayerBettingPanel
            availableBets={AVAILABLE_BETS}
            playerBalance={PLAYER_BALANCE}
            timerDuration={60}
            channel={fake.channel}
            playerName={PLAYER_NAME}
            players={PLAYERS}
            onBettingDone={vi.fn()}
          />
        )

        try {
          placeAndSubmit(bets)

          const totalWagered = bets.reduce((sum, b) => sum + b.wager, 0)

          // Exactly one broadcast (Req 3.6).
          expect(fake.sent).toHaveLength(1)
          const envelope = fake.sent[0]
          expect(envelope.type).toBe('broadcast')
          // Emitted event name === subscribed event name (Req 2.4).
          expect(envelope.event).toBe(SUBSCRIBED_EVENT)
          expect(envelope.payload.type).toBe('betting_submitted')
          expect(envelope.payload.playerName).toBe(PLAYER_NAME)
          expect(envelope.payload.bets).toEqual(bets)

          // playerName / bets round-trip into the host's recorded state.
          expect(host.receivedBets[PLAYER_NAME]).toEqual({
            count: bets.length,
            totalWagered,
          })
          expect(host.playersDone.has(PLAYER_NAME)).toBe(true)
          expect(host.collectedBets).toEqual(
            bets.map((b) => ({ playerName: PLAYER_NAME, ...b }))
          )
        } finally {
          cleanup()
        }
      }),
      { numRuns: 30 }
    )
  })

  it('betting_done from PlaySessionPage is emitted on the subscribed event and marks the player done', () => {
    hoisted.sessionId = TEST_SESSION_ID
    sessionStorage.setItem(`buzzer_name_${TEST_SESSION_ID}`, PLAYER_NAME)

    const fake = createFakeChannel()
    const host = createHostRecorder()
    onChannelMessage(fake.channel, host.handler)

    hoisted.gameSession.session = makeSession()
    hoisted.gameSession.channel = fake.channel
    hoisted.gameSession.connectionState = 'connected'
    hoisted.gameSession.error = null

    render(<PlaySessionPage />)

    // Put the player into the betting phase the way the host does.
    act(() => {
      void fake.channel.send({
        type: 'broadcast',
        event: SUBSCRIBED_EVENT,
        payload: {
          type: 'betting_start',
          availableBets: AVAILABLE_BETS,
          timerDuration: 60,
          playerBalances: { Alice: PLAYER_BALANCE, Bob: PLAYER_BALANCE, Charlie: PLAYER_BALANCE },
        },
      } as Parameters<RealtimeChannel['send']>[0])
    })

    expect(screen.getByText('Place Your Bets')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skip Betting' }))

    const doneEnvelopes = fake.sent.filter(
      (e) => (e.payload as { type?: string }).type === 'betting_done'
    )
    expect(doneEnvelopes).toHaveLength(1)
    // Same event-name requirement as betting_submitted (Req 2.5).
    expect(doneEnvelopes[0].event).toBe(SUBSCRIBED_EVENT)
    expect(host.playersDone.has(PLAYER_NAME)).toBe(true)
  })
})

// ─── Property 3 helpers ───────────────────────────────────────────────────────

/**
 * Bug condition exploration test — betting-submission-fixes, Property 3.
 *
 * Property 3: Bug Condition — Empty Submission Is Inert
 *
 * **Validates: Requirements 1.6, 1.8, 2.6, 2.8**
 *
 * EXPECTED TO FAIL on unfixed code. The failures are the deliverable:
 *  - `handleSubmitBets` has no `placedBets.length === 0` early return, so invoking
 *    it directly broadcasts an empty `bets` array, finalizes the panel and calls
 *    `onBettingDone` (`C_transport`, Req 1.8).
 *  - With no channel it instead sets the "Connection unavailable" submit error —
 *    still a state change where none is allowed (Req 2.8).
 *  - The disabled Submit Bets button carries no `aria-describedby` and no visible
 *    reason (Req 2.8).
 *  - Skip Betting calls `onBettingDone()` without setting `isFinalized`, so the
 *    active form stays rendered (`C_feedback`, Req 1.6 / 2.6).
 */

type ChannelKind = 'live' | 'missing'

interface ChannelState {
  kind: ChannelKind
  /** Unrelated broadcasts already pushed through the channel before submitting. */
  priorBroadcasts: number
  /** Whether a host listener is registered through the real `onChannelMessage`. */
  hostListening: boolean
  /** Reach `placedBets = []` by adding a bet and removing it again. */
  viaAddThenRemove: boolean
}

const channelStateArb: fc.Arbitrary<ChannelState> = fc.record({
  kind: fc.constantFrom<ChannelKind>('live', 'missing'),
  priorBroadcasts: fc.integer({ min: 0, max: 2 }),
  hostListening: fc.boolean(),
  viaAddThenRemove: fc.boolean(),
})

/**
 * Invokes the submit-bets handler directly, past the view-layer `disabled` guard.
 *
 * React refuses to dispatch mouse events to a `disabled` form element, so a
 * simulated click can never reach `handleSubmitBets` while `placedBets` is empty.
 * Req 2.8 is about the handler itself being inert, so the test reads the real
 * `onClick` off the rendered button and calls it — exactly what a programmatic
 * invocation, a re-entrant event, or a future caller would do.
 */
function invokeSubmitHandlerDirectly() {
  const button = screen.getByRole('button', { name: 'Submit Bets' })
  const propsKey = Object.keys(button).find((k) => k.startsWith('__reactProps$'))
  expect(propsKey).toBeTruthy()
  const props = (button as unknown as Record<string, { onClick?: () => void; disabled?: boolean }>)[
    propsKey as string
  ]
  // The view-layer guard is expected to still be in place …
  expect(props.disabled).toBe(true)
  // … but the handler behind it must also be inert.
  expect(typeof props.onClick).toBe('function')
  act(() => {
    props.onClick?.()
  })
}

function addOneBetThenRemoveIt() {
  fireEvent.change(screen.getByLabelText('Bet Type'), { target: { value: 'round_leader' } })
  fireEvent.change(screen.getByLabelText('Prediction'), { target: { value: 'Bob' } })
  fireEvent.change(screen.getByLabelText('Wager'), { target: { value: '50' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))
  fireEvent.click(
    screen.getByRole('button', { name: /^Remove bet on / })
  )
}

describe('Property 3: Bug Condition — Empty Submission Is Inert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('pinned counterexample: invoking submit with zero placed bets sends nothing and changes nothing', () => {
    const fake = createFakeChannel()
    const host = createHostRecorder()
    onChannelMessage(fake.channel, host.handler)
    const onBettingDone = vi.fn()

    render(
      <PlayerBettingPanel
        availableBets={AVAILABLE_BETS}
        playerBalance={PLAYER_BALANCE}
        timerDuration={60}
        channel={fake.channel}
        playerName={PLAYER_NAME}
        players={PLAYERS}
        onBettingDone={onBettingDone}
      />
    )

    invokeSubmitHandlerDirectly()

    // No broadcast at all (Req 2.8).
    expect(fake.sent).toHaveLength(0)
    expect(host.playersDone.size).toBe(0)
    // Panel state unchanged: still the active form, no submit error, not finalized.
    expect(screen.getByText('Place Your Bets')).toBeInTheDocument()
    expect(screen.queryByText('Betting Complete')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onBettingDone).not.toHaveBeenCalled()
  })

  it('for any channel state, invoking submit with zero placed bets is inert', () => {
    fc.assert(
      fc.property(channelStateArb, (state) => {
        const fake = createFakeChannel()
        const host = createHostRecorder()
        if (state.hostListening) {
          onChannelMessage(fake.channel, host.handler)
        }
        const onBettingDone = vi.fn()

        for (let i = 0; i < state.priorBroadcasts; i++) {
          void fake.channel.send({
            type: 'broadcast',
            event: SUBSCRIBED_EVENT,
            payload: { type: 'gambling_balance_update', balances: {} },
          } as Parameters<RealtimeChannel['send']>[0])
        }
        const sentBefore = fake.sent.length

        render(
          <PlayerBettingPanel
            availableBets={AVAILABLE_BETS}
            playerBalance={PLAYER_BALANCE}
            timerDuration={60}
            channel={state.kind === 'live' ? fake.channel : null}
            playerName={PLAYER_NAME}
            players={PLAYERS}
            onBettingDone={onBettingDone}
          />
        )

        try {
          if (state.viaAddThenRemove) {
            addOneBetThenRemoveIt()
          }

          invokeSubmitHandlerDirectly()

          // No new broadcast (Req 2.8).
          expect(fake.sent.length - sentBefore).toBe(0)
          // Host never sees a submission.
          expect(host.receivedBets[PLAYER_NAME]).toBeUndefined()
          expect(host.playersDone.has(PLAYER_NAME)).toBe(false)
          // Panel state unchanged: not finalized, no submit error.
          expect(screen.getByText('Place Your Bets')).toBeInTheDocument()
          expect(screen.queryByText('Betting Complete')).not.toBeInTheDocument()
          expect(screen.queryByRole('alert')).not.toBeInTheDocument()
          expect(onBettingDone).not.toHaveBeenCalled()
        } finally {
          cleanup()
        }
      }),
      { numRuns: 30 }
    )
  })

  it('the disabled Submit Bets button is accompanied by a visible reason wired via aria-describedby', () => {
    const fake = createFakeChannel()

    render(
      <PlayerBettingPanel
        availableBets={AVAILABLE_BETS}
        playerBalance={PLAYER_BALANCE}
        timerDuration={60}
        channel={fake.channel}
        playerName={PLAYER_NAME}
        players={PLAYERS}
        onBettingDone={vi.fn()}
      />
    )

    const button = screen.getByRole('button', { name: 'Submit Bets' })
    expect(button).toBeDisabled()

    const describedBy = button.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()

    const described = (describedBy ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id))

    expect(described.length).toBeGreaterThan(0)
    for (const el of described) {
      expect(el).not.toBeNull()
    }
    // At least one referenced element must carry a visible explanation.
    const reasons = described.filter((el): el is HTMLElement => el !== null)
    expect(reasons.some((el) => el.textContent?.trim())).toBe(true)
    expect(reasons.map((el) => el.textContent ?? '').join(' ')).toMatch(/at least one bet/i)
    for (const el of reasons) {
      if (el.textContent?.trim()) {
        expect(el).toBeVisible()
      }
    }
  })

  it('tapping Skip Betting renders the finalized confirmation instead of the active form', () => {
    const fake = createFakeChannel()
    const onBettingDone = vi.fn()

    render(
      <PlayerBettingPanel
        availableBets={AVAILABLE_BETS}
        playerBalance={PLAYER_BALANCE}
        timerDuration={60}
        channel={fake.channel}
        playerName={PLAYER_NAME}
        players={PLAYERS}
        onBettingDone={onBettingDone}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Skip Betting' }))

    // C_feedback: the panel must advance to the finalized confirmation (Req 2.6).
    expect(onBettingDone).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Betting Complete')).toBeInTheDocument()
    expect(screen.getByText('No bets placed')).toBeInTheDocument()
    expect(screen.queryByText('Place Your Bets')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit Bets' })).not.toBeInTheDocument()
  })
})
