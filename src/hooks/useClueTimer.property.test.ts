// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { renderHook, act } from '@testing-library/react'
import { useClueTimer } from './useClueTimer'

// ─── Timer mocking ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Property 20: Timer display shows correct remaining whole seconds ─────────

describe('Property 20: Timer display shows correct remaining whole seconds', () => {
  /**
   * **Validates: Requirements 10.2**
   *
   * For any valid timer duration d in [5, 120], after t seconds have
   * elapsed (0 ≤ t ≤ d), the `remaining` value SHALL equal d - t.
   */

  it('remaining equals duration - elapsed for any valid duration and elapsed ticks', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 120 }),
        fc.integer({ min: 0, max: 120 }),
        (duration, ticksToAdvance) => {
          // Clamp elapsed ticks to not exceed duration
          const elapsed = Math.min(ticksToAdvance, duration)
          const onExpire = vi.fn()

          const { result } = renderHook(() =>
            useClueTimer({ enabled: true, duration, onExpire })
          )

          // Initially remaining should be duration
          expect(result.current.remaining).toBe(duration)

          // Advance the timer by `elapsed` seconds
          act(() => {
            vi.advanceTimersByTime(elapsed * 1000)
          })

          const expectedRemaining = Math.max(0, duration - elapsed)
          expect(result.current.remaining).toBe(expectedRemaining)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('remaining is always a non-negative whole number', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 60 }),
        fc.integer({ min: 0, max: 70 }),
        (duration, ticks) => {
          const onExpire = vi.fn()

          const { result } = renderHook(() =>
            useClueTimer({ enabled: true, duration, onExpire })
          )

          act(() => {
            vi.advanceTimersByTime(ticks * 1000)
          })

          expect(result.current.remaining).toBeGreaterThanOrEqual(0)
          expect(Number.isInteger(result.current.remaining)).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('onExpire is called exactly once when timer reaches 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 60 }), (duration) => {
        const onExpire = vi.fn()

        renderHook(() =>
          useClueTimer({ enabled: true, duration, onExpire })
        )

        // Advance past the full duration
        act(() => {
          vi.advanceTimersByTime((duration + 5) * 1000)
        })

        expect(onExpire).toHaveBeenCalledTimes(1)
      }),
      { numRuns: 30 }
    )
  })
})

// ─── Property 21: Returning to board always resets timer to configured duration ─

describe('Property 21: Returning to board always resets timer to configured duration', () => {
  /**
   * **Validates: Requirements 10.7**
   *
   * After calling `reset()`, `remaining` SHALL always equal the configured
   * `duration` and `isRunning` SHALL be false, regardless of how many seconds
   * elapsed before the reset.
   */

  it('reset() restores remaining to duration and sets isRunning to false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 120 }),
        fc.integer({ min: 1, max: 100 }),
        (duration, elapsed) => {
          const onExpire = vi.fn()

          const { result } = renderHook(() =>
            useClueTimer({ enabled: true, duration, onExpire })
          )

          // Advance some time
          const ticksToAdvance = Math.min(elapsed, duration - 1) // Don't let it expire
          act(() => {
            vi.advanceTimersByTime(ticksToAdvance * 1000)
          })

          // Verify time has elapsed
          expect(result.current.remaining).toBe(duration - ticksToAdvance)

          // Reset
          act(() => {
            result.current.reset()
          })

          // After reset: remaining should be duration, isRunning should be false
          expect(result.current.remaining).toBe(duration)
          expect(result.current.isRunning).toBe(false)
        }
      ),
      { numRuns: 50 }
    )
  })

  it('multiple reset cycles always return to full duration', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 60 }),
        fc.integer({ min: 1, max: 5 }),
        (duration, cycles) => {
          const onExpire = vi.fn()

          const { result } = renderHook(() =>
            useClueTimer({ enabled: true, duration, onExpire })
          )

          for (let i = 0; i < cycles; i++) {
            // Advance a bit
            act(() => {
              vi.advanceTimersByTime(2000)
            })

            // Reset
            act(() => {
              result.current.reset()
            })

            // Always back to full duration
            expect(result.current.remaining).toBe(duration)
            expect(result.current.isRunning).toBe(false)
          }
        }
      ),
      { numRuns: 30 }
    )
  })
})
