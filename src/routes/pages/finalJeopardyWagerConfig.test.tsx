// @vitest-environment jsdom
/**
 * Host-side coverage for the `wagerConfig` write at Final Jeopardy wager-phase
 * start — negative-balance-and-analytics-updates, task 11.7.
 *
 * **Validates: Requirements 4.7, 4.9, 4.10**
 *
 * `GamePage` owns the whole host game loop and is not practically mountable, and
 * reaching the Final Jeopardy phase means playing out every round first. So the
 * write itself is asserted against `GamePage`'s source (the payload it persists
 * and the fact that it lands before the phase-change broadcast), and its purpose
 * — one identical range on both wager surfaces — is asserted by rendering the
 * real host and player surfaces from the persisted payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Player, ToggleConfig } from '../../types/game'
import type { FinalJeopardyState, SessionPlayer } from '../../types/session'
import { DEFAULT_TOGGLE_CONFIG } from '../../types/game'
import { computeLowestPositiveBalance } from '../../utils/gameToggles'
import { WagerEntry } from '../../components/game/WagerEntry'
import { FinalJeopardyEntryPage } from '../../components/player/FinalJeopardyEntryPage'
import { fetchSession } from '../../utils/sessionApi'

vi.mock('../../utils/sessionApi', () => ({
  fetchSession: vi.fn(),
  updateFinalJeopardyState: vi.fn().mockResolvedValue(undefined),
}))

const fetchSessionMock = vi.mocked(fetchSession)

const channel = { send: vi.fn().mockResolvedValue('ok') } as unknown as RealtimeChannel

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── The Final Jeopardy branch of GamePage's phase-sync effect ────────────────

const GAME_PAGE_PATH = 'src/routes/pages/GamePage.tsx'
const gamePageSource = readFileSync(resolve(process.cwd(), GAME_PAGE_PATH), 'utf-8')

/** The `phase === 'final-jeopardy'` arm of the phase-sync effect, on its own. */
function finalJeopardyBranch(): string {
  const start = gamePageSource.indexOf("if (phase === 'final-jeopardy') {")
  expect(start, 'GamePage must handle the final-jeopardy phase').toBeGreaterThan(-1)
  const end = gamePageSource.indexOf("} else if (phase === 'clue'", start)
  expect(end, 'the final-jeopardy branch must be followed by the buzzer-phase branch').toBeGreaterThan(start)
  return gamePageSource.slice(start, end)
}

/** Every `updateFinalJeopardyState(...)` payload in a chunk of source. */
function persistedPayloads(source: string): string[] {
  return source
    .split('updateFinalJeopardyState(')
    .slice(1)
    .map(chunk => chunk.slice(0, chunk.indexOf('})')))
}

describe('GamePage persists wagerConfig at wager-phase start (Req 4.7, 4.9, 4.10)', () => {
  it('writes wagerConfig into FinalJeopardyState on every phase-start write', () => {
    const payloads = persistedPayloads(finalJeopardyBranch())

    expect(payloads.length).toBeGreaterThan(0)
    for (const payload of payloads) {
      expect(payload).toContain('wagerConfig')
    }
  })

  it('takes the floor from the session toggle config rather than a literal', () => {
    const branch = finalJeopardyBranch()

    expect(branch).toContain('wagerFloor: session.toggleConfig.wagering.wagerFloor')
    // A hardcoded floor would let the host and player surfaces disagree (Req 4.7).
    expect(branch).not.toMatch(/wagerFloor:\s*\d/)
  })

  it('computes the Lowest_Positive_Balance once, from the session players', () => {
    expect(finalJeopardyBranch()).toContain('computeLowestPositiveBalance(session.players)')
    // One call site in the whole host page: nothing recomputes it mid-phase (Req 4.9, 4.10).
    expect(gamePageSource.match(/computeLowestPositiveBalance\(/g)).toHaveLength(1)
  })

  it('persists the config before broadcasting the phase change', () => {
    const branch = finalJeopardyBranch()

    expect(branch.indexOf('updateFinalJeopardyState(')).toBeLessThan(branch.indexOf("'phase_change'"))
  })
})

// ─── Both wager surfaces from one persisted payload ───────────────────────────

function makePlayer(name: string, score: number): Player {
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

function toSessionPlayer(player: Player): SessionPlayer {
  return { name: player.name, score: player.score, joinedAt: '2024-01-01T00:00:00.000Z' }
}

describe('The persisted wagerConfig gives both surfaces one range (Req 4.7)', () => {
  const players = [makePlayer('Alice', -500), makePlayer('Bob', 800), makePlayer('Cara', 4000)]
  const toggleConfig: ToggleConfig = {
    ...DEFAULT_TOGGLE_CONFIG,
    wagering: { enabled: true, wagerFloor: 250 },
  }

  // Exactly what GamePage freezes and persists when the phase begins.
  const wagerConfig: NonNullable<FinalJeopardyState['wagerConfig']> = {
    wagerFloor: toggleConfig.wagering.wagerFloor,
    lowestPositiveBalance: computeLowestPositiveBalance(players),
  }

  it('freezes the configured floor and the lowest positive balance', () => {
    expect(wagerConfig).toEqual({ wagerFloor: 250, lowestPositiveBalance: 800 })
  })

  it('shows the same non-positive-balance range on the host and player surfaces', async () => {
    fetchSessionMock.mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { final_jeopardy_state: { wagers: [], submissions: [], revealedIndex: -1, wagerConfig } } as any
    )

    const host = render(
      <WagerEntry players={players} wagerFloor={wagerConfig.wagerFloor} onReveal={() => {}} />
    )
    const hostRange = host.container.querySelector('.wager-entry-range')!.textContent

    host.unmount()

    render(
      <FinalJeopardyEntryPage
        sessionId="s1"
        playerName="Alice"
        playerScore={-500}
        channel={channel}
        players={players.map(toSessionPlayer)}
      />
    )
    const playerRange = (await screen.findByText(/Wager range/)).textContent

    // $1 through the frozen Lowest_Positive_Balance, not the $250 floor.
    expect(hostRange).toBe('Range: $1 – $800')
    expect(playerRange).toContain('Wager range: $1 – $800')
  })
})
