// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest'
import fc from 'fast-check'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Player } from '../../types/game'
import { computeDailyDoubleWagerRange } from '../../utils/gamblingScoring'
import { formatCurrency } from '../../utils/currency'
import { DailyDoubleWager } from './DailyDoubleWager'

// Feature: negative-balance-and-analytics-updates
// Property 13: Daily Double wager validation preserves state
// **Validates: Requirements 3.5, 3.6**

afterEach(cleanup)

// ─── Messages under test ──────────────────────────────────────────────────────

/** Requirement 3.6 — the single message for empty, non-numeric, and fractional entries. */
const WHOLE_DOLLAR_MESSAGE = 'Enter a whole-dollar amount, with no cents.'

/** Requirement 3.5 — the out-of-range message names both bounds via the Currency_Formatter. */
function rangeMessage(min: number, max: number): string {
  return `Wager must be between ${formatCurrency(min)} and ${formatCurrency(max)}.`
}

// ─── Generators ───────────────────────────────────────────────────────────────

/**
 * Real_Balances a selecting player can hold: deeply negative, exactly $0, small
 * positive (where the $1,000 floor still governs), and large positive (where the
 * score itself governs).
 */
const scoreArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: -20_000, max: 50_000 }) },
  { weight: 1, arbitrary: fc.constantFrom(-20_000, -1, 0, 1, 200, 999, 1000, 1001) }
)

/** Empty and whitespace-only submissions. */
const emptyEntryArb: fc.Arbitrary<string> = fc.constantFrom('', ' ', '   ', '\t')

/** Submissions that are not numbers at all, including near-miss numeric shapes. */
const nonNumericEntryArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    'abc',
    '$500',
    '1,000',
    'five hundred',
    '--5',
    '1e',
    '.',
    '-',
    '500x',
    'NaN',
    'Infinity',
    '-Infinity'
  ),
  fc
    .string({ minLength: 1, maxLength: 8 })
    .filter((raw) => raw.trim().length > 0 && !Number.isFinite(Number(raw.trim())))
)

/** Submissions carrying cents, so the whole-dollar check is what rejects them. */
const fractionalEntryArb: fc.Arbitrary<string> = fc
  .integer({ min: -999_999, max: 999_999 })
  .map((cents) => (cents / 100).toFixed(2))
  .filter((entry) => !Number.isInteger(Number(entry)))

/** Whole-dollar submissions on either side of the permitted range for a given score. */
function outOfRangeEntryArb(score: number): fc.Arbitrary<string> {
  const { min, max } = computeDailyDoubleWagerRange(score)
  return fc.oneof(
    fc.integer({ min: min - 100_000, max: min - 1 }).map(String),
    fc.integer({ min: max + 1, max: max + 100_000 }).map(String)
  )
}

/** A score paired with a submission that Requirement 3.5 or 3.6 must reject. */
const invalidSubmissionArb: fc.Arbitrary<{ score: number; entry: string }> = scoreArb.chain(
  (score) =>
    fc.record({
      score: fc.constant(score),
      entry: fc.oneof(
        emptyEntryArb,
        nonNumericEntryArb,
        fractionalEntryArb,
        outOfRangeEntryArb(score)
      ),
    })
)

/** A score paired with a whole-dollar submission inside the permitted range. */
const validSubmissionArb: fc.Arbitrary<{ score: number; wager: number }> = scoreArb.chain(
  (score) => {
    const { min, max } = computeDailyDoubleWagerRange(score)
    return fc.record({ score: fc.constant(score), wager: fc.integer({ min, max }) })
  }
)

// ─── Shared helpers ───────────────────────────────────────────────────────────

function makePlayer(score: number): Player {
  return {
    name: 'Alice',
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

function renderForm(score: number) {
  const onSubmit = vi.fn()
  const player = makePlayer(score)
  // Requirement 3.5, 3.6 — Real_Balance lives on this object, so a snapshot taken
  // before submission is what "unchanged" is measured against.
  const balanceBefore = structuredClone(player)
  const { container } = render(
    <DailyDoubleWager player={player} categoryName="Science" onSubmit={onSubmit} />
  )
  return {
    onSubmit,
    player,
    balanceBefore,
    container,
    input: screen.getByPlaceholderText('Enter wager...') as HTMLInputElement,
  }
}

/**
 * Submits the form the way a player can. The submit button is disabled while the
 * entry is empty, so an empty submission has to go through the form's `Enter`
 * key handler.
 */
function submitForm(): void {
  const button = screen.getByRole('button', { name: 'Submit Wager' }) as HTMLButtonElement
  if (button.disabled) {
    fireEvent.keyDown(window, { key: 'Enter' })
  } else {
    fireEvent.click(button)
  }
}

function readError(container: HTMLElement): string | null {
  return container.querySelector('.dd-wager-error')?.textContent ?? null
}

// ─── Property 13 ──────────────────────────────────────────────────────────────

describe('Property 13: Daily Double wager validation preserves state', () => {
  it('rejects every invalid submission without clearing the entry or touching Real_Balance', () => {
    fc.assert(
      fc.property(invalidSubmissionArb, ({ score, entry }) => {
        const { onSubmit, player, balanceBefore, container, input } = renderForm(score)
        try {
          fireEvent.change(input, { target: { value: entry } })

          // A number input sanitises values it cannot represent, so what the form
          // actually holds is the submission under test.
          const entered = input.value
          const trimmed = entered.trim()
          const wagerNum = Number(trimmed)
          const notWholeDollar =
            trimmed === '' || !Number.isFinite(wagerNum) || !Number.isInteger(wagerNum)
          const { min, max } = computeDailyDoubleWagerRange(score)
          const outOfRange = !notWholeDollar && (wagerNum < min || wagerNum > max)
          // Sanitisation can turn a generated entry into a valid whole-dollar
          // wager in range; that submission is not what this property covers.
          fc.pre(notWholeDollar || outOfRange)

          submitForm()

          expect(onSubmit).not.toHaveBeenCalled()
          expect(readError(container)).toBe(
            notWholeDollar ? WHOLE_DOLLAR_MESSAGE : rangeMessage(min, max)
          )
          expect(input.value).toBe(entered)
          expect(player).toEqual(balanceBefore)
        } finally {
          cleanup()
        }
      }),
      { numRuns: 100 }
    )
  })

  it('accepts every whole-dollar submission inside the permitted range', () => {
    fc.assert(
      fc.property(validSubmissionArb, ({ score, wager }) => {
        const { onSubmit, player, balanceBefore, container, input } = renderForm(score)
        try {
          fireEvent.change(input, { target: { value: String(wager) } })
          submitForm()

          expect(onSubmit).toHaveBeenCalledTimes(1)
          expect(onSubmit).toHaveBeenCalledWith(wager)
          expect(readError(container)).toBeNull()
          // The form reports the wager; it never debits Real_Balance itself.
          expect(player).toEqual(balanceBefore)
        } finally {
          cleanup()
        }
      }),
      { numRuns: 100 }
    )
  })
})
