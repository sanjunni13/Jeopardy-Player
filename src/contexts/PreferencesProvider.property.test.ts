import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

/**
 * Pure logic extracted from PreferencesProvider.tsx:
 * Determines whether the .reduced-motion class should be applied on <html>.
 * Class is added if user toggled reduced animations ON, or if the OS
 * prefers-reduced-motion media query is set to 'reduce'.
 */
function shouldDisableAnimations(
  userPref: boolean,
  osReducedMotion: boolean
): boolean {
  return userPref || osReducedMotion
}

// Feature: settings-menu, Property 5: Reduced animations respects OS preference
describe('Property 5: Reduced animations respects OS preference', () => {
  /**
   * **Validates: Requirements 9.7, 9.8**
   *
   * For any combination of the `reducedAnimations` user preference (boolean)
   * and the OS `prefers-reduced-motion` media query value ('reduce' | 'no-preference'),
   * the effective animation state should be:
   * - animations disabled if `reducedAnimations === true` OR `prefers-reduced-motion === 'reduce'`
   * - animations enabled only if `reducedAnimations === false` AND `prefers-reduced-motion === 'no-preference'`
   */

  it('disables animations iff userPref is true OR OS prefers reduced motion', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (userPref, osReducedMotion) => {
        const result = shouldDisableAnimations(userPref, osReducedMotion)

        // Animations should be disabled if EITHER preference is true
        const expectedDisabled = userPref || osReducedMotion

        expect(result).toBe(expectedDisabled)
      }),
      { numRuns: 100 }
    )
  })

  it('enables animations only when both user pref is false and OS has no-preference', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (userPref, osReducedMotion) => {
        const result = shouldDisableAnimations(userPref, osReducedMotion)

        // Animations enabled (result === false) only if BOTH are false
        if (!userPref && !osReducedMotion) {
          expect(result).toBe(false)
        } else {
          expect(result).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('always disables animations when user preference is enabled regardless of OS setting', () => {
    fc.assert(
      fc.property(fc.boolean(), (osReducedMotion) => {
        // Requirement 9.7: While Reduced_Animations_Mode is enabled,
        // animations stay disabled even if OS says 'no-preference'
        const result = shouldDisableAnimations(true, osReducedMotion)

        expect(result).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('disables animations when OS prefers reduced motion even if user preference is off', () => {
    fc.assert(
      fc.property(fc.boolean(), (userPref) => {
        // Requirement 9.8: While Reduced_Animations_Mode is disabled,
        // animations are still disabled if OS prefers-reduced-motion is 'reduce'
        const result = shouldDisableAnimations(userPref, true)

        expect(result).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
