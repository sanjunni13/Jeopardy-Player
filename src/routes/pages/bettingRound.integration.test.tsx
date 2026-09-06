// @vitest-environment jsdom
/**
 * Integration coverage for the repaired betting round — betting-submission-fixes, task 10.
 *
 * **Validates: Requirements 2.4, 2.5, 2.7, 3.7, 3.8**
 *
 * These are end-to-end round tests, not property tests. They exercise the two
 * fixes together across the real player device, the real host status view, the
 * real channel helpers, and the real scoring utilities.
 *
 * ── What is REAL here ────────────────────────────────────────────────────────
 *  - `PlaySessionPage` (mounted, one instance per simulated player device) and
 *    everything it renders: `PlayerBettingPanel`, `BuzzerPage`.
 *  - `broadcastMessage` / `onChannelMessage` from `src/utils/sessionChannel.ts`.
 *    The broadcast event name is never hardcoded — it is discovered from the real
 *    `onChannelMessage` subscription.
 *  - `bettingSnapshot` persistence (`sessionStorage`), driven only through the page.
 *  - `BettingStatusView` (the host's read-only betting screen).
 *  - `BettingSideGames` (the solo, single-device host flow).
 *  - `gamblingScoring`: `BET_DESCRIPTIONS`, `computeRoundResult`.
 *  - `gamblingAllowance`: `beginGamblingPhases`, `budgetViews`,
 *    `discardGamblingPhases`, `unspentBudget`.
 *  - `gamblingSettlement`: `settleWinningBid`, `settlePlacedWagers`,
 *    `settleRoundBets` — the same funding-aware arithmetic `GamePage` calls, so
 *    the harness never carries its own copy of the settlement rules.
 *
 * ── What is MODELLED ─────────────────────────────────────────────────────────
 *  - `GamePage` is not mounted. It is a ~2000-line component that owns the whole
 *    host game loop (board, clues, auctions, Final Jeopardy, DB writes) and is not
 *    practically mountable in a unit test. `HostBettingHarness` below reproduces
 *    exactly its betting slice — `startBetting`, the `betting_submitted` /
 *    `betting_done` cases, `bettingReceivedBets`, `bettingPlayersDone`,
 *    `bettingCollectedBetsRef`, `bettingResolvedRef`, `finalizeBetting`, and the
 *    auto-finalize effect — and renders the real `BettingStatusView`. This is the
 *    same pragmatic approach `sessionChannel.preservation.property.test.ts` takes
 *    for the one-shot finalization guard.
 *  - The Supabase Realtime transport is a fake channel that fans a broadcast out
 *    only to handlers registered for that exact event name, which is the routing
 *    behaviour that made the original bug possible.
 *  - A page reload is modelled as unmount + remount of `PlaySessionPage`, which is
 *    what a reload does to component state while leaving `sessionStorage` intact.
 *
 * Each simulated device gets its own `sessionId` so its `buzzer_name_*` and
 * `betting_state_*` keys stay separate, which is how tab-scoped `sessionStorage`
 * behaves for real players on real devices.
 *
 * No source file is modified by this test file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { render, screen, within, fireEvent, cleanup, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ChannelMessage, GameSessionRow } from '../../types/session'
import type {
  CategoryOwnership,
  ClueAnswerEvent,
  GamblingLedger,
  Player,
  RoundTrackingData,
  SideBet,
  SideBetType,
} from '../../types/game'
import { broadcastMessage, onChannelMessage } from '../../utils/sessionChannel'
import { BET_DESCRIPTIONS, computeRoundResult } from '../../utils/gamblingScoring'
import {
  beginGamblingPhases,
  budgetViews,
  discardGamblingPhases,
  unspentBudget,
  type GamblingBudgetState,
} from '../../utils/gamblingAllowance'
import {
  settlePlacedWagers,
  settleRoundBets,
  settleWinningBid,
  type AuctionOutcome,
  type AuctionSettlementResult,
} from '../../utils/gamblingSettlement'
import { BettingStatusView } from '../../components/host/BettingStatusView'
import { BettingSideGames } from '../../components/game/BettingSideGames'

// The Supabase client is only needed for channel construction, which these tests
// replace with a fake channel. Stubbing it keeps `sessionChannel` itself real.
vi.mock('../../utils/supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(async () => {}),
  },
}))

const hoisted = vi.hoisted(() => ({
  gameSession: {
    session: null as GameSessionRow | null,
    connectionState: 'connected' as string,
    channel: null as RealtimeChannel | null,
    error: null as string | null,
  },
  // Replaced below with a hook that reads the per-device session id from context,
  // so several `PlaySessionPage` instances can be mounted side by side.
  useSessionId: (() => '') as () => string,
}))

vi.mock('../../hooks/useGameSession', () => ({
  useGameSession: () => hoisted.gameSession,
}))

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ sessionId: hoisted.useSessionId() }),
}))

// Imported after the mocks above so PlaySessionPage picks them up.
import { PlaySessionPage } from './PlaySessionPage'

/** Each mounted device reads its own session id from here. */
const DeviceSessionContext = createContext<string>('')

function useDeviceSessionId(): string {
  return useContext(DeviceSessionContext)
}

hoisted.useSessionId = useDeviceSessionId

// ─── Fake channel (models Supabase Realtime broadcast routing) ────────────────

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

function createFakeChannel(): FakeChannel {
  const sent: Envelope[] = []
  const handlers: { event: string; cb: (arg: { payload: unknown }) => void }[] = []

  const channel = {
    send: vi.fn(async (envelope: Envelope) => {
      sent.push(envelope)
      // JSON round-trip, as the payload takes over the wire.
      const overTheWire = JSON.parse(JSON.stringify(envelope.payload)) as unknown
      for (const handler of [...handlers]) {
        if (handler.event === envelope.event) {
          handler.cb({ payload: overTheWire })
        }
      }
      return 'ok'
    }),
    on: vi.fn(
      (type: string, filter: { event?: string }, cb: (arg: { payload: unknown }) => void) => {
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

/** Payloads of a given message type that actually went over the channel. */
function payloadsOfType<T extends ChannelMessage['type']>(
  fake: FakeChannel,
  type: T
): Extract<ChannelMessage, { type: T }>[] {
  return fake.sent
    .map((envelope) => envelope.payload as ChannelMessage)
    .filter((payload): payload is Extract<ChannelMessage, { type: T }> => payload?.type === type)
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STARTING_BALANCE = 1000
const AUCTION_TIMER = 20

function makePlayer(name: string, score = STARTING_BALANCE): Player {
  return {
    name,
    score,
    correctCount: 0,
    incorrectCount: 0,
    correctDailyDoubles: 0,
    incorrectDailyDoubles: 0,
    correctFinalJeopardy: 0,
    incorrectFinalJeopardy: 0,
    totalEarned: 0,
  }
}

function makeSession(names: string[], scores?: Record<string, number>): GameSessionRow {
  return {
    id: 'ROUND1',
    host_user_id: 'host-1',
    game_id: 'game-1',
    // The host writes 'buzzer' for its own `betting` phase — nothing persisted
    // identifies an active betting phase.
    phase: 'buzzer',
    is_locked: false,
    players: names.map((name) => ({
      name,
      score: scores?.[name] ?? STARTING_BALANCE,
      joinedAt: '2024-01-01T00:00:00.000Z',
    })),
    buzz_state: { clueActive: false, queue: [], lockedOut: [], systemLocked: false },
    final_jeopardy_state: { wagers: [], submissions: [], revealedIndex: -1 },
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  }
}

/** Exactly the list `GamePage.startBetting` builds. */
function buildAvailableBets(roundHasDailyDouble: boolean): { betType: string; description: string }[] {
  const bets: { betType: string; description: string }[] = [
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
    bets.push({ betType: 'daily_double_finder', description: BET_DESCRIPTIONS.daily_double_finder })
  }
  return bets
}

// ─── Host betting harness (models GamePage's betting slice) ───────────────────

interface CollectedBet {
  playerName: string
  betType: string
  wager: number
  prediction: string
}

interface Finalization {
  players: Player[]
  ledger: GamblingLedger
  sideBets: SideBet[]
  /** Requirement 1.9 — `null` once the Betting_Phase has ended. */
  budgetState: GamblingBudgetState | null
  ownership: CategoryOwnership
}

interface HostBettingHarnessProps {
  channel: RealtimeChannel
  initialPlayers: Player[]
  roundHasDailyDouble: boolean
  onFinalize: (result: Finalization) => void
  /**
   * A resolved category auction settled before betting opens. Supplied only by
   * the allowance scenario, which needs a winning bid to have already drawn the
   * shared $500 pool down; the harness then renders an "Award Category" button.
   */
  auctionOutcome?: AuctionOutcome
  onAuctionSettled?: (result: AuctionSettlementResult) => void
}

/**
 * Faithful reproduction of `GamePage`'s multiplayer betting slice, rendering the
 * real `BettingStatusView` and using the real channel + settlement helpers.
 *
 * Mirrored from `GamePage.tsx`:
 *  - the `beginGamblingPhases` call on entry to `category-auction`, which freezes
 *    the Allowance_Player classification for both phases
 *  - `resolveCurrentAuction`'s `settleWinningBid` call (behind "Award Category")
 *  - `startBetting`  → resets betting state, broadcasts `betting_start` with
 *    `playerBalances` and `budgets`
 *  - the `betting_submitted` / `betting_done` cases in the channel `switch`
 *  - `bettingReceivedBets`, `bettingPlayersDone`, `bettingCollectedBetsRef`
 *  - `finalizeBetting` → one-shot `bettingResolvedRef` guard, `settlePlacedWagers`,
 *    `discardGamblingPhases`, `activeSideBets`, `betting_complete` +
 *    `gambling_balance_update` broadcasts, then `setPhase('category-reveal')`
 *  - the auto-finalize effect that fires once every player is done
 *
 * The settlement arithmetic itself is never reimplemented here: bids, wagers, and
 * round-end payouts all go through `gamblingSettlement`, which is what the
 * production controllers call.
 */
function HostBettingHarness({
  channel,
  initialPlayers,
  roundHasDailyDouble,
  onFinalize,
  auctionOutcome,
  onAuctionSettled,
}: HostBettingHarnessProps) {
  const [phase, setPhase] = useState<'idle' | 'betting' | 'round'>('idle')
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [receivedBets, setReceivedBets] = useState<
    Record<string, { count: number; totalWagered: number }>
  >({})
  const [playersDone, setPlayersDone] = useState<Set<string>>(() => new Set())

  // GamePage reads these off refs / the session object rather than render state so
  // the handlers and the one-shot guard never see a stale value.
  const resolvedRef = useRef(false)
  const collectedBetsRef = useRef<CollectedBet[]>([])
  const playersRef = useRef<Player[]>(initialPlayers)
  const ledgerRef = useRef<GamblingLedger>([])
  const ownershipRef = useRef<CategoryOwnership>({})
  // `GamePage` calls `beginGamblingPhases` on entry to `category-auction`, before
  // the first category goes up for bid, so the classification is already frozen
  // by the time betting opens.
  const budgetStateRef = useRef<GamblingBudgetState | null>(beginGamblingPhases(initialPlayers))

  /**
   * Mirrors the settlement half of `resolveCurrentAuction`: an allowance-funded
   * winning bid draws the Gambling_Allowance down and leaves Real_Balance alone,
   * a Real_Balance-funded bid is deducted, ownership is recorded either way, and
   * the `bid` entry carries `fundedBy` (Requirements 2.1, 2.2, 2.9).
   */
  const awardCategory = useCallback(() => {
    if (!auctionOutcome) return

    const settlement = settleWinningBid(
      {
        budgetState: budgetStateRef.current ?? beginGamblingPhases(playersRef.current),
        players: playersRef.current,
        ledger: ledgerRef.current,
        ownership: ownershipRef.current,
      },
      auctionOutcome
    )

    budgetStateRef.current = settlement.budgetState
    playersRef.current = settlement.players
    ledgerRef.current = settlement.ledger
    ownershipRef.current = settlement.ownership
    setPlayers(settlement.players)
    onAuctionSettled?.(settlement)
  }, [auctionOutcome, onAuctionSettled])

  const finalizeBetting = useCallback(() => {
    if (resolvedRef.current) return
    resolvedRef.current = true

    const collectedBets = collectedBetsRef.current

    // Requirements 1.4, 2.3, 2.9, 2.10 — every collected wager settles in
    // submission order against the controller's authoritative budget state, so
    // the shared pool draws down across the batch and each `bet_placed` entry and
    // stored `SideBet` carries its funding source.
    const settlement = settlePlacedWagers(
      {
        budgetState: budgetStateRef.current ?? beginGamblingPhases(playersRef.current),
        players: playersRef.current,
        ledger: ledgerRef.current,
      },
      collectedBets.map((bet) => ({
        playerName: bet.playerName,
        betType: bet.betType as SideBetType,
        wager: bet.wager,
        prediction: bet.prediction,
      }))
    )

    const updatedPlayers = settlement.players
    const updatedLedger = settlement.ledger
    const activeSideBets = settlement.bets

    // Requirement 1.9 — the Betting_Phase has ended, so every unspent
    // Gambling_Allowance is discarded with no effect on Real_Balance.
    const discardedBudgetState = discardGamblingPhases()
    budgetStateRef.current = discardedBudgetState

    playersRef.current = updatedPlayers
    ledgerRef.current = updatedLedger
    setPlayers(updatedPlayers)

    broadcastMessage(channel, { type: 'betting_complete' }).catch(() => {})

    const updatedBalances: Record<string, number> = {}
    for (const p of updatedPlayers) {
      updatedBalances[p.name] = p.score
    }
    broadcastMessage(channel, {
      type: 'gambling_balance_update',
      balances: updatedBalances,
    }).catch(() => {})

    // GamePage moves to 'category-reveal' — the round begins.
    setPhase('round')
    onFinalize({
      players: updatedPlayers,
      ledger: updatedLedger,
      sideBets: activeSideBets,
      budgetState: discardedBudgetState,
      ownership: ownershipRef.current,
    })
  }, [channel, onFinalize])

  const startBetting = useCallback(() => {
    setReceivedBets({})
    setPlayersDone(new Set())
    resolvedRef.current = false
    collectedBetsRef.current = []
    setPhase('betting')

    const playerBalances: Record<string, number> = {}
    for (const p of playersRef.current) {
      playerBalances[p.name] = p.score
    }

    // The budget views carry the post-auction pool, so a player device opens the
    // betting panel on the same $500 the Auction_Phase already drew down
    // (Requirement 1.4, 1.7, 1.13).
    const currentBudgetState = budgetStateRef.current
    const budgets = currentBudgetState
      ? budgetViews(currentBudgetState, playersRef.current)
      : undefined

    broadcastMessage(channel, {
      type: 'betting_start',
      availableBets: buildAvailableBets(roundHasDailyDouble),
      timerDuration: AUCTION_TIMER,
      playerBalances,
      budgets,
    }).catch(() => {})
  }, [channel, roundHasDailyDouble])

  useEffect(() => {
    onChannelMessage(channel, (message: ChannelMessage) => {
      switch (message.type) {
        case 'betting_submitted': {
          const { playerName, bets } = message
          for (const bet of bets) {
            collectedBetsRef.current = [
              ...collectedBetsRef.current,
              {
                playerName,
                betType: bet.betType,
                wager: bet.wager,
                prediction: bet.prediction,
              },
            ]
          }
          setReceivedBets((prev) => {
            const existing = prev[playerName] ?? { count: 0, totalWagered: 0 }
            return {
              ...prev,
              [playerName]: {
                count: existing.count + bets.length,
                totalWagered:
                  existing.totalWagered + bets.reduce((sum, b) => sum + b.wager, 0),
              },
            }
          })
          setPlayersDone((prev) => new Set([...prev, playerName]))
          break
        }
        case 'betting_done':
          setPlayersDone((prev) => new Set([...prev, message.playerName]))
          break
        default:
          break
      }
    })
  }, [channel])

  // Auto-finalize once every player is done.
  useEffect(() => {
    if (phase !== 'betting') return
    if (resolvedRef.current) return
    const allDone = playersRef.current.every((p) => playersDone.has(p.name))
    if (allDone && playersDone.size > 0) {
      finalizeBetting()
    }
  }, [playersDone, phase, finalizeBetting])

  return (
    <div data-testid="host">
      {phase === 'idle' && (
        <>
          {auctionOutcome && (
            <button type="button" onClick={awardCategory}>
              Award Category
            </button>
          )}
          <button type="button" onClick={startBetting}>
            Start Betting
          </button>
        </>
      )}
      {phase === 'betting' && (
        <BettingStatusView
          players={players}
          receivedBets={receivedBets}
          playersDone={playersDone}
          onForceEnd={finalizeBetting}
        />
      )}
      {phase === 'round' && <p>Round Begins</p>}
    </div>
  )
}

// ─── Player device wrapper ────────────────────────────────────────────────────

/** One simulated player device: a real `PlaySessionPage` with its own session id. */
function Device({ label, sessionId }: { label: string; sessionId: string }) {
  return (
    <DeviceSessionContext.Provider value={sessionId}>
      <div data-testid={`device-${label}`}>
        <PlaySessionPage />
      </div>
    </DeviceSessionContext.Provider>
  )
}

function deviceSessionId(label: string): string {
  return `DEV-${label.toUpperCase()}`
}

function deviceOf(label: string) {
  return within(screen.getByTestId(`device-${label}`))
}

function hostView() {
  return within(screen.getByTestId('host'))
}

// ─── Interaction helpers ──────────────────────────────────────────────────────

interface PlacedBet {
  betType: string
  wager: number
  prediction: string
}

type Scope = ReturnType<typeof within>

/**
 * Drives the real `PlayerBettingPanel` form.
 *
 * Queried by role rather than by label: several devices are mounted in one
 * document here, so the panel's element ids repeat. That is a test-harness
 * artefact only — a real player device renders exactly one panel.
 */
function placeBet(device: Scope, bet: PlacedBet): void {
  const [betTypeSelect, predictionSelect] = device.getAllByRole('combobox')
  fireEvent.change(betTypeSelect, { target: { value: bet.betType } })
  fireEvent.change(predictionSelect, { target: { value: bet.prediction } })
  fireEvent.change(device.getByRole('textbox'), { target: { value: String(bet.wager) } })
  fireEvent.click(device.getByRole('button', { name: 'Add Bet' }))
}

function submitBets(device: Scope): void {
  fireEvent.click(device.getByRole('button', { name: 'Submit Bets' }))
}

function skipBetting(device: Scope): void {
  fireEvent.click(device.getByRole('button', { name: 'Skip Betting' }))
}

/** The status text the host's real `BettingStatusView` shows for a player. */
function hostStatusFor(name: string): string {
  const item = hostView().getByText(name).closest('li')
  const status = item?.querySelector('.betting-status-view__player-status')
  return status?.textContent?.trim() ?? ''
}

/** Flushes the promise queue inside `act` so channel sends settle. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

// ─── Test setup ───────────────────────────────────────────────────────────────

const PLAYERS = ['Alice', 'Bob']

function setupRound(options?: {
  roundHasDailyDouble?: boolean
  devices?: string[]
  /** Session roster. Defaults to the two even-balance players. */
  players?: string[]
  /** Starting Real_Balance per player. Anyone omitted starts at $1,000. */
  scores?: Record<string, number>
  /** A category auction settled before betting opens. */
  auctionOutcome?: AuctionOutcome
}) {
  const roster = options?.players ?? PLAYERS
  const devices = options?.devices ?? roster
  const fake = createFakeChannel()
  const finalizations: Finalization[] = []
  const auctionSettlements: AuctionSettlementResult[] = []

  hoisted.gameSession = {
    session: makeSession(roster, options?.scores),
    connectionState: 'connected',
    channel: fake.channel,
    error: null,
  }

  for (const name of devices) {
    sessionStorage.setItem(`buzzer_name_${deviceSessionId(name)}`, name)
  }

  // The host stays mounted across device remounts, so a "reload" on one device
  // never resets the host's betting state.
  const tree = (mounted: string[]) => (
    <>
      <HostBettingHarness
        channel={fake.channel}
        initialPlayers={roster.map((name) => makePlayer(name, options?.scores?.[name]))}
        roundHasDailyDouble={options?.roundHasDailyDouble ?? false}
        onFinalize={(result) => finalizations.push(result)}
        auctionOutcome={options?.auctionOutcome}
        onAuctionSettled={(result) => auctionSettlements.push(result)}
      />
      {mounted.map((name) => (
        <Device key={name} label={name} sessionId={deviceSessionId(name)} />
      ))}
    </>
  )

  const { rerender } = render(tree(devices))

  return {
    fake,
    finalizations,
    auctionSettlements,
    /** Models a page reload on one device: component state is lost, storage is not. */
    reloadDevice(name: string) {
      rerender(tree(devices.filter((d) => d !== name)))
      rerender(tree(devices))
    },
  }
}

function startBetting(): void {
  fireEvent.click(hostView().getByRole('button', { name: 'Start Betting' }))
}

/** Resolves the configured category auction before betting opens. */
function awardCategory(): void {
  fireEvent.click(hostView().getByRole('button', { name: 'Award Category' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

// ─── Scenario 1: full multiplayer round ───────────────────────────────────────

describe('Integration — a full multiplayer betting round (Req 2.4, 2.5, 3.7)', () => {
  it('both players submit, the host registers both, finalization fires once, and the round begins', async () => {
    const { fake, finalizations } = setupRound()

    startBetting()
    await flush()

    // `betting_start` reaches both real player devices.
    expect(deviceOf('Alice').getByRole('heading', { name: 'Place Your Bets' })).toBeInTheDocument()
    expect(deviceOf('Bob').getByRole('heading', { name: 'Place Your Bets' })).toBeInTheDocument()
    expect(hostStatusFor('Alice')).toBe('Waiting…')
    expect(hostStatusFor('Bob')).toBe('Waiting…')

    placeBet(deviceOf('Alice'), { betType: 'round_leader', wager: 100, prediction: 'Bob' })
    placeBet(deviceOf('Alice'), { betType: 'most_incorrect', wager: 200, prediction: 'Bob' })
    submitBets(deviceOf('Alice'))
    await flush()

    // Bet count and total wagered register on the host (Req 2.4).
    expect(hostStatusFor('Alice')).toBe('Done · 2 bets · $300')
    expect(hostStatusFor('Bob')).toBe('Waiting…')
    expect(finalizations).toHaveLength(0)
    expect(deviceOf('Alice').getByRole('heading', { name: 'Betting Complete' })).toBeInTheDocument()

    placeBet(deviceOf('Bob'), { betType: 'biggest_earner', wager: 250, prediction: 'Alice' })
    submitBets(deviceOf('Bob'))
    await flush()

    // Auto-finalize fired exactly once (Req 3.7).
    expect(finalizations).toHaveLength(1)
    const [result] = finalizations

    // Wagers deducted.
    expect(result.players.map((p) => [p.name, p.score])).toEqual([
      ['Alice', 700],
      ['Bob', 750],
    ])

    // A `bet_placed` ledger entry per bet, in arrival order. Every player started
    // above $0, so each wager is Real_Balance-funded (Requirement 2.9).
    expect(result.ledger).toEqual([
      {
        type: 'bet_placed',
        playerName: 'Alice',
        amount: 100,
        label: 'round_leader',
        fundedBy: 'balance',
        order: 0,
      },
      {
        type: 'bet_placed',
        playerName: 'Alice',
        amount: 200,
        label: 'most_incorrect',
        fundedBy: 'balance',
        order: 1,
      },
      {
        type: 'bet_placed',
        playerName: 'Bob',
        amount: 250,
        label: 'biggest_earner',
        fundedBy: 'balance',
        order: 2,
      },
    ])

    // Every placed bet becomes an active side bet for the round.
    expect(result.sideBets).toEqual([
      {
        playerName: 'Alice',
        betType: 'round_leader',
        wager: 100,
        prediction: 'Bob',
        fundedBy: 'balance',
      },
      {
        playerName: 'Alice',
        betType: 'most_incorrect',
        wager: 200,
        prediction: 'Bob',
        fundedBy: 'balance',
      },
      {
        playerName: 'Bob',
        betType: 'biggest_earner',
        wager: 250,
        prediction: 'Alice',
        fundedBy: 'balance',
      },
    ])

    // Requirement 1.9 — the allowance pool is discarded when betting ends.
    expect(result.budgetState).toBeNull()

    // One batched submission per player (Req 3.6) and one done notice each (Req 2.5).
    expect(payloadsOfType(fake, 'betting_submitted')).toHaveLength(2)
    expect(payloadsOfType(fake, 'betting_done')).toHaveLength(2)

    // `betting_complete` and `gambling_balance_update` broadcast exactly once.
    expect(payloadsOfType(fake, 'betting_complete')).toHaveLength(1)
    const balanceUpdates = payloadsOfType(fake, 'gambling_balance_update')
    expect(balanceUpdates).toHaveLength(1)
    expect(balanceUpdates[0].balances).toEqual({ Alice: 700, Bob: 750 })

    // The round begins on the host and both devices return to the buzzer.
    expect(hostView().getByText('Round Begins')).toBeInTheDocument()
    expect(deviceOf('Alice').getByRole('button', { name: 'Buzzer disabled' })).toBeInTheDocument()
    expect(deviceOf('Bob').getByRole('button', { name: 'Buzzer disabled' })).toBeInTheDocument()

    // The betting snapshot is cleared on `betting_complete`.
    expect(sessionStorage.getItem(`betting_state_${deviceSessionId('Alice')}`)).toBeNull()
    expect(sessionStorage.getItem(`betting_state_${deviceSessionId('Bob')}`)).toBeNull()
  })
})

// ─── Scenario 2: mixed submit and skip ────────────────────────────────────────

describe('Integration — mixed submit and skip (Req 2.5, 3.7)', () => {
  it('the host shows "Skipped" for the skipper and still finalizes once both are done', async () => {
    const { fake, finalizations } = setupRound()

    startBetting()
    await flush()

    // Bob skips first, so the host's "Skipped" state is observable while betting
    // is still open.
    skipBetting(deviceOf('Bob'))
    await flush()

    expect(hostStatusFor('Bob')).toBe('Skipped')
    expect(hostStatusFor('Alice')).toBe('Waiting…')
    expect(finalizations).toHaveLength(0)
    // The skipper's own device confirms locally (Req 2.6).
    expect(deviceOf('Bob').getByRole('heading', { name: 'Betting Complete' })).toBeInTheDocument()
    expect(deviceOf('Bob').getByText('No bets placed')).toBeInTheDocument()
    // A skip sends no bets.
    expect(payloadsOfType(fake, 'betting_submitted')).toHaveLength(0)

    placeBet(deviceOf('Alice'), { betType: 'round_leader', wager: 150, prediction: 'Bob' })
    submitBets(deviceOf('Alice'))
    await flush()

    expect(finalizations).toHaveLength(1)
    expect(finalizations[0].players.map((p) => [p.name, p.score])).toEqual([
      ['Alice', 850],
      ['Bob', 1000],
    ])
    expect(finalizations[0].ledger).toEqual([
      {
        type: 'bet_placed',
        playerName: 'Alice',
        amount: 150,
        label: 'round_leader',
        fundedBy: 'balance',
        order: 0,
      },
    ])
    expect(payloadsOfType(fake, 'betting_complete')).toHaveLength(1)
    expect(hostView().getByText('Round Begins')).toBeInTheDocument()
  })
})

// ─── Scenario 3: reload mid-betting ───────────────────────────────────────────

describe('Integration — reloading a device mid-betting (Req 2.7, 3.7)', () => {
  it('a submitted player lands back on the finalized confirmation and is not double-counted', async () => {
    // Only Alice has a device; Bob never reports done, so betting stays open.
    const { fake, finalizations, reloadDevice } = setupRound({ devices: ['Alice'] })

    startBetting()
    await flush()

    placeBet(deviceOf('Alice'), { betType: 'round_leader', wager: 100, prediction: 'Bob' })
    placeBet(deviceOf('Alice'), { betType: 'most_incorrect', wager: 200, prediction: 'Bob' })
    submitBets(deviceOf('Alice'))
    await flush()

    expect(hostStatusFor('Alice')).toBe('Done · 2 bets · $300')
    const submittedBefore = payloadsOfType(fake, 'betting_submitted').length
    const doneBefore = payloadsOfType(fake, 'betting_done').length
    expect(submittedBefore).toBe(1)
    expect(doneBefore).toBe(1)

    act(() => {
      reloadDevice('Alice')
    })
    await flush()

    // The reloaded device restores the betting phase in its finalized state.
    expect(deviceOf('Alice').getByRole('heading', { name: 'Betting Complete' })).toBeInTheDocument()
    expect(deviceOf('Alice').getByText(/2 bets placed/)).toBeInTheDocument()
    expect(deviceOf('Alice').queryByRole('button', { name: 'Submit Bets' })).not.toBeInTheDocument()

    // The reload replays nothing: the host's done state is not double-counted.
    expect(payloadsOfType(fake, 'betting_submitted')).toHaveLength(submittedBefore)
    expect(payloadsOfType(fake, 'betting_done')).toHaveLength(doneBefore)
    expect(hostStatusFor('Alice')).toBe('Done · 2 bets · $300')
    expect(finalizations).toHaveLength(0)

    // Betting still finalizes once when the host ends it.
    fireEvent.click(hostView().getByRole('button', { name: 'End Betting' }))
    await flush()

    expect(finalizations).toHaveLength(1)
    expect(finalizations[0].ledger).toHaveLength(2)
    expect(payloadsOfType(fake, 'betting_complete')).toHaveLength(1)
  })
})

// ─── Scenario 4: end-to-end ownership payout ──────────────────────────────────

/** How the bet resolved before the fix: raw clue face value, earliest on a tie. */
function rawFaceValueWinner(events: ClueAnswerEvent[]): string | null {
  const correct = events.filter((e) => e.result === 'correct')
  if (correct.length === 0) return null
  return [...correct].sort(
    (a, b) => b.pointValue - a.pointValue || a.chronologicalOrder - b.chronologicalOrder
  )[0].playerName
}

describe('Integration — ownership payout end to end (Req 2.4, 3.8)', () => {
  it('a category owner out-earns a larger clue, highest_single_clue pays 2:1, and the ledger records bet_won', async () => {
    const { fake, finalizations } = setupRound()

    startBetting()
    await flush()

    // Alice skips; Bob backs Alice to earn the most from one clue.
    skipBetting(deviceOf('Alice'))
    await flush()

    placeBet(deviceOf('Bob'), {
      betType: 'highest_single_clue',
      wager: 200,
      prediction: 'Alice',
    })
    submitBets(deviceOf('Bob'))
    await flush()

    expect(finalizations).toHaveLength(1)
    const afterBetting = finalizations[0]
    expect(afterBetting.players.map((p) => [p.name, p.score])).toEqual([
      ['Alice', 1000],
      ['Bob', 800],
    ])
    expect(payloadsOfType(fake, 'betting_complete')).toHaveLength(1)

    // The round is played: Alice owns category 0 and banks 2× on a $400 clue,
    // Bob answers a nominally larger $600 clue in a category he does not own.
    const answerEvents: ClueAnswerEvent[] = [
      {
        playerName: 'Alice',
        clueKey: 'World Capitals-400',
        result: 'correct',
        pointValue: 400,
        earnedPoints: 800,
        chronologicalOrder: 0,
        categoryIndex: 0,
      },
      {
        playerName: 'Bob',
        clueKey: 'Rivers-600',
        result: 'correct',
        pointValue: 600,
        earnedPoints: 600,
        chronologicalOrder: 1,
        categoryIndex: 1,
      },
    ]

    const trackingData: RoundTrackingData = {
      players: [makePlayer('Alice', 1800), makePlayer('Bob', 1400)],
      startOfRoundScores: { Alice: 1000, Bob: 800 },
      answerEvents,
      dailyDoubleFinderPlayer: null,
      cluesPerCategory: { 0: 5, 1: 5 },
    }

    const roundResult = computeRoundResult(trackingData)

    // Resolved on credited points, not face value — the whole point of Fix 1.
    expect(roundResult.highestSingleCluePlayer).toBe('Alice')
    expect(rawFaceValueWinner(answerEvents)).toBe('Bob')

    const settled = settleRoundBets(
      { players: afterBetting.players, ledger: afterBetting.ledger },
      afterBetting.sideBets,
      roundResult
    )

    // 2:1 payout on a $200 Real_Balance-funded wager: Bob goes from 800 to 1200.
    expect(settled.players.map((p) => [p.name, p.score])).toEqual([
      ['Alice', 1000],
      ['Bob', 1200],
    ])
    expect(settled.ledger).toEqual([
      {
        type: 'bet_placed',
        playerName: 'Bob',
        amount: 200,
        label: 'highest_single_clue',
        fundedBy: 'balance',
        order: 0,
      },
      {
        type: 'bet_won',
        playerName: 'Bob',
        amount: 400,
        label: 'highest_single_clue',
        fundedBy: 'balance',
        order: 1,
      },
    ])
  })
})

// ─── Scenario 5: host force-end mid-placement ─────────────────────────────────

describe('Integration — host force-ends while a player is still placing bets (Req 3.7)', () => {
  it('finalization runs once and the player device returns to the buzzer view', async () => {
    const { fake, finalizations } = setupRound()

    startBetting()
    await flush()

    // Alice has a bet staged locally but has not submitted it.
    placeBet(deviceOf('Alice'), { betType: 'round_leader', wager: 100, prediction: 'Bob' })
    expect(deviceOf('Alice').getByRole('heading', { name: 'Place Your Bets' })).toBeInTheDocument()
    expect(payloadsOfType(fake, 'betting_submitted')).toHaveLength(0)

    fireEvent.click(hostView().getByRole('button', { name: 'End Betting' }))
    await flush()

    // Finalization ran exactly once, with nothing collected.
    expect(finalizations).toHaveLength(1)
    expect(finalizations[0].sideBets).toEqual([])
    expect(finalizations[0].ledger).toEqual([])
    expect(finalizations[0].players.map((p) => p.score)).toEqual([1000, 1000])
    expect(payloadsOfType(fake, 'betting_complete')).toHaveLength(1)
    expect(payloadsOfType(fake, 'gambling_balance_update')).toHaveLength(1)

    // Both devices drop back to the buzzer, and the snapshot is gone.
    expect(deviceOf('Alice').getByRole('button', { name: 'Buzzer disabled' })).toBeInTheDocument()
    expect(deviceOf('Bob').getByRole('button', { name: 'Buzzer disabled' })).toBeInTheDocument()
    expect(sessionStorage.getItem(`betting_state_${deviceSessionId('Alice')}`)).toBeNull()

    // The host's screen has left the betting phase, so there is no second
    // force-end path; the one-shot guard is what makes that safe.
    expect(hostView().getByText('Round Begins')).toBeInTheDocument()
  })
})

// ─── Scenario 6: solo (single-device) regression ───────────────────────────────

describe('Integration — solo BettingSideGames regression (Req 3.8)', () => {
  it('completes with the updated labels and resolves on credited points', () => {
    const players = [makePlayer('Alice'), makePlayer('Bob')]
    const completions: { bets: SideBet[]; balances: Record<string, number> }[] = []

    render(
      <BettingSideGames
        players={players}
        budgetState={beginGamblingPhases(players)}
        roundHasDailyDouble
        onBettingComplete={(bets, updatedBalances) =>
          completions.push({ bets, balances: updatedBalances })
        }
      />
    )

    // Updated copy for both corrected bets (Req 2.1, 2.3, 3.8).
    const highestSingleClue = screen.getByRole('button', {
      name: /Who will earn the most from one clue\?/,
    })
    expect(highestSingleClue).toBeInTheDocument()
    expect(highestSingleClue).toHaveTextContent(/category-ownership doubles/)
    const dailyDoubleFinder = screen.getByRole('button', {
      name: /Who will be first to find a Daily Double\?/,
    })
    expect(dailyDoubleFinder).toBeInTheDocument()
    expect(dailyDoubleFinder).toHaveTextContent(/first player to select a Daily Double/)

    // Alice bets $200 that Bob earns the most from one clue.
    fireEvent.click(highestSingleClue)
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }))
    fireEvent.change(screen.getByLabelText('Wager for Alice'), { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Place Bet' }))

    // Bob skips.
    expect(screen.getByRole('heading', { name: 'Bob' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))

    // Summary shows the bet with the corrected label, then the round starts.
    expect(screen.getByRole('heading', { name: 'Bets Placed' })).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent(
      '$200 on "Who will earn the most from one clue?" → Bob'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start Round' }))

    expect(completions).toHaveLength(1)
    // Alice started at a positive balance, so the wager is Real_Balance-funded and
    // the reported bet says so (Requirement 2.9).
    expect(completions[0].bets).toEqual([
      {
        playerName: 'Alice',
        betType: 'highest_single_clue',
        wager: 200,
        prediction: 'Bob',
        fundedBy: 'balance',
      },
    ])
    expect(completions[0].balances).toEqual({ Alice: 800, Bob: 1000 })

    // The round plays out: Bob owns category 1 and banks 2× on a $400 clue while
    // Alice answers a nominally larger $600 clue.
    const answerEvents: ClueAnswerEvent[] = [
      {
        playerName: 'Alice',
        clueKey: 'Rivers-600',
        result: 'correct',
        pointValue: 600,
        earnedPoints: 600,
        chronologicalOrder: 0,
        categoryIndex: 0,
      },
      {
        playerName: 'Bob',
        clueKey: 'World Capitals-400',
        result: 'correct',
        pointValue: 400,
        earnedPoints: 800,
        chronologicalOrder: 1,
        categoryIndex: 1,
      },
    ]

    const roundResult = computeRoundResult({
      players: [makePlayer('Alice', 1400), makePlayer('Bob', 1800)],
      startOfRoundScores: { Alice: 800, Bob: 1000 },
      answerEvents,
      dailyDoubleFinderPlayer: 'Bob',
      cluesPerCategory: { 0: 5, 1: 5 },
    })

    expect(roundResult.highestSingleCluePlayer).toBe('Bob')
    // Pre-fix, the raw face value would have named Alice and lost her the bet.
    expect(rawFaceValueWinner(answerEvents)).toBe('Alice')

    const settled = settleRoundBets(
      {
        players: [
          makePlayer('Alice', completions[0].balances.Alice),
          makePlayer('Bob', completions[0].balances.Bob),
        ],
        ledger: [],
      },
      completions[0].bets,
      roundResult
    )

    expect(settled.players.map((p) => [p.name, p.score])).toEqual([
      ['Alice', 1200],
      ['Bob', 1000],
    ])
    expect(settled.ledger).toEqual([
      {
        type: 'bet_won',
        playerName: 'Alice',
        amount: 400,
        label: 'highest_single_clue',
        fundedBy: 'balance',
        order: 0,
      },
    ])
  })
})

// ─── Scenario 7: an Allowance_Player through a whole round ─────────────────────

/**
 * The negative-balance flow end to end: classification is frozen when the
 * Auction_Phase begins, the winning bid and the placed wager both draw the single
 * $500 pool down without touching Real_Balance, the pool is discarded when the
 * Betting_Phase ends, and a won allowance-funded bet credits the wager once with
 * no clamping at $0.
 *
 * **Validates: Requirements 1.9, 1.10, 2.1, 2.3, 2.4**
 */
describe('Integration — an Allowance_Player bids, bets, and is paid out (Req 1.9, 1.10, 2.1, 2.3, 2.4)', () => {
  it('spends one $500 pool across both phases, keeps Real_Balance intact, and is credited the wager on a win', async () => {
    const { fake, finalizations, auctionSettlements } = setupRound({
      players: ['Alice', 'Dana'],
      // Dana is at -$1,000 when the Auction_Phase begins, so she is an
      // Allowance_Player with a $500 pool; Alice funds from Real_Balance.
      scores: { Alice: 1000, Dana: -1000 },
      auctionOutcome: {
        winner: 'Dana',
        winningBid: 200,
        category: 'World Capitals',
        roundName: 'Jeopardy',
        categoryIndex: 0,
      },
    })

    // ── Auction_Phase: Dana wins a category on an allowance-funded bid ────────
    awardCategory()
    await flush()

    expect(auctionSettlements).toHaveLength(1)
    const auction = auctionSettlements[0]

    // Requirement 2.1 — the bid comes out of the allowance, not Real_Balance.
    expect(auction.fundedBy).toBe('allowance')
    expect(auction.players.map((p) => [p.name, p.score])).toEqual([
      ['Alice', 1000],
      ['Dana', -1000],
    ])
    expect(unspentBudget(auction.budgetState, 'Dana')).toBe(300)
    expect(unspentBudget(auction.budgetState, 'Alice')).toBe(1000)

    // Requirement 2.2 — ownership is recorded on the same terms as a
    // Real_Balance-funded win. Requirement 2.9 — the entry keeps its source.
    expect(auction.ownership).toEqual({ 'Jeopardy-0': 'Dana' })
    expect(auction.ledger).toEqual([
      {
        type: 'bid',
        playerName: 'Dana',
        amount: 200,
        label: 'World Capitals',
        fundedBy: 'allowance',
        order: 0,
      },
    ])

    // ── Betting_Phase: the post-auction pool reaches both devices ─────────────
    startBetting()
    await flush()

    const bettingStarts = payloadsOfType(fake, 'betting_start')
    expect(bettingStarts).toHaveLength(1)
    expect(bettingStarts[0].budgets).toEqual({
      Alice: { realBalance: 1000, unspent: 1000, isAllowance: false },
      Dana: { realBalance: -1000, unspent: 300, isAllowance: true },
    })

    // Requirement 1.7 — Dana's device shows the allowance remaining, labelled
    // apart from her Real_Balance, which is still negative.
    expect(deviceOf('Dana').getByText('Allowance remaining: $300')).toBeInTheDocument()
    expect(deviceOf('Dana').getByText('Your balance: -$1,000')).toBeInTheDocument()
    // Requirement 1.13 — Alice sees no allowance label at all.
    expect(deviceOf('Alice').getByText('Available: $1,000')).toBeInTheDocument()
    expect(deviceOf('Alice').queryByText(/Allowance remaining/)).not.toBeInTheDocument()

    // Requirement 1.5 — a wager beyond the remaining pool is rejected, names the
    // amount left, and places nothing.
    placeBet(deviceOf('Dana'), { betType: 'highest_single_clue', wager: 400, prediction: 'Dana' })
    expect(deviceOf('Dana').getByRole('alert')).toHaveTextContent(
      'Exceeds remaining allowance ($300)'
    )
    expect(deviceOf('Dana').queryByText('Bets Placed')).not.toBeInTheDocument()

    // The rest of the pool goes on Dana backing herself for the biggest clue.
    placeBet(deviceOf('Dana'), { betType: 'highest_single_clue', wager: 300, prediction: 'Dana' })
    expect(deviceOf('Dana').getByText('Allowance remaining: $0')).toBeInTheDocument()
    submitBets(deviceOf('Dana'))
    await flush()

    expect(hostStatusFor('Dana')).toBe('Done · 1 bet · $300')

    // Alice wagers from Real_Balance on a prediction that will miss.
    placeBet(deviceOf('Alice'), { betType: 'most_incorrect', wager: 100, prediction: 'Dana' })
    submitBets(deviceOf('Alice'))
    await flush()

    expect(finalizations).toHaveLength(1)
    const afterBetting = finalizations[0]

    // Requirement 2.3 — Dana's Real_Balance is untouched by her wager; Alice's is
    // deducted at placement.
    expect(afterBetting.players.map((p) => [p.name, p.score])).toEqual([
      ['Alice', 900],
      ['Dana', -1000],
    ])
    expect(payloadsOfType(fake, 'gambling_balance_update')[0].balances).toEqual({
      Alice: 900,
      Dana: -1000,
    })

    // Requirement 2.9 — one bid and two wagers, each carrying its funding source.
    expect(afterBetting.ledger).toEqual([
      {
        type: 'bid',
        playerName: 'Dana',
        amount: 200,
        label: 'World Capitals',
        fundedBy: 'allowance',
        order: 0,
      },
      {
        type: 'bet_placed',
        playerName: 'Dana',
        amount: 300,
        label: 'highest_single_clue',
        fundedBy: 'allowance',
        order: 1,
      },
      {
        type: 'bet_placed',
        playerName: 'Alice',
        amount: 100,
        label: 'most_incorrect',
        fundedBy: 'balance',
        order: 2,
      },
    ])
    expect(afterBetting.sideBets).toEqual([
      {
        playerName: 'Dana',
        betType: 'highest_single_clue',
        wager: 300,
        prediction: 'Dana',
        fundedBy: 'allowance',
      },
      {
        playerName: 'Alice',
        betType: 'most_incorrect',
        wager: 100,
        prediction: 'Dana',
        fundedBy: 'balance',
      },
    ])

    // Requirement 1.9 — the unspent allowance is discarded at the end of the
    // Betting_Phase, leaving Real_Balance exactly as settlement left it.
    expect(afterBetting.budgetState).toBeNull()

    // ── Round play and round-end settlement ──────────────────────────────────
    // Dana owns category 0, so her $400 clue credits $800 — more than Alice's
    // nominally larger $600 clue — and nobody answers incorrectly.
    const answerEvents: ClueAnswerEvent[] = [
      {
        playerName: 'Dana',
        clueKey: 'World Capitals-400',
        result: 'correct',
        pointValue: 400,
        earnedPoints: 800,
        chronologicalOrder: 0,
        categoryIndex: 0,
      },
      {
        playerName: 'Alice',
        clueKey: 'Rivers-600',
        result: 'correct',
        pointValue: 600,
        earnedPoints: 600,
        chronologicalOrder: 1,
        categoryIndex: 1,
      },
    ]

    const roundResult = computeRoundResult({
      players: [makePlayer('Alice', 1500), makePlayer('Dana', -200)],
      startOfRoundScores: { Alice: 900, Dana: -1000 },
      answerEvents,
      dailyDoubleFinderPlayer: null,
      cluesPerCategory: { 0: 5, 1: 5 },
    })

    expect(roundResult.highestSingleCluePlayer).toBe('Dana')
    expect(roundResult.mostIncorrectPlayer).toBeNull()

    const settled = settleRoundBets(
      { players: afterBetting.players, ledger: afterBetting.ledger },
      afterBetting.sideBets,
      roundResult
    )

    // Requirement 2.4, 2.5 — the won allowance-funded bet credits the wager once,
    // never twice, and is not clamped at $0: -$1,000 + $300 = -$700. Alice's lost
    // Real_Balance-funded wager takes no further deduction (Requirement 2.6).
    expect(settled.players.map((p) => [p.name, p.score])).toEqual([
      ['Alice', 900],
      ['Dana', -700],
    ])
    expect(settled.ledger.slice(3)).toEqual([
      {
        type: 'bet_won',
        playerName: 'Dana',
        amount: 300,
        label: 'highest_single_clue',
        fundedBy: 'allowance',
        order: 3,
      },
      {
        type: 'bet_lost',
        playerName: 'Alice',
        amount: 100,
        label: 'most_incorrect',
        fundedBy: 'balance',
        order: 4,
      },
    ])
  })

  it('leaves an Allowance_Player who commits nothing exactly where the phase started (Req 1.10)', async () => {
    const { fake, finalizations } = setupRound({
      players: ['Alice', 'Dana'],
      scores: { Alice: 1000, Dana: 0 },
    })

    startBetting()
    await flush()

    // A Real_Balance of exactly $0 still classifies as an Allowance_Player.
    const bettingStarts = payloadsOfType(fake, 'betting_start')
    expect(bettingStarts[0].budgets?.Dana).toEqual({
      realBalance: 0,
      unspent: 500,
      isAllowance: true,
    })

    skipBetting(deviceOf('Dana'))
    skipBetting(deviceOf('Alice'))
    await flush()

    expect(finalizations).toHaveLength(1)
    const [result] = finalizations

    // Requirement 1.10 — same Real_Balance as when the Auction_Phase began, and
    // no `bid` or `bet_placed` entry names either player.
    expect(result.players.map((p) => [p.name, p.score])).toEqual([
      ['Alice', 1000],
      ['Dana', 0],
    ])
    expect(result.ledger).toEqual([])
    expect(result.sideBets).toEqual([])
    // Requirement 1.9 — the unspent $500 is discarded, not banked.
    expect(result.budgetState).toBeNull()
    expect(payloadsOfType(fake, 'gambling_balance_update')[0].balances).toEqual({
      Alice: 1000,
      Dana: 0,
    })
  })
})
