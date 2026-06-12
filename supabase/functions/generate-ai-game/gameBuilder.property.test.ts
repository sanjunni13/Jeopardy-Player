import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { buildGame, buildErrorResponse, responseContainsApiKey, ROUND_NAMES } from './gameBuilder'
import type { Category, GeminiCategory, GeminiFinal } from './gameBuilder'

// Feature: ai-game-generation, Property 7: All html fields are false in AI-generated games
describe('Property 7: All html fields are false in AI-generated games', () => {
  /**
   * Validates: Requirements 10.5
   *
   * For any valid game params and Gemini response, every clue.html and final.html
   * must be false in the built game.
   */
  it('for any valid game params and Gemini response, all html fields are false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }), // rounds
        fc.integer({ min: 1, max: 6 }), // categoriesPerRound
        fc.integer({ min: 0, max: 6 }), // dailyDoublesPerRound
        (rounds, categoriesPerRound, dailyDoublesPerRound) => {
          const totalCategories = rounds * categoriesPerRound

          // Generate random Gemini categories
          const geminiCategories: GeminiCategory[] = Array.from(
            { length: totalCategories },
            (_, i) => ({
              name: `Category ${i + 1}`,
              clues: Array.from({ length: 5 }, (_, j) => ({
                clue: `Clue ${j + 1} for category ${i + 1}`,
                solution: `What is answer ${j + 1}?`,
              })),
            })
          )

          const geminiFinal: GeminiFinal = {
            category: 'Final Category',
            clue: 'Final clue text',
            solution: 'What is final answer?',
          }

          const game = buildGame(
            { rounds, categoriesPerRound, dailyDoublesPerRound },
            geminiCategories,
            geminiFinal
          )

          // Verify all clue html fields are false
          for (const roundCategories of Object.values(game.rounds)) {
            for (const category of roundCategories as Category[]) {
              for (const clue of category.clues) {
                expect(clue.html).toBe(false)
              }
            }
          }

          // Verify final round html is false
          expect(game.final.html).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: ai-game-generation, Property 6: Generated game is a valid NormalizedGame
describe('Property 6: Generated game is a valid NormalizedGame', () => {
  /**
   * **Validates: Requirements 10.4**
   *
   * For any valid request parameters and valid Gemini response,
   * the constructed game object shall have a `rounds` record keyed by
   * word-descriptor names with exactly `rounds` entries, a `final` object
   * with non-empty category/clue/solution fields, and `totalRounds` equal
   * to the number of round entries.
   */
  it('for any valid params and Gemini response, output is a valid NormalizedGame', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),  // rounds
        fc.integer({ min: 1, max: 6 }),  // categoriesPerRound
        fc.integer({ min: 0, max: 6 }),  // dailyDoublesPerRound
        fc.string({ minLength: 1, maxLength: 50 }),  // random category name prefix
        fc.string({ minLength: 1, maxLength: 100 }), // random final clue text
        (rounds, categoriesPerRound, dailyDoublesPerRound, catPrefix, finalClue) => {
          const totalCategories = rounds * categoriesPerRound

          const geminiCategories: GeminiCategory[] = Array.from({ length: totalCategories }, (_, i) => ({
            name: `${catPrefix} ${i + 1}`,
            clues: Array.from({ length: 5 }, (_, j) => ({
              clue: `Clue ${j + 1}`,
              solution: `What is ${j + 1}?`,
            })),
          }))

          const geminiFinal: GeminiFinal = {
            category: `Final ${catPrefix}`,
            clue: finalClue,
            solution: 'What is the answer?',
          }

          const game = buildGame(
            { rounds, categoriesPerRound, dailyDoublesPerRound },
            geminiCategories,
            geminiFinal
          )

          // Verify correct round keys (word-descriptor names)
          const expectedRoundNames = ROUND_NAMES.slice(0, rounds)
          expect(Object.keys(game.rounds)).toEqual(expectedRoundNames)

          // Verify correct number of categories per round
          for (const roundName of expectedRoundNames) {
            expect(game.rounds[roundName]).toHaveLength(categoriesPerRound)
          }

          // Verify totalRounds matches
          expect(game.totalRounds).toBe(rounds)

          // Verify final round has non-empty fields
          expect(game.final.category.length).toBeGreaterThan(0)
          expect(game.final.clue.length).toBeGreaterThan(0)
          expect(game.final.solution.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})


// Feature: ai-game-generation, Property 12: API key never appears in responses
describe('Property 12: API key never appears in responses', () => {
  /**
   * **Validates: Requirements 13.2**
   *
   * For any response from the Edge Function (success, error, timeout, or any status code),
   * the response body and headers SHALL NOT contain the Gemini API key value.
   */
  it('for any generated error response, the API key is never present in the body', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // random API key
        fc.oneof(
          fc.constant('Server configuration error'),
          fc.constant('AI generation failed. Please retry.'),
          fc.constant('AI generation timed out. Please retry.'),
          fc.constant('Unauthorized'),
          fc.constant('Rate limit exceeded. Try again later.'),
          fc.string({ minLength: 1, maxLength: 200 }), // random error message
        ),
        (apiKey, errorMsg) => {
          const response = buildErrorResponse(errorMsg, apiKey)
          const responseJson = JSON.stringify(response)
          expect(responseJson).not.toContain(apiKey)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('for any error message that accidentally contains the API key, it gets redacted', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // random API key
        fc.string({ minLength: 0, maxLength: 50 }),  // prefix
        fc.string({ minLength: 0, maxLength: 50 }),  // suffix
        (apiKey, prefix, suffix) => {
          // Error message that contains the API key
          const errorWithKey = `${prefix}${apiKey}${suffix}`
          const response = buildErrorResponse(errorWithKey, apiKey)
          const responseJson = JSON.stringify(response)
          expect(responseJson).not.toContain(apiKey)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('responseContainsApiKey correctly detects the key in body or headers', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 50 }), // random API key
        (apiKey) => {
          // Body contains key
          expect(responseContainsApiKey(`{"error": "${apiKey}"}`, {}, apiKey)).toBe(true)
          // Header contains key
          expect(responseContainsApiKey('{}', { 'X-Debug': apiKey }, apiKey)).toBe(true)
          // Neither contains key
          expect(responseContainsApiKey('{"error": "safe"}', { 'Content-Type': 'application/json' }, apiKey)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
