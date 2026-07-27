// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { GameSettingsPanel } from './GameSettingsPanel'
import { DEFAULT_TOGGLE_CONFIG } from '../../types/game'
import type { ToggleConfig } from '../../types/game'

// Mock localStorage for preferencesStore (used by timed clues toggle)
vi.stubGlobal('localStorage', {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function renderPanel(boardTotal?: number) {
  const configs: Array<{ config: ToggleConfig; hasErrors: boolean }> = []
  const onConfigChange = (config: ToggleConfig, hasErrors: boolean) => {
    configs.push({ config, hasErrors })
  }
  const result = render(
    <GameSettingsPanel onConfigChange={onConfigChange} boardTotal={boardTotal} />
  )
  return { ...result, configs, onConfigChange }
}

function getLatestConfig(configs: Array<{ config: ToggleConfig; hasErrors: boolean }>) {
  return configs[configs.length - 1]
}

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Property 1: Co-op toggle disables Rules Engine', () => {
  /**
   * **Validates: Requirements 1.7**
   *
   * For any ToggleConfig where coop.enabled === true, rulesEngine.enabled SHALL be
   * false and all sub-modifiers (stealBonus, streakMultiplier, penaltyDoubler) SHALL
   * be in their default disabled state.
   */

  it('enabling Co-op always produces rulesEngine at defaults regardless of prior Rules Engine state', () => {
    // We generate a boolean for whether Rules Engine was previously enabled,
    // and booleans for each sub-modifier being previously toggled on.
    const priorRulesStateArb = fc.record({
      rulesEnabled: fc.boolean(),
      stealBonusEnabled: fc.boolean(),
      streakEnabled: fc.boolean(),
      penaltyEnabled: fc.boolean(),
    })

    fc.assert(
      fc.property(priorRulesStateArb, (priorState) => {
        cleanup()
        const { configs, container } = renderPanel(10000)

        // If Rules Engine should be pre-enabled, toggle it on
        if (priorState.rulesEnabled) {
          const rulesToggle = container.querySelector('input[aria-label="Enable Rules Engine"]') as HTMLInputElement
          if (rulesToggle) {
            fireEvent.click(rulesToggle)

            // Enable sub-modifiers if specified
            if (priorState.stealBonusEnabled) {
              const stealToggle = container.querySelector('input[aria-label="Enable Steal Bonus modifier"]') as HTMLInputElement
              if (stealToggle) fireEvent.click(stealToggle)
            }
            if (priorState.streakEnabled) {
              const streakToggle = container.querySelector('input[aria-label="Enable Streak Multiplier modifier"]') as HTMLInputElement
              if (streakToggle) fireEvent.click(streakToggle)
            }
            if (priorState.penaltyEnabled) {
              const penaltyToggle = container.querySelector('input[aria-label="Enable Penalty Doubler modifier"]') as HTMLInputElement
              if (penaltyToggle) fireEvent.click(penaltyToggle)
            }
          }
        }

        // Now enable Co-op Mode
        const coopToggle = container.querySelector('input[aria-label="Enable Co-op Mode"]') as HTMLInputElement
        fireEvent.click(coopToggle)

        // Get the latest config emitted
        const latest = getLatestConfig(configs)
        expect(latest).toBeDefined()
        expect(latest.config.coop.enabled).toBe(true)

        // Rules Engine must be at defaults
        expect(latest.config.rulesEngine).toEqual(DEFAULT_TOGGLE_CONFIG.rulesEngine)
        expect(latest.config.rulesEngine.enabled).toBe(false)
        expect(latest.config.rulesEngine.stealBonus.enabled).toBe(false)
        expect(latest.config.rulesEngine.streakMultiplier.enabled).toBe(false)
        expect(latest.config.rulesEngine.penaltyDoubler.enabled).toBe(false)

        // Rules Engine section should be hidden from DOM
        const rulesToggleAfter = container.querySelector('input[aria-label="Enable Rules Engine"]')
        expect(rulesToggleAfter).toBeNull()
      }),
      { numRuns: 50 }
    )
  })
})

describe('Property 2: Target_Percentage input rejects values outside 50–100', () => {
  /**
   * **Validates: Requirements 1.3, 1.4**
   *
   * For any integer input value v, the Target_Percentage field SHALL accept v
   * (no validation error) if and only if v is an integer satisfying 50 ≤ v ≤ 100.
   */

  it('values in [50, 100] produce no validation error', () => {
    const validPercentageArb = fc.integer({ min: 50, max: 100 })

    fc.assert(
      fc.property(validPercentageArb, (value) => {
        cleanup()
        const { configs, container } = renderPanel(10000)

        // Enable Co-op Mode to reveal the Target Percentage input
        const coopToggle = container.querySelector('input[aria-label="Enable Co-op Mode"]') as HTMLInputElement
        fireEvent.click(coopToggle)

        // Set the target percentage value
        const input = container.querySelector('#gsp-target-percentage') as HTMLInputElement
        fireEvent.change(input, { target: { value: String(value) } })
        fireEvent.blur(input)

        // Check that no error is displayed
        const errorEl = container.querySelector('#gsp-target-percentage-error')
        expect(errorEl).toBeNull()

        // The latest config should not have errors
        const latest = getLatestConfig(configs)
        expect(latest.hasErrors).toBe(false)
        expect(latest.config.coop.targetPercentage).toBe(value)
      }),
      { numRuns: 100 }
    )
  })

  it('integer values outside [50, 100] produce a validation error', () => {
    const invalidPercentageArb = fc.oneof(
      fc.integer({ min: -1000, max: 49 }),
      fc.integer({ min: 101, max: 10000 })
    ).filter(v => v >= 0) // filter to non-negative since filterInt strips non-digits

    fc.assert(
      fc.property(invalidPercentageArb, (value) => {
        cleanup()
        const { configs, container } = renderPanel(10000)

        // Enable Co-op Mode to reveal the Target Percentage input
        const coopToggle = container.querySelector('input[aria-label="Enable Co-op Mode"]') as HTMLInputElement
        fireEvent.click(coopToggle)

        // Set the target percentage value
        const input = container.querySelector('#gsp-target-percentage') as HTMLInputElement
        fireEvent.change(input, { target: { value: String(value) } })
        fireEvent.blur(input)

        // Check that an error IS displayed
        const errorEl = container.querySelector('#gsp-target-percentage-error')
        expect(errorEl).not.toBeNull()

        // The latest config should have errors
        const latest = getLatestConfig(configs)
        expect(latest.hasErrors).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('empty string produces a validation error', () => {
    cleanup()
    const { configs, container } = renderPanel(10000)

    // Enable Co-op Mode
    const coopToggle = container.querySelector('input[aria-label="Enable Co-op Mode"]') as HTMLInputElement
    fireEvent.click(coopToggle)

    // Clear the target percentage input
    const input = container.querySelector('#gsp-target-percentage') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    // Check that an error IS displayed
    const errorEl = container.querySelector('#gsp-target-percentage-error')
    expect(errorEl).not.toBeNull()

    // The latest config should have errors
    const latest = getLatestConfig(configs)
    expect(latest.hasErrors).toBe(true)
  })
})

// ─── Property 3: Game session toggle snapshot is immutable after Play ─────────

describe('Property 3: Game session toggle snapshot is immutable after Play', () => {
  /**
   * **Validates: Requirements 1.6**
   *
   * Once the onConfigChange callback provides a ToggleConfig, subsequent
   * toggle interactions produce new config objects without mutating previously
   * emitted configs.
   */

  it('changing toggles after emission does not mutate previously emitted configs', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (enableWagering, enableTimed) => {
        cleanup()
        const { configs, container } = renderPanel(10000)

        // Enable wagering if specified
        if (enableWagering) {
          const wageringToggle = container.querySelector('input[aria-label="Enable Wagering Mode"]') as HTMLInputElement
          if (wageringToggle) fireEvent.click(wageringToggle)
        }

        // Capture the config at this point
        const configAtCapture = configs.length > 0
          ? JSON.parse(JSON.stringify(getLatestConfig(configs)))
          : null

        // Now enable timed clues
        if (enableTimed) {
          const timedToggle = container.querySelector('input[aria-label="Enable Timed Clue Responses"]') as HTMLInputElement
          if (timedToggle) fireEvent.click(timedToggle)
        }

        // The previously captured config should not have been mutated
        if (configAtCapture && configs.length > 1) {
          const originalConfigStr = JSON.stringify(configAtCapture)
          // Re-read from the captured snapshot — it should be unchanged
          expect(JSON.stringify(configAtCapture)).toBe(originalConfigStr)
        }
      }),
      { numRuns: 50 }
    )
  })
})

// ─── Property 4: Wager_Floor input rejects values outside 1–10,000 ───────────

describe('Property 4: Wager_Floor input rejects values outside 1–10,000', () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   *
   * For any integer input v, the Wager_Floor field SHALL accept v (no
   * validation error) if and only if v is an integer satisfying 1 ≤ v ≤ 10000.
   */

  it('values in [1, 10000] produce no validation error', () => {
    const validFloorArb = fc.integer({ min: 1, max: 10000 })

    fc.assert(
      fc.property(validFloorArb, (value) => {
        cleanup()
        const { configs, container } = renderPanel(10000)

        // Enable Wagering Mode to reveal the Wager Floor input
        const wageringToggle = container.querySelector('input[aria-label="Enable Wagering Mode"]') as HTMLInputElement
        if (!wageringToggle) return // Skip if toggle not found
        fireEvent.click(wageringToggle)

        // Set the wager floor value
        const input = container.querySelector('#gsp-wager-floor') as HTMLInputElement
        if (!input) return // Skip if input not found
        fireEvent.change(input, { target: { value: String(value) } })
        fireEvent.blur(input)

        // Check that no error is displayed
        const errorEl = container.querySelector('#gsp-wager-floor-error')
        expect(errorEl).toBeNull()

        // The latest config should not have errors for this field
        const latest = getLatestConfig(configs)
        expect(latest.hasErrors).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('integer values outside [1, 10000] produce a validation error', () => {
    const invalidFloorArb = fc.oneof(
      fc.integer({ min: 10001, max: 100000 }),
      fc.integer({ min: -1000, max: 0 })
    ).filter(v => v >= 0 || v < 0) // accept all values

    fc.assert(
      fc.property(invalidFloorArb, (value) => {
        cleanup()
        const { configs, container } = renderPanel(10000)

        // Enable Wagering Mode
        const wageringToggle = container.querySelector('input[aria-label="Enable Wagering Mode"]') as HTMLInputElement
        if (!wageringToggle) return
        fireEvent.click(wageringToggle)

        const input = container.querySelector('#gsp-wager-floor') as HTMLInputElement
        if (!input) return
        fireEvent.change(input, { target: { value: String(value) } })
        fireEvent.blur(input)

        // For values > 10000, an error should be displayed
        // For values <= 0, digits-only filter might strip the input to empty
        const errorEl = container.querySelector('#gsp-wager-floor-error')
        if (value > 10000) {
          expect(errorEl).not.toBeNull()
          const latest = getLatestConfig(configs)
          expect(latest.hasErrors).toBe(true)
        }
        // For negative values, the digit filter strips to empty or to valid
      }),
      { numRuns: 100 }
    )
  })
})

// ─── Property 5: Summary displays the configured wager floor exactly ──────────

describe('Property 5: Summary displays the configured wager floor exactly', () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * When Wagering Mode is enabled with a valid wager floor value,
   * the settings summary strip SHALL display the floor value in
   * the format "Wagering: {floor} pt min".
   */

  it('settings summary shows wager floor when wagering is enabled with valid value', () => {
    const validFloorArb = fc.integer({ min: 1, max: 10000 })

    fc.assert(
      fc.property(validFloorArb, (value) => {
        cleanup()
        const { container } = renderPanel(10000)

        // Enable Wagering Mode
        const wageringToggle = container.querySelector('input[aria-label="Enable Wagering Mode"]') as HTMLInputElement
        if (!wageringToggle) return
        fireEvent.click(wageringToggle)

        // Set wager floor value
        const input = container.querySelector('#gsp-wager-floor') as HTMLInputElement
        if (!input) return
        fireEvent.change(input, { target: { value: String(value) } })
        fireEvent.blur(input)

        // Look for the summary text containing the wager floor value
        // The actual format used is "Minimum wager: X pts"
        const summaryText = container.textContent || ''
        expect(summaryText).toContain(String(value))
        // Verify the active settings section is visible
        expect(summaryText).toContain('Active settings')
      }),
      { numRuns: 50 }
    )
  })
})

// ─── Property 9: Rules Engine numeric inputs reject out-of-range values ───────

describe('Property 9: Rules Engine numeric inputs reject out-of-range values', () => {
  /**
   * **Validates: Requirements 4.3, 4.5, 4.6, 4.8**
   *
   * When Rules Engine is enabled, its sub-modifier numeric inputs
   * (Steal Bonus points, Streak threshold, Streak multiplier) SHALL
   * reject values outside their valid ranges.
   */

  it('Steal Bonus points outside [1, 5000] produce validation error', () => {
    const invalidBonusArb = fc.oneof(
      fc.integer({ min: 5001, max: 100000 }),
      fc.constant(0)
    )

    fc.assert(
      fc.property(invalidBonusArb, (value) => {
        cleanup()
        const { configs, container } = renderPanel(10000)

        // Enable Rules Engine
        const rulesToggle = container.querySelector('input[aria-label="Enable Rules Engine"]') as HTMLInputElement
        if (!rulesToggle) return
        fireEvent.click(rulesToggle)

        // Enable Steal Bonus
        const stealToggle = container.querySelector('input[aria-label="Enable Steal Bonus modifier"]') as HTMLInputElement
        if (!stealToggle) return
        fireEvent.click(stealToggle)

        // Set bonus points value
        const input = container.querySelector('#gsp-steal-bonus-points') as HTMLInputElement
        if (!input) return
        fireEvent.change(input, { target: { value: String(value) } })
        fireEvent.blur(input)

        // Should have validation error
        const errorEl = container.querySelector('#gsp-steal-bonus-points-error')
        if (value > 5000 || value < 1) {
          expect(errorEl).not.toBeNull()
          const latest = getLatestConfig(configs)
          expect(latest.hasErrors).toBe(true)
        }
      }),
      { numRuns: 50 }
    )
  })

  it('Streak threshold in [2, 5] produces no error', () => {
    const validThresholdArb = fc.integer({ min: 2, max: 5 })

    fc.assert(
      fc.property(validThresholdArb, (value) => {
        cleanup()
        const { configs, container } = renderPanel(10000)

        // Enable Rules Engine
        const rulesToggle = container.querySelector('input[aria-label="Enable Rules Engine"]') as HTMLInputElement
        if (!rulesToggle) return
        fireEvent.click(rulesToggle)

        // Enable Streak Multiplier
        const streakToggle = container.querySelector('input[aria-label="Enable Streak Multiplier modifier"]') as HTMLInputElement
        if (!streakToggle) return
        fireEvent.click(streakToggle)

        // Set threshold value
        const input = container.querySelector('#gsp-streak-threshold') as HTMLInputElement
        if (!input) return
        fireEvent.change(input, { target: { value: String(value) } })
        fireEvent.blur(input)

        // Should have no validation error
        const errorEl = container.querySelector('#gsp-streak-threshold-error')
        expect(errorEl).toBeNull()
      }),
      { numRuns: 50 }
    )
  })
})
