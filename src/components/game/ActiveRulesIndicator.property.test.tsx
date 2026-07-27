// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { render, cleanup } from '@testing-library/react'
import { ActiveRulesIndicator } from './ActiveRulesIndicator'
import { DEFAULT_TOGGLE_CONFIG } from '../../types/game'
import type { ToggleConfig } from '../../types/game'

// ─── Generators ───────────────────────────────────────────────────────────────

const toggleConfigArb: fc.Arbitrary<ToggleConfig> = fc.record({
  coop: fc.record({
    enabled: fc.boolean(),
    targetPercentage: fc.integer({ min: 50, max: 100 }),
  }),
  wagering: fc.record({
    enabled: fc.boolean(),
    wagerFloor: fc.integer({ min: 1, max: 10000 }),
  }),
  rulesEngine: fc.record({
    enabled: fc.boolean(),
    stealBonus: fc.record({
      enabled: fc.boolean(),
      bonusPoints: fc.integer({ min: 1, max: 5000 }),
    }),
    streakMultiplier: fc.record({
      enabled: fc.boolean(),
      threshold: fc.integer({ min: 2, max: 5 }),
      multiplier: fc.integer({ min: 2, max: 5 }),
    }),
    penaltyDoubler: fc.record({
      enabled: fc.boolean(),
    }),
  }),
  timedClues: fc.record({
    enabled: fc.boolean(),
    timerDuration: fc.integer({ min: 5, max: 120 }),
  }),
})

// ─── Property 18: Active rules summary lists exactly the active modifiers ─────

describe('Property 18: Active rules summary lists exactly the active modifiers with correct format', () => {
  /**
   * **Validates: Requirements 8.2**
   *
   * ActiveRulesIndicator renders nothing when all toggles are disabled,
   * and when active, displays labels in the correct format for each
   * enabled modifier.
   */

  it('renders nothing when all toggles are disabled', () => {
    cleanup()
    const { container } = render(
      <ActiveRulesIndicator config={DEFAULT_TOGGLE_CONFIG} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows correct label format for each active modifier', () => {
    fc.assert(
      fc.property(toggleConfigArb, (config) => {
        cleanup()
        const { container } = render(<ActiveRulesIndicator config={config} />)
        const textContent = container.textContent || ''

        // Co-op label
        if (config.coop.enabled) {
          expect(textContent).toContain(`Co-op: Target ${config.coop.targetPercentage}%`)
        } else {
          expect(textContent).not.toContain('Co-op:')
        }

        // Wagering label
        if (config.wagering.enabled) {
          expect(textContent).toContain(`Wagering: ${config.wagering.wagerFloor} pt min`)
        } else {
          expect(textContent).not.toContain('Wagering:')
        }

        // Steal Bonus label (requires rulesEngine.enabled AND stealBonus.enabled)
        if (config.rulesEngine.enabled && config.rulesEngine.stealBonus.enabled) {
          expect(textContent).toContain(`Steal Bonus: +${config.rulesEngine.stealBonus.bonusPoints} pts`)
        } else {
          expect(textContent).not.toContain('Steal Bonus:')
        }

        // Streak multiplier label (requires rulesEngine.enabled AND streakMultiplier.enabled)
        if (config.rulesEngine.enabled && config.rulesEngine.streakMultiplier.enabled) {
          expect(textContent).toContain(
            `Streak ×${config.rulesEngine.streakMultiplier.multiplier} at ${config.rulesEngine.streakMultiplier.threshold}`
          )
        } else {
          expect(textContent).not.toContain('Streak ×')
        }

        // Timed clues label
        if (config.timedClues.enabled) {
          expect(textContent).toContain(`Timed: ${config.timedClues.timerDuration}s`)
        } else {
          expect(textContent).not.toContain('Timed:')
        }
      }),
      { numRuns: 100 }
    )
  })

  it('renders nothing (empty DOM) when no toggles are active', () => {
    fc.assert(
      fc.property(toggleConfigArb, (config) => {
        // Force all toggles off
        const allDisabled: ToggleConfig = {
          coop: { ...config.coop, enabled: false },
          wagering: { ...config.wagering, enabled: false },
          rulesEngine: { ...config.rulesEngine, enabled: false },
          timedClues: { ...config.timedClues, enabled: false },
        }

        cleanup()
        const { container } = render(<ActiveRulesIndicator config={allDisabled} />)
        expect(container.innerHTML).toBe('')
      }),
      { numRuns: 50 }
    )
  })

  it('renders a visible strip when at least one toggle is active', () => {
    fc.assert(
      fc.property(
        toggleConfigArb.filter(config =>
          config.coop.enabled ||
          config.wagering.enabled ||
          (config.rulesEngine.enabled && (
            config.rulesEngine.stealBonus.enabled ||
            config.rulesEngine.streakMultiplier.enabled
          )) ||
          config.timedClues.enabled
        ),
        (config) => {
          cleanup()
          const { container } = render(<ActiveRulesIndicator config={config} />)
          const strip = container.querySelector('.active-rules-strip')
          expect(strip).not.toBeNull()
        }
      ),
      { numRuns: 50 }
    )
  })
})
