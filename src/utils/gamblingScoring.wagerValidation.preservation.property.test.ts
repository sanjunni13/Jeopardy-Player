// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fc from 'fast-check'
import { createElement } from 'react'
import type { ComponentProps } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { isValidCumulativeWager } from './gamblingScoring'
import { PlayerBettingPanel } from '../components/player/PlayerBettingPanel'

/**
 * Feature: betting-submission-fixes
 * Property 7: Preservation - Wager Validation Unchanged
 *
 * **Validates: Requirements 3.1**
 *
 * Observation-first preservation suite. Everything asserted here was observed on the
 * UNFIXED code and MUST keep holding after Fix 1 / Fix 2 land:
 *
 *  - `isValidCumulativeWager(existing, new, balance)` === `new > 0 && existing + new <= balance`
 *    It deliberately does NOT enforce integrality — that is a separate panel-level check.
 *  - `PlayerBettingPanel` inline error copy, verbatim:
 *      'Enter a valid wager amount'
 *      'Wager must be a whole number'
 *      'Wager must be greater than zero'
 *      `Exceeds remaining balance ($<remaining>)` — the amount now comes from the
 *      shared Currency_Formatter (negative-balance-and-analytics-updates Req 5.6),
 *      which renders a positive whole-dollar budget identically.
 *      'Select a prediction'
 *      'You already placed a bet on this'
 *  - One bet per bet type: a placed type is removed from the Bet Type select.
 */

// ─── Pinned reference implementation (observed on UNFIXED code) ────────────────

function isValidCumulativeWager_observed(
  existingWagers: number,
  newWager: number,
  availableBalance: number,
): boolean {
  return newWager > 0 && existingWagers + newWager <= availableBalance
}

// ─── Generators ───────────────────────────────────────────────────────────────

/** Money-ish values, plus the awkward numbers the panel can hand the validator. */
const amountArb = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: -10_000, max: 1_000_000 }) },
  { weight: 3, arbitrary: fc.double({ min: -10_000, max: 1_000_000, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(0, -0, 0.5, -0.5, Number.NaN, Infinity, -Infinity) },
)

describe('Property 7: Preservation - Wager Validation Unchanged (Req 3.1)', () => {
  it('isValidCumulativeWager matches the pinned reference for arbitrary (existingWagers, newWager, balance)', () => {
    fc.assert(
      fc.property(amountArb, amountArb, amountArb, (existingWagers, newWager, balance) => {
        expect(isValidCumulativeWager(existingWagers, newWager, balance)).toBe(
          isValidCumulativeWager_observed(existingWagers, newWager, balance),
        )
      }),
      { numRuns: 500 },
    )
  })

  it('rejects every non-positive wager regardless of balance', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc.integer({ min: -1_000_000, max: 0 }),
        fc.nat({ max: 1_000_000 }),
        (existingWagers, newWager, balance) => {
          expect(isValidCumulativeWager(existingWagers, newWager, balance)).toBe(false)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('accepts a positive wager exactly when cumulative wagers stay within balance', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.nat({ max: 1_000_000 }),
        (existingWagers, newWager, balance) => {
          expect(isValidCumulativeWager(existingWagers, newWager, balance)).toBe(
            existingWagers + newWager <= balance,
          )
        },
      ),
      { numRuns: 500 },
    )
  })

  it('accepts a wager that exactly consumes the remaining balance (boundary)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 500_000 }),
        fc.integer({ min: 1, max: 500_000 }),
        (existingWagers, newWager) => {
          const balance = existingWagers + newWager
          expect(isValidCumulativeWager(existingWagers, newWager, balance)).toBe(true)
          expect(isValidCumulativeWager(existingWagers, newWager, balance - 1)).toBe(false)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('does NOT enforce integrality — a fractional in-balance wager is still valid here', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (existingWagers, whole) => {
          const fractional = whole + 0.5
          expect(isValidCumulativeWager(existingWagers, fractional, existingWagers + whole + 1)).toBe(
            true,
          )
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Panel inline error copy ──────────────────────────────────────────────────

const threeBets = [
  { betType: 'round_leader', description: 'Who will lead after this round?' },
  { betType: 'most_incorrect', description: 'Who will get the most wrong?' },
  { betType: 'most_correct', description: 'Who will get the most correct?' },
]

function renderPanel(overrides: Record<string, unknown> = {}) {
  const channel = { send: vi.fn().mockResolvedValue('ok') } as unknown as import('@supabase/supabase-js').RealtimeChannel
  return render(
    createElement(PlayerBettingPanel, {
      availableBets: threeBets,
      playerBalance: 1000,
      timerDuration: 60,
      channel,
      playerName: 'Alice',
      players: ['Alice', 'Bob', 'Charlie'],
      onBettingDone: vi.fn(),
      ...overrides,
    } as ComponentProps<typeof PlayerBettingPanel>),
  )
}

function addBet(wager: string) {
  fireEvent.change(screen.getByLabelText('Wager'), { target: { value: wager } })
  fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))
}

describe('Property 7: Preservation - panel inline error copy unchanged (Req 3.1)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('empty wager input reports "Enter a valid wager amount"', () => {
    renderPanel()
    addBet('')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid wager amount')
  })

  it('zero wager reports "Wager must be greater than zero"', () => {
    renderPanel()
    addBet('0')
    expect(screen.getByRole('alert')).toHaveTextContent('Wager must be greater than zero')
  })

  it('over-balance wager reports "Exceeds remaining balance ($<remaining>)"', () => {
    renderPanel({ playerBalance: 1234 })
    addBet('2000')
    expect(screen.getByRole('alert')).toHaveTextContent(
      `Exceeds remaining balance ($${(1234).toLocaleString()})`,
    )
  })

  it('missing prediction reports "Select a prediction"', () => {
    renderPanel({ players: [] })
    addBet('100')
    expect(screen.getByRole('alert')).toHaveTextContent('Select a prediction')
  })

  it('a placed bet type is removed from the Bet Type select (one bet per type)', () => {
    renderPanel()
    addBet('100')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const select = screen.getByLabelText('Bet Type') as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).not.toContain('round_leader')
    expect(options).toEqual(['most_incorrect', 'most_correct'])
  })

  it('the wager input rejects non-digit characters before validation runs', () => {
    renderPanel()
    const input = screen.getByLabelText('Wager')
    fireEvent.change(input, { target: { value: '1.5' } })
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: '-50' } })
    expect(input).toHaveValue('')
  })

  it('panel accept/reject decisions agree with isValidCumulativeWager for arbitrary whole wagers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (playerBalance, wager) => {
          cleanup()
          renderPanel({ playerBalance })
          addBet(String(wager))

          const valid = isValidCumulativeWager(0, wager, playerBalance)
          const alert = screen.queryByRole('alert')

          if (valid) {
            expect(alert).toBeNull()
          } else if (wager === 0) {
            expect(alert).toHaveTextContent('Wager must be greater than zero')
          } else {
            expect(alert).toHaveTextContent(
              `Exceeds remaining balance ($${playerBalance.toLocaleString()})`,
            )
          }
        },
      ),
      { numRuns: 40 },
    )
  })

  it('every inline error string is still present verbatim in the panel source', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/player/PlayerBettingPanel.tsx'),
      'utf-8',
    )
    for (const copy of [
      "'Enter a valid wager amount'",
      "'Wager must be a whole number'",
      "'Wager must be greater than zero'",
      // negative-balance-and-analytics-updates Req 5.6 / 5.13 moved every monetary
      // value in this panel onto the shared Currency_Formatter, so the interpolated
      // amount is now `formatCurrency(...)` rather than a raw `$${…toLocaleString()}`.
      // The rendered copy is unchanged for a positive budget, which the assertions
      // above still pin.
      '`Exceeds remaining balance (${formatCurrency(remainingBudget)})`',
      "'Select a prediction'",
      "'You already placed a bet on this'",
    ]) {
      expect(source).toContain(copy)
    }
  })
})
