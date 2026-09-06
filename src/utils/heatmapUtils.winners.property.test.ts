import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClueHeatmap } from '../components/game/ClueHeatmap'
import { buildHeatmapCellLabel, computeHeatmapData } from './heatmapUtils'
import { formatCurrency } from './currency'
import { DEFAULT_TOGGLE_CONFIG } from '../types/game'
import type { HeatmapCell } from './heatmapUtils'
import type {
  Category,
  ClueState,
  GameSession,
  NormalizedGame,
  Player,
  RoundName,
} from '../types/game'

// Feature: negative-balance-and-analytics-updates
// Shared generators and fixtures for the heatmap winner properties (24–26).

type Marking = 'correct' | 'incorrect' | null

/** Per-player slot: a held marking, an explicit `null`, or no map entry at all. */
type MarkingSlot = 'correct' | 'incorrect' | 'null' | 'absent'

/** Session player names. Twelve so a 10-player session still leaves non-members. */
const PLAYER_NAME_POOL = [
  'Alice',
  'Bob',
  'Cara',
  'Dan',
  'Eve',
  'Frank',
  'Grace',
  'Heidi',
  'Ivan',
  'Judy',
  'Karl',
  'Lena',
]

/** Names that never appear in a session: markings left by players who left. */
const DEPARTED_NAME_POOL = ['Mallory', 'Niaj', 'Olivia', 'Trent']

interface RoundSpec {
  roundName: RoundName
  categoryCount: number
  clueCount: number
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePlayer(name: string): Player {
  return {
    name,
    score: 0,
    correctCount: 0,
    incorrectCount: 0,
    correctDailyDoubles: 0,
    incorrectDailyDoubles: 0,
    correctFinalJeopardy: 0,
    incorrectFinalJeopardy: 0,
    totalEarned: 0,
  }
}

/** Uniform board per round spec; every fourth clue is a Daily Double. */
function makeGame(roundSpecs: RoundSpec[]): NormalizedGame {
  const rounds = {} as Record<RoundName, Category[]>

  roundSpecs.forEach((spec, roundIdx) => {
    rounds[spec.roundName] = Array.from({ length: spec.categoryCount }, (_, catIdx) => ({
      category: `Category ${roundIdx}-${catIdx}`,
      clues: Array.from({ length: spec.clueCount }, (_, clueIdx) => ({
        value: (clueIdx + 1) * 200 * (roundIdx + 1),
        clue: `Q${roundIdx}-${catIdx}-${clueIdx}`,
        solution: `A${roundIdx}-${catIdx}-${clueIdx}`,
        dailyDouble: (catIdx + clueIdx) % 4 === 0,
        html: false,
      })),
    }))
  })

  return {
    rounds,
    final: null as unknown as NormalizedGame['final'],
    totalRounds: roundSpecs.length,
  }
}

function makeHeatmapSession(opts: {
  playerNames: string[]
  roundSpecs: RoundSpec[]
  clueStates: Record<string, ClueState>
  coopEnabled: boolean
}): GameSession {
  return {
    game: makeGame(opts.roundSpecs),
    gameId: 'heatmap-winners-test',
    players: opts.playerNames.map(makePlayer),
    currentRoundIndex: 0,
    orderedRoundNames: opts.roundSpecs.map(spec => spec.roundName),
    clueStates: opts.clueStates,
    dailyDoubleRecords: [],
    toggleConfig: {
      ...DEFAULT_TOGGLE_CONFIG,
      coop: { ...DEFAULT_TOGGLE_CONFIG.coop, enabled: opts.coopEnabled },
    },
  } as unknown as GameSession
}

/** Cell keys `computeHeatmapData` reads, in board order. */
function enumerateClueKeys(roundSpecs: RoundSpec[]): string[] {
  const keys: string[] = []
  for (const spec of roundSpecs) {
    for (let catIdx = 0; catIdx < spec.categoryCount; catIdx++) {
      for (let clueIdx = 0; clueIdx < spec.clueCount; clueIdx++) {
        keys.push(`${spec.roundName}-${catIdx}-${clueIdx}`)
      }
    }
  }
  return keys
}

// ─── Generators ───────────────────────────────────────────────────────────────

/** 1–10 distinct session players (Requirement 8.8 caps a session at 10). */
export const sessionPlayerNamesArb = fc.uniqueArray(fc.constantFrom(...PLAYER_NAME_POOL), {
  minLength: 1,
  maxLength: 10,
})

/** Rounds are always a prefix of the ordered round names. */
export const roundSpecsArb: fc.Arbitrary<RoundSpec[]> = fc
  .tuple(
    fc.integer({ min: 1, max: 2 }),
    fc.integer({ min: 1, max: 3 }),
    fc.integer({ min: 1, max: 5 }),
  )
  .map(([roundCount, categoryCount, clueCount]) =>
    (['single', 'double'] as RoundName[])
      .slice(0, roundCount)
      .map(roundName => ({ roundName, categoryCount, clueCount })),
  )

const markingSlotArb = fc.constantFrom<MarkingSlot>('correct', 'incorrect', 'null', 'absent')

/**
 * Markings for one clue over `names`, inserted in a generated order so a cell's
 * list order can never be inherited from `playerMarkings` insertion order.
 */
function markingsArb(names: string[]): fc.Arbitrary<Record<string, Marking>> {
  return fc
    .tuple(
      fc.shuffledSubarray(names, { minLength: names.length, maxLength: names.length }),
      fc.array(markingSlotArb, { minLength: names.length, maxLength: names.length }),
    )
    .map(([insertionOrder, slots]) => {
      const markings: Record<string, Marking> = {}
      insertionOrder.forEach((name, idx) => {
        const slot = slots[idx]
        if (slot === 'absent') return
        markings[name] = slot === 'null' ? null : slot
      })
      return markings
    })
}

/**
 * One clue's state. `chosen` is independent of the markings so cells whose
 * status is `unanswered` still carry marking data, exercising the "both lists
 * populated regardless of status" clause.
 */
function clueStateArb(names: string[]): fc.Arbitrary<ClueState> {
  return fc.record({
    chosen: fc.oneof(
      { weight: 4, arbitrary: fc.constant(true) },
      { weight: 1, arbitrary: fc.constant(false) },
    ),
    playerMarkings: markingsArb(names),
  })
}

/** Board-wide clue states; some keys are absent entirely (never chosen). */
function clueStatesArb(
  names: string[],
  roundSpecs: RoundSpec[],
): fc.Arbitrary<Record<string, ClueState>> {
  const keys = enumerateClueKeys(roundSpecs)

  return fc
    .tuple(
      ...keys.map(() =>
        fc.option(clueStateArb(names), { nil: undefined, freq: 5 }),
      ),
    )
    .map(states => {
      const clueStates: Record<string, ClueState> = {}
      keys.forEach((key, idx) => {
        const state = states[idx]
        if (state) clueStates[key] = state
      })
      return clueStates
    })
}

interface HeatmapScenario {
  session: GameSession
  playerOrder: string[]
  departedNames: string[]
}

/**
 * A full session plus the names of players who left markings but are no longer
 * in the session. Covers co-op and non-co-op sessions, mixed correct-and-
 * incorrect clues, unchosen clues carrying markings, and absent clue states.
 */
export const heatmapScenarioArb: fc.Arbitrary<HeatmapScenario> = fc
  .tuple(
    sessionPlayerNamesArb,
    fc.uniqueArray(fc.constantFrom(...DEPARTED_NAME_POOL), { maxLength: 3 }),
    roundSpecsArb,
    fc.boolean(),
  )
  .chain(([playerNames, departedNames, roundSpecs, coopEnabled]) =>
    clueStatesArb([...playerNames, ...departedNames], roundSpecs).map(clueStates => ({
      session: makeHeatmapSession({ playerNames, roundSpecs, clueStates, coopEnabled }),
      playerOrder: playerNames,
      departedNames,
    })),
  )

/**
 * A session with one clue guaranteed to hold at least one `correct` and at
 * least one `incorrect` marking among session members, plus a departed player
 * holding each marking. The mixed-outcome case that used to drop the misses.
 */
export const mixedOutcomeScenarioArb = fc
  .tuple(
    fc.uniqueArray(fc.constantFrom(...PLAYER_NAME_POOL), { minLength: 2, maxLength: 10 }),
    fc.uniqueArray(fc.constantFrom(...DEPARTED_NAME_POOL), { minLength: 2, maxLength: 2 }),
    roundSpecsArb,
    fc.boolean(),
  )
  .chain(([playerNames, departedNames, roundSpecs, coopEnabled]) =>
    fc
      .tuple(
        fc.shuffledSubarray(playerNames, { minLength: playerNames.length }),
        fc.integer({ min: 1, max: playerNames.length - 1 }),
      )
      .map(([shuffled, correctCount]) => {
        const playerMarkings: Record<string, Marking> = {}
        shuffled.forEach((name, idx) => {
          playerMarkings[name] = idx < correctCount ? 'correct' : 'incorrect'
        })
        playerMarkings[departedNames[0]] = 'correct'
        playerMarkings[departedNames[1]] = 'incorrect'

        const key = `${roundSpecs[0].roundName}-0-0`

        return {
          session: makeHeatmapSession({
            playerNames,
            roundSpecs,
            clueStates: { [key]: { chosen: true, playerMarkings } },
            coopEnabled,
          }),
          playerOrder: playerNames,
          departedNames,
        }
      }),
  )

// ─── Assertion helpers ────────────────────────────────────────────────────────

/**
 * The expected list, derived from `playerMarkings` entries rather than by
 * filtering the player order, so the expectation is not a restatement of the
 * implementation.
 */
function expectedMarkedPlayers(
  clueState: ClueState | undefined,
  marking: 'correct' | 'incorrect',
  playerOrder: string[],
): string[] {
  return Object.entries(clueState?.playerMarkings ?? {})
    .filter(([name, held]) => held === marking && playerOrder.includes(name))
    .map(([name]) => name)
    .sort((a, b) => playerOrder.indexOf(a) - playerOrder.indexOf(b))
}

/** Strictly increasing positions in `playerOrder`, and no name from outside it. */
function expectSessionOrdered(names: string[], playerOrder: string[]): void {
  const positions = names.map(name => playerOrder.indexOf(name))
  expect(positions).not.toContain(-1)
  positions.forEach((position, idx) => {
    if (idx > 0) expect(position).toBeGreaterThan(positions[idx - 1])
  })
  expect(new Set(names).size).toBe(names.length)
}

// ─── Property 24 ──────────────────────────────────────────────────────────────

describe('Property 24: Heatmap cells carry both marking lists in session order', () => {
  /**
   * **Validates: Requirements 8.1, 8.7, 8.8**
   *
   * Every cell of every round lists exactly the session players holding each
   * marking, in session player order, for every cell status — including cells
   * whose clue was never chosen and cells with no clue state at all. Markings
   * left by players no longer in the session are dropped, and co-op sessions
   * name individuals with no team entry.
   */
  it('lists exactly the session players holding each marking, in session order', () => {
    fc.assert(
      fc.property(heatmapScenarioArb, ({ session, playerOrder, departedNames }) => {
        const rounds = computeHeatmapData(session)
        expect(rounds).toHaveLength(session.orderedRoundNames.length)

        for (const round of rounds) {
          for (const row of round.grid) {
            for (const cell of row) {
              const key = `${round.roundName}-${cell.categoryIndex}-${cell.clueIndex}`
              const clueState = session.clueStates[key]

              expect(cell.correctPlayers).toEqual(
                expectedMarkedPlayers(clueState, 'correct', playerOrder),
              )
              expect(cell.incorrectPlayers).toEqual(
                expectedMarkedPlayers(clueState, 'incorrect', playerOrder),
              )

              expectSessionOrdered(cell.correctPlayers, playerOrder)
              expectSessionOrdered(cell.incorrectPlayers, playerOrder)

              // Departed players' markings never reach a cell (co-op included:
              // markings are keyed by individual name, never by team).
              for (const departed of departedNames) {
                expect(cell.correctPlayers).not.toContain(departed)
                expect(cell.incorrectPlayers).not.toContain(departed)
              }

              // Empty exactly when no session player holds that marking —
              // asserted independently of the cell's status, so a clue that was
              // never chosen still carries whatever markings it holds.
              const holds = (marking: 'correct' | 'incorrect') =>
                playerOrder.some(name => clueState?.playerMarkings[name] === marking)
              expect(cell.correctPlayers.length === 0).toBe(!holds('correct'))
              expect(cell.incorrectPlayers.length === 0).toBe(!holds('incorrect'))
            }
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 8.1, 8.7, 8.8**
   *
   * A mixed-outcome clue — status `correct` with at least one miss — carries
   * both lists non-empty, each in session order, with departed markings on both
   * sides dropped.
   */
  it('keeps both lists on a mixed correct-and-incorrect clue', () => {
    fc.assert(
      fc.property(mixedOutcomeScenarioArb, ({ session, playerOrder, departedNames }) => {
        const cell = computeHeatmapData(session)[0].grid[0][0]

        expect(cell.status).toBe('correct')
        expect(cell.correctPlayers.length).toBeGreaterThan(0)
        expect(cell.incorrectPlayers.length).toBeGreaterThan(0)

        expectSessionOrdered(cell.correctPlayers, playerOrder)
        expectSessionOrdered(cell.incorrectPlayers, playerOrder)

        expect([...cell.correctPlayers, ...cell.incorrectPlayers].sort()).toEqual(
          [...playerOrder].sort(),
        )
        for (const departed of departedNames) {
          expect(cell.correctPlayers).not.toContain(departed)
          expect(cell.incorrectPlayers).not.toContain(departed)
        }
      }),
      { numRuns: 200 },
    )
  })
})

// ─── Property 25 ──────────────────────────────────────────────────────────────

/** Every name the label could possibly draw from, session or departed. */
const ALL_KNOWN_NAMES = [...PLAYER_NAME_POOL, ...DEPARTED_NAME_POOL]

/** The label's own separator. No player name or amount can contain it. */
const PART_SEPARATOR = ' — '

const CORRECT_PREFIX = 'Correct: '
const INCORRECT_PREFIX = 'Incorrect: '
const NOT_ATTEMPTED = 'Not attempted'
const DAILY_DOUBLE = 'Daily Double'

function labelParts(label: string): string[] {
  return label.split(PART_SEPARATOR)
}

/**
 * The names listed under `prefix`, split back apart on the comma-and-space the
 * label is required to join them with. `null` when the label has no such group,
 * distinguishing "group absent" from "group present but empty".
 *
 * `'Incorrect: …'.startsWith('Correct: ')` is false, so the correct group never
 * matches the incorrect part.
 */
function groupNames(label: string, prefix: string): string[] | null {
  const part = labelParts(label).find(p => p.startsWith(prefix))
  if (part === undefined) return null
  return part.slice(prefix.length).split(', ')
}

/** Splits 0–10 distinct names into a correct group and an incorrect group. */
const markingPartitionArb = fc
  .tuple(fc.uniqueArray(fc.constantFrom(...PLAYER_NAME_POOL), { maxLength: 10 }), fc.nat())
  .map(([names, rawCut]) => {
    const cut = rawCut % (names.length + 1)
    return { correctPlayers: names.slice(0, cut), incorrectPlayers: names.slice(cut) }
  })

/** An arbitrary cell: every status, every list combination, both DD values. */
const heatmapCellArb: fc.Arbitrary<HeatmapCell> = fc
  .tuple(
    markingPartitionArb,
    fc.integer({ min: 0, max: 9_999_999 }),
    fc.boolean(),
    fc.constantFrom<HeatmapCell['status']>('correct', 'incorrect', 'unanswered'),
    fc.nat({ max: 5 }),
    fc.nat({ max: 5 }),
  )
  .map(([groups, value, dailyDouble, status, categoryIndex, clueIndex]) => ({
    categoryIndex,
    clueIndex,
    value,
    status,
    dailyDouble,
    ...groups,
  }))

/** A cell holding the full 10-player session split across the two groups. */
const fullSessionCellArb: fc.Arbitrary<HeatmapCell> = fc
  .tuple(
    fc.shuffledSubarray(PLAYER_NAME_POOL.slice(0, 10), { minLength: 10, maxLength: 10 }),
    fc.integer({ min: 0, max: 10 }),
    fc.integer({ min: 0, max: 9_999_999 }),
    fc.boolean(),
  )
  .map(([names, cut, value, dailyDouble]) => ({
    categoryIndex: 0,
    clueIndex: 0,
    value,
    status: (cut > 0 ? 'correct' : 'incorrect') as HeatmapCell['status'],
    dailyDouble,
    correctPlayers: names.slice(0, cut),
    incorrectPlayers: names.slice(cut),
  }))

/** The whole of Property 25 for one cell, reused by every case below. */
function expectLabelSatisfiesProperty25(cell: HeatmapCell): void {
  const label = buildHeatmapCellLabel(cell)
  const parts = labelParts(label)

  // Clue value as the exact Currency_Formatter output (8.2, 8.3, 8.4).
  expect(label).toContain(formatCurrency(cell.value))

  const correct = groupNames(label, CORRECT_PREFIX)
  const incorrect = groupNames(label, INCORRECT_PREFIX)

  // Each group appears exactly when its list is non-empty, naming every member
  // in list order joined by ', ' — element-wise equality proves both the
  // separator and the absence of truncation (8.2, 8.3, 8.8, 8.9).
  expect(correct).toEqual(cell.correctPlayers.length > 0 ? cell.correctPlayers : null)
  expect(incorrect).toEqual(cell.incorrectPlayers.length > 0 ? cell.incorrectPlayers : null)

  if (cell.correctPlayers.length > 0 && cell.incorrectPlayers.length > 0) {
    // Two groups under separate labels, neither leaking into the other (8.9).
    const correctIdx = parts.findIndex(p => p.startsWith(CORRECT_PREFIX))
    const incorrectIdx = parts.findIndex(p => p.startsWith(INCORRECT_PREFIX))
    expect(correctIdx).not.toBe(incorrectIdx)
    for (const name of cell.incorrectPlayers) {
      expect(parts[correctIdx]).not.toContain(name)
    }
    for (const name of cell.correctPlayers) {
      expect(parts[incorrectIdx]).not.toContain(name)
    }
  }

  // Not attempted exactly when both lists are empty, and then no name at all
  // appears in the label (8.4).
  const bothEmpty = cell.correctPlayers.length === 0 && cell.incorrectPlayers.length === 0
  expect(parts.includes(NOT_ATTEMPTED)).toBe(bothEmpty)
  if (bothEmpty) {
    for (const name of ALL_KNOWN_NAMES) {
      expect(label).not.toContain(name)
    }
  }

  // Daily Double indicated exactly when the clue was one (8.5).
  expect(label.includes(DAILY_DOUBLE)).toBe(cell.dailyDouble)

  // No truncation marker of any form (8.8).
  expect(label).not.toContain('…')
  expect(label).not.toContain('...')
  expect(label).not.toMatch(/\bmore\b/)
}

describe('Property 25: Heatmap cell label content', () => {
  /**
   * **Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.8, 8.9**
   *
   * For any cell — any status, any combination of correct and incorrect names,
   * Daily Double or not — the label carries the Currency_Formatter value, names
   * each group under its own label joined by ', ', says the clue was not
   * attempted only when both lists are empty, and never truncates.
   */
  it('names every marked player under its own label with no truncation', () => {
    fc.assert(
      fc.property(heatmapCellArb, cell => {
        expectLabelSatisfiesProperty25(cell)
      }),
      { numRuns: 300 },
    )
  })

  /**
   * **Validates: Requirements 8.8**
   *
   * A full 10-player session split across the two groups keeps all ten names,
   * in order, comma-and-space separated, with nothing dropped.
   */
  it('lists all ten names of a maximum session without truncation', () => {
    fc.assert(
      fc.property(fullSessionCellArb, cell => {
        expectLabelSatisfiesProperty25(cell)

        const label = buildHeatmapCellLabel(cell)
        const listed = [
          ...(groupNames(label, CORRECT_PREFIX) ?? []),
          ...(groupNames(label, INCORRECT_PREFIX) ?? []),
        ]
        expect(listed).toHaveLength(10)
        expect([...listed].sort()).toEqual([...PLAYER_NAME_POOL.slice(0, 10)].sort())
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.8, 8.9**
   *
   * The same property over cells produced by `computeHeatmapData`, so the value
   * and Daily Double flag come from a real board and the name lists from real
   * markings rather than from a hand-built cell.
   */
  it('holds for every cell of a computed heatmap', () => {
    fc.assert(
      fc.property(heatmapScenarioArb, ({ session }) => {
        for (const round of computeHeatmapData(session)) {
          for (const row of round.grid) {
            for (const cell of row) {
              expectLabelSatisfiesProperty25(cell)
            }
          }
        }
      }),
      { numRuns: 150 },
    )
  })
})

// ─── Property 26 ──────────────────────────────────────────────────────────────

/**
 * Property 26 is a statement about the rendered cell, so it is asserted against
 * real `ClueHeatmap` output rather than against the label helper alone. The
 * component is rendered to static markup with `react-dom/server`, which needs
 * no DOM — that keeps this file a plain `.ts` module in the default `node`
 * environment (JSX would require a `.tsx` extension, and Testing Library would
 * require a jsdom pragma for the whole file, including Properties 24 and 25).
 * `src/components/game/ClueHeatmap.test.tsx` covers the same parity as a jsdom
 * unit test on a fixed session; this property covers every generated session.
 */

/** Every opening `<td>` tag in the markup, in document order. */
const CELL_TAG_PATTERN = /<td\b[^>]*>/g

/** The raw value of `name` on one tag, or `null` when the tag omits it. */
function tagAttribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return match === null ? null : match[1]
}

/** Reverses the attribute escaping `renderToStaticMarkup` applies. */
function decodeAttribute(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
}

function renderedCellTags(session: GameSession): string[] {
  const markup = renderToStaticMarkup(createElement(ClueHeatmap, { session }))
  return markup.match(CELL_TAG_PATTERN) ?? []
}

/** The computed cells in the order `ClueHeatmap` renders them. */
function renderOrderCells(session: GameSession): HeatmapCell[] {
  return computeHeatmapData(session).flatMap(round => round.grid.flat())
}

/** The whole of Property 26 for one session's rendered heatmap. */
function expectRenderedParity(session: GameSession): void {
  const tags = renderedCellTags(session)
  const cells = renderOrderCells(session)

  expect(tags).toHaveLength(cells.length)

  tags.forEach((tag, idx) => {
    const accessibleLabel = tagAttribute(tag, 'aria-label')
    const tooltip = tagAttribute(tag, 'title')

    // Both attributes are present, and they are the identical string.
    expect(accessibleLabel).not.toBeNull()
    expect(tooltip).not.toBeNull()
    expect(accessibleLabel).toBe(tooltip)

    // And that one string is the cell's label, so parity is not parity on
    // two empty or two placeholder values.
    expect(decodeAttribute(tooltip as string)).toBe(buildHeatmapCellLabel(cells[idx]))
    expect(tooltip).not.toBe('')
  })
}

describe('Property 26: Heatmap accessible label equals tooltip', () => {
  /**
   * **Validates: Requirements 8.6**
   *
   * For every cell of every generated session — every status, every combination
   * of correct and incorrect names, Daily Double or not — the rendered cell's
   * accessible label and its tooltip are the identical character string.
   */
  it('renders each cell with an accessible label identical to its tooltip', () => {
    fc.assert(
      fc.property(heatmapScenarioArb, ({ session }) => {
        expectRenderedParity(session)
      }),
      { numRuns: 150 },
    )
  })

  /**
   * **Validates: Requirements 8.6**
   *
   * Parity also holds for the two-group label of a mixed correct-and-incorrect
   * clue, the longest label the heatmap produces.
   */
  it('keeps parity on a cell naming both correct and incorrect players', () => {
    fc.assert(
      fc.property(mixedOutcomeScenarioArb, ({ session }) => {
        expectRenderedParity(session)

        const tooltip = tagAttribute(renderedCellTags(session)[0], 'title')
        expect(tooltip).toContain(CORRECT_PREFIX)
        expect(tooltip).toContain(INCORRECT_PREFIX)
      }),
      { numRuns: 100 },
    )
  })
})
