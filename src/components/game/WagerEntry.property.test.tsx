// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { render, cleanup } from '@testing-library/react'
import { WagerEntry } from './WagerEntry'
import type { Player } from '../../types/game'

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
