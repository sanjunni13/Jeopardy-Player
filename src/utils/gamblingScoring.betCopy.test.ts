import { describe, it, expect } from 'vitest'
import { BET_DESCRIPTIONS, BET_EXPLANATIONS } from './gamblingScoring'

/**
 * Unit tests for the corrected bet copy (spec `betting-submission-fixes`, task 8.3).
 *
 * Both the host-side `BettingSideGames` flow and the player-side
 * `PlayerBettingPanel` read these constants, so asserting them here covers the
 * copy shown on every surface (Req 3.8).
 *
 * Validates: Requirements 1.1, 1.3, 2.1, 2.3, 3.8
 */
describe('bet copy for highest_single_clue and daily_double_finder', () => {
  it('describes highest_single_clue by earnings rather than clue face value', () => {
    expect(BET_DESCRIPTIONS.highest_single_clue).toBe('Who will earn the most from one clue?')
  })

  it('explains highest_single_clue as credited points including doubles and DD wagers', () => {
    expect(BET_EXPLANATIONS.highest_single_clue).toBe(
      'Predict who will earn the most points from a single clue, counting category-ownership doubles and Daily Double wagers.'
    )
  })

  it('no longer refers to the highest-value clue', () => {
    expect(BET_DESCRIPTIONS.highest_single_clue).not.toMatch(/highest-value/i)
    expect(BET_EXPLANATIONS.highest_single_clue).not.toMatch(/highest-value/i)
  })

  it('describes daily_double_finder as being first to find a Daily Double', () => {
    expect(BET_DESCRIPTIONS.daily_double_finder).toBe('Who will be first to find a Daily Double?')
  })

  it('explains daily_double_finder as the first player to select a Daily Double clue', () => {
    expect(BET_EXPLANATIONS.daily_double_finder).toBe(
      'Predict who will be the first player to select a Daily Double clue this round.'
    )
  })

  it('mentions "first" in both daily_double_finder strings so multi-DD rounds are unambiguous', () => {
    expect(BET_DESCRIPTIONS.daily_double_finder).toMatch(/first/i)
    expect(BET_EXPLANATIONS.daily_double_finder).toMatch(/first/i)
  })

  it('keeps every bet type non-empty in both copy maps', () => {
    for (const [betType, description] of Object.entries(BET_DESCRIPTIONS)) {
      expect(description.trim().length, `${betType} description`).toBeGreaterThan(0)
    }
    for (const [betType, explanation] of Object.entries(BET_EXPLANATIONS)) {
      expect(explanation.trim().length, `${betType} explanation`).toBeGreaterThan(0)
    }
    expect(Object.keys(BET_EXPLANATIONS).sort()).toEqual(Object.keys(BET_DESCRIPTIONS).sort())
  })
})
