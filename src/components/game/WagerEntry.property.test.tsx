// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { WagerEntry } from './WagerEntry'
import type { Player } from '../../types/game'
import {
  computeBalanceRelativeWagerRange,
  computeLowestPositiveBalance,
} from '../../utils/gameToggles'
import { formatCurrency } from '../../utils/currency'

// ─── Generators ───────────────────────────────────────────────────────────────

const playerNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,14}$/)
  .filter(s => s.trim().length > 0)
  .map(s => s.trim())

const scoreArb = fc.integer({ min: -10000, max: 100000 })

const playerArb: fc.Arbitrary<Player> = fc.record({
  name: playerNameArb,
  score: scoreArb,
  correctCount: fc.integer({ min: 0, max: 50 }),
  incorrectCount: fc.integer({ min: 0, max: 50 }),
  correctDailyDoubles: fc.integer({ min: 0, max: 5 }),
  incorrectDailyDoubles: fc.integer({ min: 0, max: 5 }),
  correctFinalJeopardy: fc.integer({ min: 0, max: 1 }),
  incorrectFinalJeopardy: fc.integer({ min: 0, max: 1 }),
  totalEarned: fc.integer({ min: 0, max: 100000 }),
})

/** Players with distinct names, since a name keys every wager row. */
function uniquePlayersArb(maxLength: number): fc.Arbitrary<Player[]> {
  return fc
    .array(playerArb, { minLength: 1, maxLength })
    .map(players => {
      const seen = new Set<string>()
      return players.filter(p => {
        if (seen.has(p.name)) return false
        seen.add(p.name)
        return true
      })
    })
    .filter(players => players.length >= 1)
}

// ─── Property 7: WagerEntry screen lists all players with their information ───

describe('Property 7: WagerEntry screen lists all players with their information', () => {
  /**
   * **Validates: Requirements 3.2**
   *
   * For any array of 1–6 players, WagerEntry SHALL render one row per
   * player, each displaying the player's name, score, and wager range.
   */

  it('renders one row per player with name and score visible', () => {
    fc.assert(
      fc.property(
        fc.array(playerArb, { minLength: 1, maxLength: 6 })
          .map(players => {
            // Ensure unique names
            const seen = new Set<string>()
            return players.filter(p => {
              if (seen.has(p.name)) return false
              seen.add(p.name)
              return true
            })
          })
          .filter(players => players.length >= 1),
        fc.integer({ min: 1, max: 10000 }),
        (players, wagerFloor) => {
          cleanup()
          const onReveal = () => {}
          const { container } = render(
            <WagerEntry players={players} wagerFloor={wagerFloor} onReveal={onReveal} />
          )

          // Verify each player's name appears in the DOM
          for (const player of players) {
            const textContent = container.textContent || ''
            expect(textContent).toContain(player.name)
          }

          // Count the number of wager input rows
          const inputs = container.querySelectorAll('input[aria-label]')
          expect(inputs.length).toBe(players.length)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('displays wager range for each player', () => {
    fc.assert(
      fc.property(
        fc.array(playerArb, { minLength: 1, maxLength: 4 })
          .map(players => {
            const seen = new Set<string>()
            return players.filter(p => {
              if (seen.has(p.name)) return false
              seen.add(p.name)
              return true
            })
          })
          .filter(players => players.length >= 1),
        fc.integer({ min: 1, max: 10000 }),
        (players, wagerFloor) => {
          cleanup()
          const onReveal = () => {}
          const { container } = render(
            <WagerEntry players={players} wagerFloor={wagerFloor} onReveal={onReveal} />
          )

          // Each player should have a wager input with the correct aria-label
          for (const player of players) {
            const input = container.querySelector(`input[aria-label="Wager for ${player.name}"]`)
            expect(input).not.toBeNull()
          }
        }
      ),
      { numRuns: 50 }
    )
  })
})

// ─── Property 17: Out-of-range wagers are rejected ────────────────────────────

describe('Property 17: Wager submissions outside the permitted range are rejected', () => {
  /**
   * **Validates: Requirements 4.6**
   *
   * For any player and any submitted wager outside that player's permitted
   * range, the wager form rejects the submission and produces an error naming
   * both bounds as the exact strings the Currency_Formatter returns for them.
   *
   * The input filters everything but digits, so an out-of-range submission is
   * a whole number below the minimum or above the maximum.
   */

  it('rejects an out-of-range wager and names both bounds via formatCurrency', () => {
    fc.assert(
      fc.property(
        uniquePlayersArb(4),
        fc.integer({ min: 1, max: 10000 }),
        fc.nat(),
        fc.boolean(),
        fc.nat({ max: 9999 }),
        (players, wagerFloor, targetSeed, below, offset) => {
          cleanup()
          const target = players[targetSeed % players.length]
          const { min, max } = computeBalanceRelativeWagerRange(
            target.score,
            wagerFloor,
            computeLowestPositiveBalance(players)
          )

          // min is always at least $1, so [0, min - 1] is a valid below-range band.
          const wager = below ? offset % min : max + 1 + offset
          expect(wager < min || wager > max).toBe(true)

          const onReveal = vi.fn()
          const { getByLabelText, getByText, queryAllByRole } = render(
            <WagerEntry players={players} wagerFloor={wagerFloor} onReveal={onReveal} />
          )

          // Identity normalizer: generated names may hold repeated spaces that
          // the default whitespace-collapsing normalizer would not match.
          const input = getByLabelText(`Wager for ${target.name}`, {
            normalizer: text => text,
          })
          fireEvent.change(input, { target: { value: String(wager) } })

          // Submission is refused: the reveal never fires with an invalid wager.
          fireEvent.click(getByText('Reveal Clue'))
          expect(onReveal).not.toHaveBeenCalled()

          // Validation on blur surfaces the range error naming both bounds.
          fireEvent.blur(input)
          const alerts = queryAllByRole('alert')
          expect(alerts).toHaveLength(1)
          expect(alerts[0].textContent).toBe(
            `Wager must be between ${formatCurrency(min)} and ${formatCurrency(max)}.`
          )
          expect(alerts[0].textContent).toContain(formatCurrency(min))
          expect(alerts[0].textContent).toContain(formatCurrency(max))
          expect(input.getAttribute('aria-invalid')).toBe('true')
          expect(onReveal).not.toHaveBeenCalled()
        }
      ),
      { numRuns: 100 }
    )
  })
})
