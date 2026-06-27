import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { applyScoreMark, reverseAndApplyMark } from './finalJeopardyScoring'

// Feature: final-jeopardy-and-buzzer, Property 11: Final Jeopardy score marking arithmetic

/**
 * **Validates: Requirements 6.7, 6.8, 6.9**
 *
 * For any player with score S and valid wager W: marking correct SHALL produce
 * score S + W; marking incorrect SHALL produce score S - W; changing a correct
 * marking to incorrect SHALL produce score S - W (reversal of +W then apply -W);
 * changing an incorrect marking to correct SHALL produce score S + W (reversal of
 * -W then apply +W).
 */

describe('Property 11: Final Jeopardy score marking arithmetic', () => {
  it('applyScoreMark(S, W, true) === S + W', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.integer({ min: 0, max: 100000 }),
        (score, wager) => {
          const result = applyScoreMark(score, wager, true)
          expect(result).toBe(score + wager)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('applyScoreMark(S, W, false) === S - W', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.integer({ min: 0, max: 100000 }),
        (score, wager) => {
          const result = applyScoreMark(score, wager, false)
          expect(result).toBe(score - wager)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('reverseAndApplyMark(S+W, W, true, false) === S - W (changing correct to incorrect)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.integer({ min: 0, max: 100000 }),
        (score, wager) => {
          // Player had score S, was marked correct (score became S + W),
          // now changing to incorrect should produce S - W
          const scoreAfterCorrect = score + wager
          const result = reverseAndApplyMark(scoreAfterCorrect, wager, true, false)
          expect(result).toBe(score - wager)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('reverseAndApplyMark(S-W, W, false, true) === S + W (changing incorrect to correct)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 100000 }),
        fc.integer({ min: 0, max: 100000 }),
        (score, wager) => {
          // Player had score S, was marked incorrect (score became S - W),
          // now changing to correct should produce S + W
          const scoreAfterIncorrect = score - wager
          const result = reverseAndApplyMark(scoreAfterIncorrect, wager, false, true)
          expect(result).toBe(score + wager)
        }
      ),
      { numRuns: 100 }
    )
  })
})
