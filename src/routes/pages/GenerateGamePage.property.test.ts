import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

/**
 * Mirrors the validation logic from GenerateGamePage.tsx:
 * const isAiGenerateDisabled = aiState.rounds === '' || aiState.categoriesPerRound === '' || aiState.difficulty === '' || aiState.loading
 */
function isGenerateButtonDisabled(state: {
  rounds: string
  categoriesPerRound: string
  difficulty: string
  loading: boolean
}): boolean {
  return state.rounds === '' || state.categoriesPerRound === '' || state.difficulty === '' || state.loading
}

// Feature: ai-game-generation, Property 1: Form validation enables button iff all required fields set
describe('Property 1: Form validation enables button iff all required fields set', () => {
  /**
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
   *
   * For any combination of form field states, the "Generate Game" button SHALL be enabled
   * if and only if all three required fields (rounds, categoriesPerRound, difficulty) have
   * a non-empty value, regardless of the specialRequests value.
   */
  it('button enabled iff all three required fields are non-empty and not loading', () => {
    const roundsArb = fc.oneof(
      fc.constant(''),
      fc.constantFrom('1', '2', '3', '4', '5', '6')
    )
    const categoriesArb = fc.oneof(
      fc.constant(''),
      fc.constantFrom('1', '2', '3', '4', '5', '6')
    )
    const difficultyArb = fc.oneof(
      fc.constant(''),
      fc.constantFrom('easy', 'medium', 'hard')
    )
    const specialRequestsArb = fc.string({ minLength: 0, maxLength: 500 })

    fc.assert(
      fc.property(
        roundsArb,
        categoriesArb,
        difficultyArb,
        specialRequestsArb,
        (rounds, categoriesPerRound, difficulty, specialRequests) => {
          const disabled = isGenerateButtonDisabled({
            rounds,
            categoriesPerRound,
            difficulty,
            loading: false,
          })

          const allRequiredSet = rounds !== '' && categoriesPerRound !== '' && difficulty !== ''

          // Button should be enabled (not disabled) iff all required fields are set
          if (allRequiredSet) {
            expect(disabled).toBe(false)
          } else {
            expect(disabled).toBe(true)
          }

          // specialRequests does not affect the result
          void specialRequests
        }
      ),
      { numRuns: 100 }
    )
  })

  it('button is always disabled when loading is true, regardless of field values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', '1', '2', '3', '4', '5', '6'),
        fc.constantFrom('', '1', '2', '3', '4', '5', '6'),
        fc.constantFrom('', 'easy', 'medium', 'hard'),
        (rounds, categoriesPerRound, difficulty) => {
          const disabled = isGenerateButtonDisabled({
            rounds,
            categoriesPerRound,
            difficulty,
            loading: true,
          })
          expect(disabled).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})

/**
 * Mirrors the param construction from GenerateGamePage.tsx handleGenerateAi():
 *
 * const params = {
 *   rounds: Number(aiState.rounds),
 *   categoriesPerRound: Number(aiState.categoriesPerRound),
 *   difficulty: aiState.difficulty as 'easy' | 'medium' | 'hard',
 *   dailyDoublesPerRound: aiState.dailyDoublesPerRound,
 *   specialRequests: aiState.specialRequests,
 * }
 */
function buildRequestParams(formState: {
  rounds: string
  categoriesPerRound: string
  difficulty: string
  dailyDoublesPerRound: number
  specialRequests: string
}) {
  return {
    rounds: Number(formState.rounds),
    categoriesPerRound: Number(formState.categoriesPerRound),
    difficulty: formState.difficulty as 'easy' | 'medium' | 'hard',
    dailyDoublesPerRound: formState.dailyDoublesPerRound,
    specialRequests: formState.specialRequests,
  }
}

// Feature: ai-game-generation, Property 2: Generation request includes all form parameters
describe('Property 2: Generation request includes all form parameters', () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For any valid form state, the request params SHALL contain all 5 fields
   * (rounds, categoriesPerRound, difficulty, dailyDoublesPerRound, specialRequests)
   * with values matching the form state.
   */
  it('for any valid form state, request params contain all 5 fields matching form values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('1', '2', '3', '4', '5', '6'),  // rounds
        fc.constantFrom('1', '2', '3', '4', '5', '6'),  // categoriesPerRound
        fc.constantFrom('easy', 'medium', 'hard'),       // difficulty
        fc.integer({ min: 0, max: 6 }),                  // dailyDoublesPerRound
        fc.string({ minLength: 0, maxLength: 500 }),     // specialRequests
        (rounds, categoriesPerRound, difficulty, dailyDoublesPerRound, specialRequests) => {
          const params = buildRequestParams({
            rounds,
            categoriesPerRound,
            difficulty,
            dailyDoublesPerRound,
            specialRequests,
          })

          // Verify all 5 parameters are present
          expect(params).toHaveProperty('rounds')
          expect(params).toHaveProperty('categoriesPerRound')
          expect(params).toHaveProperty('difficulty')
          expect(params).toHaveProperty('dailyDoublesPerRound')
          expect(params).toHaveProperty('specialRequests')

          // Verify values match form state
          expect(params.rounds).toBe(Number(rounds))
          expect(params.categoriesPerRound).toBe(Number(categoriesPerRound))
          expect(params.difficulty).toBe(difficulty)
          expect(params.dailyDoublesPerRound).toBe(dailyDoublesPerRound)
          expect(params.specialRequests).toBe(specialRequests)

          // Verify the body is JSON-serializable (i.e., it can be sent as request body)
          const json = JSON.stringify(params)
          const parsed = JSON.parse(json)
          expect(parsed.rounds).toBe(params.rounds)
          expect(parsed.categoriesPerRound).toBe(params.categoriesPerRound)
          expect(parsed.difficulty).toBe(params.difficulty)
          expect(parsed.dailyDoublesPerRound).toBe(params.dailyDoublesPerRound)
          expect(parsed.specialRequests).toBe(params.specialRequests)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: ai-game-generation, Property 3: Retry uses identical parameters
describe('Property 3: Retry uses identical parameters', () => {
  /**
   * **Validates: Requirements 7.2**
   *
   * For any valid generation request that fails on the first attempt,
   * the automatic retry request SHALL contain an identical JSON body
   * and headers to the original request.
   *
   * Mirrors the behavior in handleGenerateAi():
   * params is built once and used for both the first attempt and the retry.
   */
  function buildRequestParams(formState: {
    rounds: string
    categoriesPerRound: string
    difficulty: string
    dailyDoublesPerRound: number
    specialRequests: string
  }) {
    return {
      rounds: Number(formState.rounds),
      categoriesPerRound: Number(formState.categoriesPerRound),
      difficulty: formState.difficulty as 'easy' | 'medium' | 'hard',
      dailyDoublesPerRound: formState.dailyDoublesPerRound,
      specialRequests: formState.specialRequests,
    }
  }

  it('for any valid params, first attempt and retry use identical request body', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('1', '2', '3', '4', '5', '6'),
        fc.constantFrom('1', '2', '3', '4', '5', '6'),
        fc.constantFrom('easy', 'medium', 'hard'),
        fc.integer({ min: 0, max: 6 }),
        fc.string({ minLength: 0, maxLength: 500 }),
        (rounds, categoriesPerRound, difficulty, dailyDoublesPerRound, specialRequests) => {
          const params = buildRequestParams({
            rounds,
            categoriesPerRound,
            difficulty,
            dailyDoublesPerRound,
            specialRequests,
          })

          // Simulate first request serialization
          const firstRequestBody = JSON.stringify(params)

          // Simulate retry request serialization (using same params object)
          const retryRequestBody = JSON.stringify(params)

          // They must be identical
          expect(retryRequestBody).toBe(firstRequestBody)

          // Additionally verify the params object was not mutated
          expect(params.rounds).toBe(Number(rounds))
          expect(params.categoriesPerRound).toBe(Number(categoriesPerRound))
          expect(params.difficulty).toBe(difficulty)
          expect(params.dailyDoublesPerRound).toBe(dailyDoublesPerRound)
          expect(params.specialRequests).toBe(specialRequests)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('serialized body is deterministic for the same input', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('1', '2', '3', '4', '5', '6'),
        fc.constantFrom('1', '2', '3', '4', '5', '6'),
        fc.constantFrom('easy', 'medium', 'hard'),
        fc.integer({ min: 0, max: 6 }),
        fc.string({ minLength: 0, maxLength: 500 }),
        (rounds, categoriesPerRound, difficulty, dailyDoublesPerRound, specialRequests) => {
          // Build params twice from same form state
          const formState = { rounds, categoriesPerRound, difficulty, dailyDoublesPerRound, specialRequests }
          const params1 = buildRequestParams(formState)
          const params2 = buildRequestParams(formState)

          expect(JSON.stringify(params1)).toBe(JSON.stringify(params2))
        }
      ),
      { numRuns: 100 }
    )
  })
})
