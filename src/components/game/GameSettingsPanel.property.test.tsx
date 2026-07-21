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
