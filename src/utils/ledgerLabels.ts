/**
 * Human-readable text for the gambling ledger (Requirement 10).
 *
 * These values are held here independently of `BET_DESCRIPTIONS` and
 * `BET_EXPLANATIONS` (criterion 10.2). Those two maps are live betting-UI
 * copy — bettor-facing questions — and editing them must never change what
 * the ledger reads.
 */

import type {
  GamblingLedgerEntry,
  GamblingLedgerEntryType,
  SideBetType,
} from '../types/game'

/**
 * Wraps a lookup table so it inherits nothing from `Object.prototype`.
 *
 * Ledger labels and entry types are data-driven strings, so a label such as
 * `'constructor'` or `'toString'` would otherwise resolve through the
 * prototype chain and hand back a function instead of missing the map. With a
 * null prototype, only real entries resolve and every other key is
 * `undefined`, so unknown keys take the fallback path (criteria 10.5–10.7).
 */
function nullPrototype<T extends object>(entries: T): T {
  return Object.assign(Object.create(null) as T, entries)
}

/**
 * Ledger_Label_Map. Typed `Record<SideBetType, string>` so adding a member to
 * the `SideBetType` union fails type checking until a label is supplied
 * (criterion 10.1). Each value is a title-case noun phrase (criterion 10.2).
 */
export const LEDGER_LABEL_MAP: Record<SideBetType, string> = nullPrototype({
  round_leader: 'Round Leader',
  daily_double_finder: 'First Daily Double',
  most_incorrect: 'Most Wrong Answers',
  sweep_category: 'Category Sweep',
  zero_score_round: 'Zero or Negative Round',
  no_wrong_answers: 'Perfect Round',
  highest_single_clue: 'Highest Single Clue',
  most_correct: 'Most Correct Answers',
  first_incorrect: 'First Wrong Answer',
  biggest_earner: 'Biggest Earner',
  bottom_feeder: 'Lowest Score',
})

/** Entry types whose label holds a `SideBetType` key. */
const BET_ENTRY_TYPES = new Set<string>(['bet_placed', 'bet_won', 'bet_lost'])

/** Entry types whose label holds a category name and is shown unmodified. */
const PASS_THROUGH_TYPES = new Set<string>(['bid', 'ownership_bonus'])

/**
 * Replaces each underscore with a single space and upper-cases the first
 * character of each resulting word (criteria 10.5, 10.6).
 */
export function titleCaseKey(raw: string): string {
  return raw
    .split('_')
    .filter(word => word.length > 0)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Label-column text for a ledger entry. Total over every entry and never
 * returns a fixed placeholder (criteria 10.3–10.7).
 *
 * The empty/whitespace check runs first so a whitespace-only category name on
 * a `bid` entry also renders the em dash rather than passing through.
 */
export function formatLedgerLabel(entry: GamblingLedgerEntry): string {
  if (entry.label.trim() === '') return '—'
  if (PASS_THROUGH_TYPES.has(entry.type)) return entry.label
  if (BET_ENTRY_TYPES.has(entry.type)) {
    // `LEDGER_LABEL_MAP` has a null prototype, so a label like `'constructor'`
    // is simply absent and falls through to the title-case transformation.
    const mapped: string | undefined = LEDGER_LABEL_MAP[entry.label as SideBetType]
    return mapped ?? titleCaseKey(entry.label)
  }
  return titleCaseKey(entry.label)
}

/** Type-column text for each ledger entry type (criterion 10.10). */
export const LEDGER_TYPE_LABELS: Record<GamblingLedgerEntryType, string> = nullPrototype({
  bid: 'Bid',
  bet_placed: 'Bet Placed',
  bet_won: 'Bet Won',
  bet_lost: 'Bet Lost',
  ownership_bonus: 'Ownership Bonus',
})
