import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { LEDGER_LABEL_MAP, LEDGER_TYPE_LABELS, formatLedgerLabel } from './ledgerLabels'
import { BET_DESCRIPTIONS, BET_EXPLANATIONS } from './gamblingScoring'
import type {
  GamblingLedgerEntry,
  GamblingLedgerEntryType,
  SideBetType,
} from '../types/game'

// Feature: negative-balance-and-analytics-updates
// Property 32: Ledger label rendering is total

const EM_DASH = '—'

/** Entry types whose label holds a `SideBetType` key (criterion 10.3). */
const BET_ENTRY_TYPES: GamblingLedgerEntryType[] = ['bet_placed', 'bet_won', 'bet_lost']

/** Entry types whose label holds a category name (criterion 10.4). */
const PASS_THROUGH_ENTRY_TYPES: GamblingLedgerEntryType[] = ['bid', 'ownership_bonus']

const ALL_ENTRY_TYPES: GamblingLedgerEntryType[] = [
  ...PASS_THROUGH_ENTRY_TYPES,
  ...BET_ENTRY_TYPES,
]

const SIDE_BET_KEYS = Object.keys(LEDGER_LABEL_MAP) as SideBetType[]

/**
 * Criterion 10.6 is a forward-compatible fallback: no member of the current
 * `GamblingLedgerEntryType` union falls outside the two groups above, so the
 * only way to reach it is a synthetic type standing in for a future member.
 */
const FUTURE_ENTRY_TYPE = 'refund_issued' as GamblingLedgerEntryType

/** Fixed placeholders criterion 10.5 forbids. */
const FORBIDDEN_PLACEHOLDERS = ['Unknown Label', 'Unknown', 'unknown', 'N/A', '?', '']

/**
 * Labels that resolve to an inherited member on a plain object literal. A
 * lookup table built without a null prototype hands back a function for these,
 * so they are asserted on directly rather than left to chance in a generator.
 */
const PROTOTYPE_KEYS = [
  'constructor',
  '__proto__',
  'toString',
  'hasOwnProperty',
  'valueOf',
] as const

const whitespaceOnlyArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '\u00a0'), { minLength: 1, maxLength: 6 })
  .map(chars => chars.join(''))

/** Empty and whitespace-only labels (criterion 10.7). */
const blankLabelArb = fc.oneof(fc.constant(''), whitespaceOnlyArb)

/** Snake-case words a ledger label might be built from. */
const wordArb = fc
  .stringMatching(/^[a-z0-9]{1,10}$/)
  .filter(word => word.length > 0)

/** Category names as they appear on `bid` / `ownership_bonus` entries. */
const categoryNameArb = fc
  .oneof(
    fc.constantFrom(
      'World Capitals',
      'POTENT POTABLES',
      "80s movies",
      'Science & Nature',
      'before_and_after',
    ),
    fc.string({ minLength: 1, maxLength: 40 }),
    // A category literally named after a bet key must still pass through.
    fc.constantFrom(...SIDE_BET_KEYS),
    // As must one named after an inherited object member.
    fc.constantFrom(...PROTOTYPE_KEYS),
  )
  .filter(label => label.trim() !== '')

/**
 * Unknown bet keys: 1–4 snake-case words joined by underscores, with stray
 * leading / trailing / doubled underscores, excluding every map key.
 */
const unknownKeyArb = fc
  .record({
    words: fc.array(wordArb, { minLength: 1, maxLength: 4 }),
    leading: fc.constantFrom('', '_', '__'),
    trailing: fc.constantFrom('', '_', '__'),
    doubled: fc.boolean(),
  })
  .map(({ words, leading, trailing, doubled }) => ({
    words,
    label: `${leading}${words.join(doubled ? '__' : '_')}${trailing}`,
  }))
  .filter(({ label }) => !SIDE_BET_KEYS.includes(label as SideBetType))

/**
 * The same `{ words, label }` shape for the inherited-member keys, so they run
 * through the unknown-key expectations alongside the generated keys.
 */
const prototypeKeyArb = fc.constantFrom(...PROTOTYPE_KEYS).map(label => ({
  words: label.split('_').filter(word => word.length > 0),
  label: label as string,
}))

/** Unknown keys, always including every inherited-member key. */
const anyUnknownKeyArb = fc.oneof(unknownKeyArb, prototypeKeyArb)

const entryArb = (
  type: fc.Arbitrary<GamblingLedgerEntryType>,
  label: fc.Arbitrary<string>,
): fc.Arbitrary<GamblingLedgerEntry> =>
  fc.record({
    type,
    label,
    playerName: fc.string({ minLength: 1, maxLength: 12 }),
    amount: fc.integer({ min: -9999, max: 9999 }),
    order: fc.nat({ max: 500 }),
  })

const capitalize = (word: string): string => word[0].toUpperCase() + word.slice(1)

describe('Property 32: Ledger label rendering is total', () => {
  /**
   * **Validates: Requirements 10.7**
   *
   * An empty or whitespace-only label renders as a single em dash for every
   * entry type, and the entry's other fields are left alone.
   */
  it('renders a single em dash for an empty or whitespace-only label, for every entry type', () => {
    fc.assert(
      fc.property(
        entryArb(
          fc.constantFrom(...ALL_ENTRY_TYPES, FUTURE_ENTRY_TYPE),
          blankLabelArb,
        ),
        entry => {
          const snapshot = { ...entry }
          expect(formatLedgerLabel(entry)).toBe(EM_DASH)
          expect(entry).toEqual(snapshot)
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 10.4**
   *
   * A `bid` or `ownership_bonus` label is category text and renders verbatim,
   * even when it happens to match a Ledger_Label_Map key or contain
   * underscores.
   */
  it('renders a bid or ownership_bonus label unmodified', () => {
    fc.assert(
      fc.property(
        entryArb(fc.constantFrom(...PASS_THROUGH_ENTRY_TYPES), categoryNameArb),
        entry => {
          expect(formatLedgerLabel(entry)).toBe(entry.label)
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 10.3**
   *
   * A bet entry whose label is a map key renders that key's map value.
   */
  it('renders the Ledger_Label_Map value for a known bet key', () => {
    fc.assert(
      fc.property(
        entryArb(fc.constantFrom(...BET_ENTRY_TYPES), fc.constantFrom(...SIDE_BET_KEYS)),
        entry => {
          expect(formatLedgerLabel(entry)).toBe(LEDGER_LABEL_MAP[entry.label as SideBetType])
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 10.5, 10.6**
   *
   * A bet entry with a label outside the map — and any entry of a type outside
   * the five current members — renders underscore-to-space with each word's
   * first character upper-cased, never a fixed placeholder.
   */
  it('title-cases an unknown key for bet entries and for an unrecognised entry type', () => {
    // Exhaustive over the inherited-member keys, which a lookup that walks the
    // prototype chain would render as a function rather than title-cased text.
    PROTOTYPE_KEYS.forEach(label => {
      const expected = label
        .split('_')
        .filter(word => word.length > 0)
        .map(capitalize)
        .join(' ')

      ;[...BET_ENTRY_TYPES, FUTURE_ENTRY_TYPE].forEach(type => {
        const rendered = formatLedgerLabel({
          type,
          label,
          playerName: 'Player',
          amount: 0,
          order: 0,
        })

        expect(typeof rendered).toBe('string')
        expect(rendered).toBe(expected)
        expect(FORBIDDEN_PLACEHOLDERS).not.toContain(rendered)
        expect(rendered).not.toBe(EM_DASH)
      })
    })

    fc.assert(
      fc.property(
        fc.constantFrom(...BET_ENTRY_TYPES, FUTURE_ENTRY_TYPE),
        anyUnknownKeyArb,
        (type, { words, label }) => {
          const rendered = formatLedgerLabel({
            type,
            label,
            playerName: 'Player',
            amount: 500,
            order: 1,
          })

          expect(rendered).toBe(words.map(capitalize).join(' '))
          expect(rendered).not.toContain('_')
          expect(FORBIDDEN_PLACEHOLDERS).not.toContain(rendered)
          expect(rendered).not.toBe(EM_DASH)
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 10.3, 10.4, 10.5, 10.6, 10.7**
   *
   * Totality across the whole input space: every entry yields a string, the em
   * dash appears exactly when the label is blank, and nothing renders as a
   * fixed placeholder.
   */
  it('returns a string for any entry, with the em dash exactly on blank labels', () => {
    // Every inherited-member key against every entry type, on every run.
    PROTOTYPE_KEYS.forEach(label => {
      ;[...ALL_ENTRY_TYPES, FUTURE_ENTRY_TYPE].forEach(type => {
        const rendered = formatLedgerLabel({
          type,
          label,
          playerName: ' ',
          amount: 0,
          order: 0,
        })

        expect(typeof rendered).toBe('string')
        expect(rendered).not.toBe(EM_DASH)
        expect(rendered).not.toBe('Unknown Label')
      })
    })

    fc.assert(
      fc.property(
        entryArb(
          fc.constantFrom(...ALL_ENTRY_TYPES, FUTURE_ENTRY_TYPE),
          fc.oneof(
            blankLabelArb,
            categoryNameArb,
            anyUnknownKeyArb.map(({ label }) => label),
            fc.constantFrom(...PROTOTYPE_KEYS),
            fc.constantFrom(...SIDE_BET_KEYS),
            fc.string({ maxLength: 30 }),
          ),
        ),
        entry => {
          const rendered = formatLedgerLabel(entry)
          expect(typeof rendered).toBe('string')
          expect(rendered === EM_DASH).toBe(entry.label.trim() === '')
          expect(rendered).not.toBe('Unknown Label')
        },
      ),
      { numRuns: 300 },
    )
  })
})
// Property 33: Ledger label and type maps are total and well-formed

/** The eleven current `SideBetType` members, listed in criterion 10.1 order. */
const EXPECTED_SIDE_BET_KEYS: SideBetType[] = [
  'round_leader',
  'daily_double_finder',
  'most_incorrect',
  'sweep_category',
  'zero_score_round',
  'no_wrong_answers',
  'highest_single_clue',
  'most_correct',
  'first_incorrect',
  'biggest_earner',
  'bottom_feeder',
]

/** The fixed type-column text criterion 10.10 specifies, per entry type. */
const EXPECTED_TYPE_LABELS: Record<GamblingLedgerEntryType, string> = {
  bid: 'Bid',
  bet_placed: 'Bet Placed',
  bet_won: 'Bet Won',
  bet_lost: 'Bet Lost',
  ownership_bonus: 'Ownership Bonus',
}

/**
 * Title case lower-cases short conjunctions, articles, and prepositions in
 * non-initial position, so `Zero or Negative Round` — the value criterion 10.1
 * names for `zero_score_round` — is title-case despite holding `or`. The
 * "no all-lowercase word" clause targets raw key text (`zero_score_round`,
 * `round leader`), which this closed set does not admit: it is checked against
 * the whole value by the all-lowercase assertion below, and any word outside
 * the set must be capitalised.
 */
const TITLE_CASE_MINOR_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
])

describe('Property 33: Ledger label and type maps are total and well-formed', () => {
  /**
   * **Validates: Requirements 10.1**
   *
   * The map is total over the `SideBetType` union and carries no extra keys.
   * `Record<SideBetType, string>` gives the compile-time half of this; the
   * runtime half catches a key that type checks but is absent at runtime.
   */
  it('holds exactly one entry for each of the eleven SideBetType members', () => {
    expect(Object.keys(LEDGER_LABEL_MAP).sort()).toEqual([...EXPECTED_SIDE_BET_KEYS].sort())
    expect(SIDE_BET_KEYS).toHaveLength(EXPECTED_SIDE_BET_KEYS.length)
  })

  /**
   * **Validates: Requirements 10.2**
   *
   * Every value is a title-case noun phrase of 1–4 words and 3–24 characters
   * with no `?`, no underscore, and no all-lowercase word.
   */
  it('gives every SideBetType a well-formed title-case label', () => {
    fc.assert(
      fc.property(fc.constantFrom(...EXPECTED_SIDE_BET_KEYS), key => {
        const value = LEDGER_LABEL_MAP[key]

        expect(typeof value).toBe('string')
        expect(value.length).toBeGreaterThanOrEqual(3)
        expect(value.length).toBeLessThanOrEqual(24)
        expect(value).not.toContain('?')
        expect(value).not.toContain('_')

        // Single spaces only: no leading, trailing, or doubled separator.
        expect(value).toBe(value.trim())
        const words = value.split(' ')
        expect(words.every(word => word.length > 0)).toBe(true)
        expect(words.length).toBeGreaterThanOrEqual(1)
        expect(words.length).toBeLessThanOrEqual(4)

        // Not raw key text: at least one character is upper-cased.
        expect(value).not.toBe(value.toLowerCase())

        // First word always capitalised; later words capitalised unless they
        // are one of the minor words title case lower-cases.
        expect(words[0]).toMatch(/^[A-Z]/)
        words.slice(1).forEach(word => {
          const capitalised = /^[A-Z]/.test(word)
          expect(capitalised || TITLE_CASE_MINOR_WORDS.has(word)).toBe(true)
        })
      }),
      { numRuns: 150 },
    )
  })

  /**
   * **Validates: Requirements 10.2**
   *
   * Each label is independent of the betting-UI copy for the same key, so an
   * edit to either of those maps cannot silently become ledger text.
   */
  it('never reuses the BET_DESCRIPTIONS or BET_EXPLANATIONS value for the same key', () => {
    fc.assert(
      fc.property(fc.constantFrom(...EXPECTED_SIDE_BET_KEYS), key => {
        const value = LEDGER_LABEL_MAP[key]

        expect(value).not.toBe(BET_DESCRIPTIONS[key])
        expect(value).not.toBe(BET_EXPLANATIONS[key])
      }),
      { numRuns: 150 },
    )
  })

  /**
   * **Validates: Requirements 10.10**
   *
   * The type column text is the specified fixed label for every member of the
   * `GamblingLedgerEntryType` union, and the map carries no extra keys.
   */
  it('maps every GamblingLedgerEntryType to its specified type column text', () => {
    expect(Object.keys(LEDGER_TYPE_LABELS).sort()).toEqual(
      Object.keys(EXPECTED_TYPE_LABELS).sort(),
    )

    fc.assert(
      fc.property(fc.constantFrom(...ALL_ENTRY_TYPES), type => {
        expect(LEDGER_TYPE_LABELS[type]).toBe(EXPECTED_TYPE_LABELS[type])
      }),
      { numRuns: 100 },
    )
  })
})
