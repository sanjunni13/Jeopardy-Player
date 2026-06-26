import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { validatePlayerName, buildPlayerInsertPayload, checkPlayerNameAvailable } from './playerProfile'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Helper Generators ─────────────────────────────────────────────────────

/** Characters in the allowed set: [a-zA-Z0-9 _-] */
const VALID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-'
const validChar = fc.constantFrom(...VALID_CHARS.split(''))

/** Non-space valid characters (ensures the string isn't whitespace-only after trim) */
const VALID_NON_SPACE_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'
const validNonSpaceChar = fc.constantFrom(...VALID_NON_SPACE_CHARS.split(''))

/**
 * Generate a string whose trimmed result is composed entirely of valid characters
 * with length between 1 and 50. Guarantees at least one non-space character so trim doesn't empty it.
 */
const validPlayerName = fc
  .tuple(
    validNonSpaceChar,
    fc.array(validChar, { minLength: 0, maxLength: 48 }),
    validNonSpaceChar
  )
  .map(([first, middle, last]) => [first, ...middle, last].join(''))
  .filter(s => s.trim().length >= 1 && s.trim().length <= 50)

/** Generate a string from valid chars that exceeds 50 characters */
const tooLongValidCharsName = fc
  .array(validChar, { minLength: 51, maxLength: 100 })
  .map(chars => chars.join(''))

/** Characters outside the allowed set */
const invalidChar = fc
  .string({ minLength: 1, maxLength: 1 })
  .filter(c => c.length === 1 && !VALID_CHARS.includes(c))

/** Generate a string that contains at least one invalid character */
const nameWithInvalidChar = fc
  .tuple(
    fc.array(validChar, { minLength: 0, maxLength: 20 }),
    invalidChar,
    fc.array(validChar, { minLength: 0, maxLength: 20 })
  )
  .map(([prefix, bad, suffix]) => [...prefix, bad, ...suffix].join(''))

/** Whitespace padding (spaces, tabs, etc.) */
const whitespacePadding = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 5 })
  .map(chars => chars.join(''))

/** The reference regex for validation (mirrors the implementation) */
const ALLOWED_PATTERN = /^[a-zA-Z0-9 _-]+$/

// Feature: user-profile-setup, Property 1: Player name validation accepts exactly the allowed character set
describe('Property 1: Player name validation accepts exactly the allowed character set', () => {
  /**
   * **Validates: Requirements 1.2, 1.3**
   *
   * For any string, validatePlayerName SHALL return valid if and only if
   * the trimmed string has length between 1 and 50 (inclusive) and every
   * character matches [a-zA-Z0-9 _-]. Any string that is empty after trimming,
   * exceeds 50 characters after trimming, or contains characters outside
   * the allowed set SHALL be rejected.
   */

  it('accepts any string from the valid character set with length 1–50', () => {
    fc.assert(
      fc.property(validPlayerName, (name) => {
        const result = validatePlayerName(name)
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      }),
      { numRuns: 100 }
    )
  })

  it('rejects strings containing at least one invalid character', () => {
    fc.assert(
      fc.property(nameWithInvalidChar, (name) => {
        const result = validatePlayerName(name)
        expect(result.valid).toBe(false)
        expect(result.error).toBeDefined()
      }),
      { numRuns: 100 }
    )
  })

  it('accepts valid strings padded with leading/trailing whitespace (trimmed)', () => {
    fc.assert(
      fc.property(
        fc.tuple(whitespacePadding, validPlayerName, whitespacePadding),
        ([leading, name, trailing]) => {
          const padded = leading + name + trailing
          const result = validatePlayerName(padded)
          expect(result.valid).toBe(true)
          expect(result.error).toBeUndefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('rejects strings over 50 characters after trimming (from valid chars)', () => {
    fc.assert(
      fc.property(tooLongValidCharsName, (name) => {
        const result = validatePlayerName(name)
        expect(result.valid).toBe(false)
        expect(result.error).toBeDefined()
      }),
      { numRuns: 100 }
    )
  })

  it('rejects empty and whitespace-only strings', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 10 }).map(
          chars => chars.join('')
        ),
        (input) => {
          const result = validatePlayerName(input)
          expect(result.valid).toBe(false)
          expect(result.error).toBeDefined()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('classifies arbitrary strings correctly against the reference spec', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 100 }), (input) => {
        const trimmed = input.trim()
        const result = validatePlayerName(input)

        const shouldBeValid =
          trimmed.length >= 1 &&
          trimmed.length <= 50 &&
          ALLOWED_PATTERN.test(trimmed)

        if (shouldBeValid) {
          expect(result.valid).toBe(true)
          expect(result.error).toBeUndefined()
        } else {
          expect(result.valid).toBe(false)
          expect(result.error).toBeDefined()
        }
      }),
      { numRuns: 100 }
    )
  })
})


// Feature: user-profile-setup, Property 2: Player record construction produces correct insert payload
describe('Property 2: Player record construction produces correct insert payload', () => {
  /**
   * **Validates: Requirements 1.4, 2.2**
   *
   * For any valid player name (possibly with leading/trailing whitespace)
   * and any valid Auth UUID, the constructed player insert payload SHALL have
   * the player name trimmed, the auth_uuid set to the session's Auth UUID,
   * and all statistics fields set to zero.
   */

  /** Generate a valid player name with optional whitespace padding */
  const validPlayerNameWithPadding = fc
    .tuple(
      fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 5 }).map(c => c.join('')),
      validNonSpaceChar,
      fc.array(validChar, { minLength: 0, maxLength: 48 }),
      validNonSpaceChar,
      fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 5 }).map(c => c.join(''))
    )
    .map(([leadPad, first, middle, last, trailPad]) => leadPad + first + middle.join('') + last + trailPad)
    .filter(s => s.trim().length >= 1 && s.trim().length <= 50)

  /** Generate a random UUID v4 string */
  const uuidArbitrary = fc.uuid()

  const STATS_FIELDS = [
    'total_games_played',
    'total_games_won',
    'total_correct_answers',
    'total_incorrect_answers',
    'total_correct_daily_doubles',
    'total_incorrect_daily_doubles',
    'total_correct_final_jeopardies',
    'total_incorrect_final_jeopardies',
    'current_balance',
    'total_money_earned',
  ] as const

  it('trims the player name in the payload', () => {
    fc.assert(
      fc.property(validPlayerNameWithPadding, uuidArbitrary, (name, uuid) => {
        const payload = buildPlayerInsertPayload(name, uuid)
        expect(payload.player_name).toBe(name.trim())
      }),
      { numRuns: 100 }
    )
  })

  it('sets auth_uuid to the provided Auth UUID', () => {
    fc.assert(
      fc.property(validPlayerNameWithPadding, uuidArbitrary, (name, uuid) => {
        const payload = buildPlayerInsertPayload(name, uuid)
        expect(payload.auth_uuid).toBe(uuid)
      }),
      { numRuns: 100 }
    )
  })

  it('sets all 10 statistics fields to zero', () => {
    fc.assert(
      fc.property(validPlayerNameWithPadding, uuidArbitrary, (name, uuid) => {
        const payload = buildPlayerInsertPayload(name, uuid)
        for (const field of STATS_FIELDS) {
          expect(payload[field]).toBe(0)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('produces a payload with exactly 12 keys', () => {
    fc.assert(
      fc.property(validPlayerNameWithPadding, uuidArbitrary, (name, uuid) => {
        const payload = buildPlayerInsertPayload(name, uuid)
        const keys = Object.keys(payload)
        expect(keys).toHaveLength(12)
        expect(keys).toContain('player_name')
        expect(keys).toContain('auth_uuid')
        for (const field of STATS_FIELDS) {
          expect(keys).toContain(field)
        }
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Mock Helpers for Supabase Client ─────────────────────────────────────────

/**
 * Creates a mock Supabase client that records calls to .ilike() and
 * returns the specified data from .select().
 */
function createMockSupabaseClient(returnData: { id: number }[] = []) {
  const ilikeSpy = vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue({ data: returnData, error: null }),
  })

  const selectSpy = vi.fn().mockReturnValue({
    ilike: ilikeSpy,
  })

  const fromSpy = vi.fn().mockReturnValue({
    select: selectSpy,
  })

  const client = { from: fromSpy } as unknown as SupabaseClient

  return { client, fromSpy, selectSpy, ilikeSpy }
}

/**
 * Generate a random case variant of a string.
 * For each character, randomly choose to uppercase or lowercase it.
 */
function randomizeCasing(str: string, seed: number[]): string {
  return str
    .split('')
    .map((char, i) => {
      const shouldUpper = seed[i % seed.length] % 2 === 0
      return shouldUpper ? char.toUpperCase() : char.toLowerCase()
    })
    .join('')
}

// Feature: user-profile-setup, Property 3: Case-insensitive player name uniqueness
describe('Property 3: Case-insensitive player name uniqueness', () => {
  /**
   * **Validates: Requirements 1.6**
   *
   * For any two player name strings that are identical when compared
   * case-insensitively (i.e., `a.toLowerCase() === b.toLowerCase()`),
   * the duplicate check SHALL identify them as conflicting, regardless
   * of the specific casing used.
   */

  it('passes the trimmed name to .ilike() for case-insensitive matching', async () => {
    await fc.assert(
      fc.asyncProperty(validPlayerName, async (name) => {
        const { client, fromSpy, selectSpy, ilikeSpy } = createMockSupabaseClient([])

        await checkPlayerNameAvailable(name, client)

        expect(fromSpy).toHaveBeenCalledWith('players')
        expect(selectSpy).toHaveBeenCalledWith('id')
        expect(ilikeSpy).toHaveBeenCalledWith('player_name', name.trim())
      }),
      { numRuns: 100 }
    )
  })

  it('any two case variants of a name produce the same .ilike() argument (trimmed)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPlayerName,
        fc.array(fc.nat(), { minLength: 50, maxLength: 50 }),
        async (name, seed) => {
          const trimmed = name.trim()
          const variant = randomizeCasing(trimmed, seed)

          const mock1 = createMockSupabaseClient([])
          const mock2 = createMockSupabaseClient([])

          await checkPlayerNameAvailable(trimmed, mock1.client)
          await checkPlayerNameAvailable(variant, mock2.client)

          // Both should call .ilike() with values that are case-insensitively equal
          const arg1 = mock1.ilikeSpy.mock.calls[0][1] as string
          const arg2 = mock2.ilikeSpy.mock.calls[0][1] as string

          expect(arg1.toLowerCase()).toBe(arg2.toLowerCase())
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns false (not available) when .ilike() finds a matching record', async () => {
    await fc.assert(
      fc.asyncProperty(validPlayerName, async (name) => {
        const { client } = createMockSupabaseClient([{ id: 1 }])

        const result = await checkPlayerNameAvailable(name, client)

        expect(result).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('returns true (available) when .ilike() finds no matching records', async () => {
    await fc.assert(
      fc.asyncProperty(validPlayerName, async (name) => {
        const { client } = createMockSupabaseClient([])

        const result = await checkPlayerNameAvailable(name, client)

        expect(result).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})


// Feature: settings-menu, Property 3: Player name validation consistency
describe('Feature: settings-menu, Property 3: Player name validation consistency', () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   *
   * For any arbitrary string input, `validatePlayerName(input)` should return
   * `valid: true` if and only if the trimmed input has length between 1 and 50
   * (inclusive) and every character matches the pattern `[a-zA-Z0-9 _-]`.
   */

  /** The reference regex for validation */
  const ALLOWED_PATTERN = /^[a-zA-Z0-9 _-]+$/

  it('returns valid: true iff trimmed input is 1-50 chars of [a-zA-Z0-9 _-]', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const trimmed = input.trim()
        const result = validatePlayerName(input)

        const expectedValid =
          trimmed.length >= 1 &&
          trimmed.length <= 50 &&
          ALLOWED_PATTERN.test(trimmed)

        expect(result.valid).toBe(expectedValid)
      }),
      { numRuns: 100 }
    )
  })
})
