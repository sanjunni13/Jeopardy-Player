import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fc from 'fast-check'
import { readPreferences, PREFERENCES_KEY } from './preferencesStore'

// ─── localStorage Mock ──────────────────────────────────────────────────────

let store: Record<string, string>

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Helper Generators ──────────────────────────────────────────────────────

/**
 * Generate arbitrary values to use as `defaultRounds`:
 * floats, negatives, strings, null, undefined, integers out of range [1,5]
 */
const arbitraryDefaultRounds = fc.oneof(
  fc.float({ noDefaultInfinity: true, noNaN: true }),
  fc.integer({ min: -100, max: 100 }),
  fc.string(),
  fc.constant(null),
  fc.constant(undefined)
)

// Feature: settings-menu, Property 4: Default rounds bounds enforcement
describe('Property 4: Default rounds bounds enforcement', () => {
  /**
   * **Validates: Requirements 10.1, 10.4, 10.5**
   *
   * For any value stored as `defaultRounds` in the preferences JSON
   * (including floats, negative numbers, strings, null, values > 5,
   * and values < 1), `readPreferences` must return a `defaultRounds`
   * value that is an integer in the range [1, 5]. If the stored value
   * is outside this range or not an integer, the returned value must
   * be the default of 2.
   */

  it('always returns defaultRounds as an integer in [1, 5]', () => {
    fc.assert(
      fc.property(arbitraryDefaultRounds, (value) => {
        // Build a preferences object with the arbitrary defaultRounds value
        const prefsObj: Record<string, unknown> = {
          theme: 'dark',
          reducedAnimations: false,
          defaultRounds: value,
        }

        // JSON.stringify drops undefined values, so if value is undefined
        // the key won't be present — which should still produce default
        store[PREFERENCES_KEY] = JSON.stringify(prefsObj)

        const result = readPreferences()

        // In ALL cases: result.defaultRounds is an integer, >= 1, <= 5
        expect(Number.isInteger(result.defaultRounds)).toBe(true)
        expect(result.defaultRounds).toBeGreaterThanOrEqual(1)
        expect(result.defaultRounds).toBeLessThanOrEqual(5)
      }),
      { numRuns: 100 }
    )
  })

  it('returns default of 2 for invalid defaultRounds values', () => {
    fc.assert(
      fc.property(arbitraryDefaultRounds, (value) => {
        const prefsObj: Record<string, unknown> = {
          theme: 'dark',
          reducedAnimations: false,
          defaultRounds: value,
        }

        store[PREFERENCES_KEY] = JSON.stringify(prefsObj)

        const result = readPreferences()

        // Determine if the value is valid (integer in [1, 5])
        const isValidDefaultRounds =
          typeof value === 'number' &&
          Number.isInteger(value) &&
          value >= 1 &&
          value <= 5

        if (isValidDefaultRounds) {
          expect(result.defaultRounds).toBe(value)
        } else {
          expect(result.defaultRounds).toBe(2)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('returns default of 2 when defaultRounds key is missing from JSON', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('light', 'dark'),
        fc.boolean(),
        (theme, reducedAnimations) => {
          // Store preferences without a defaultRounds key at all
          const prefsObj = { theme, reducedAnimations }
          store[PREFERENCES_KEY] = JSON.stringify(prefsObj)

          const result = readPreferences()

          expect(result.defaultRounds).toBe(2)
          expect(Number.isInteger(result.defaultRounds)).toBe(true)
          expect(result.defaultRounds).toBeGreaterThanOrEqual(1)
          expect(result.defaultRounds).toBeLessThanOrEqual(5)
        }
      ),
      { numRuns: 100 }
    )
  })
})
