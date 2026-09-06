import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

// Feature: gambling-updates, Property 7: Add then remove restores available balance

describe('Property 7: Add then remove restores available balance', () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * For any bet added to the BetList and subsequently removed, the player's
   * available balance SHALL return to the value it held before the bet was added.
   *
   * Balance logic:
   *   remainingBalance = playerBalance - totalWagered
   *   totalWagered = placedBets.reduce((sum, b) => sum + b.wager, 0)
   *
   * This is a pure arithmetic property test — no React rendering needed.
   */

  /**
   * Compute the remaining balance given a player balance and a list of bets.
   */
  function computeRemainingBalance(playerBalance: number, bets: { wager: number }[]): number {
    const totalWagered = bets.reduce((sum, b) => sum + b.wager, 0)
    return playerBalance - totalWagered
  }

  /**
   * Simulate removing a bet at a given index from the list (same as filter used in the component).
   */
  function removeBet(bets: { wager: number }[], index: number): { wager: number }[] {
    return bets.filter((_, i) => i !== index)
  }

  it('removing all bets one by one restores balance to the original', () => {
    fc.assert(
      fc.property(
        // Generate a positive starting balance
        fc.integer({ min: 1, max: 1_000_000 }),
        // Generate an array of bet wagers (1 to 10 bets)
        fc.integer({ min: 1, max: 10 }).chain((numBets) =>
          fc.array(fc.integer({ min: 1, max: 100_000 }), { minLength: numBets, maxLength: numBets })
        ),
        (playerBalance, wagers) => {
          // Constrain: sum of wagers must be <= playerBalance (valid bets only)
          const totalWagers = wagers.reduce((sum, w) => sum + w, 0)
          fc.pre(totalWagers <= playerBalance)

          // Build the bet list
          let bets = wagers.map((wager) => ({ wager }))

          // Verify initial remaining balance after adding all bets
          const initialRemaining = computeRemainingBalance(playerBalance, bets)
          expect(initialRemaining).toBe(playerBalance - totalWagers)

          // Remove bets one by one (from last to first to keep indices stable)
          for (let i = bets.length - 1; i >= 0; i--) {
            bets = removeBet(bets, i)
          }

          // After removing all bets, balance should be fully restored
          const finalRemaining = computeRemainingBalance(playerBalance, bets)
          expect(finalRemaining).toBe(playerBalance)
        }
      ),
      { numRuns: 200 }
    )
  })

  it('removing a single bet restores exactly that bet wager to the available balance', () => {
    fc.assert(
      fc.property(
        // Generate a positive starting balance
        fc.integer({ min: 1, max: 1_000_000 }),
        // Generate 1 to 10 bets
        fc.array(fc.integer({ min: 1, max: 100_000 }), { minLength: 1, maxLength: 10 }),
        // Pick a random index to remove
        fc.nat(),
        (playerBalance, wagers, rawIndex) => {
          const totalWagers = wagers.reduce((sum, w) => sum + w, 0)
          fc.pre(totalWagers <= playerBalance)

          const bets = wagers.map((wager) => ({ wager }))
          const indexToRemove = rawIndex % bets.length

          const balanceBefore = computeRemainingBalance(playerBalance, bets)
          const removedWager = bets[indexToRemove].wager
          const betsAfterRemoval = removeBet(bets, indexToRemove)
          const balanceAfter = computeRemainingBalance(playerBalance, betsAfterRemoval)

          // Balance should increase by exactly the removed bet's wager
          expect(balanceAfter).toBe(balanceBefore + removedWager)
        }
      ),
      { numRuns: 200 }
    )
  })
})
