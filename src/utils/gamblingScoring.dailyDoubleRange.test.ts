import { describe, it, expect } from 'vitest'
import { DAILY_DOUBLE_WAGER_FLOOR, computeDailyDoubleWagerRange } from './gamblingScoring'

describe('computeDailyDoubleWagerRange', () => {
  it('exposes a $1,000 floor', () => {
    expect(DAILY_DOUBLE_WAGER_FLOOR).toBe(1000)
  })

  it('caps a deeply negative balance at the floor', () => {
    expect(computeDailyDoubleWagerRange(-5000)).toEqual({ min: 1, max: 1000 })
  })

  it('caps a balance of exactly $0 at the floor', () => {
    expect(computeDailyDoubleWagerRange(0)).toEqual({ min: 1, max: 1000 })
  })

  it('caps a small positive balance at the floor', () => {
    expect(computeDailyDoubleWagerRange(200)).toEqual({ min: 1, max: 1000 })
  })

  it('caps a balance above the floor at the balance', () => {
    expect(computeDailyDoubleWagerRange(7500)).toEqual({ min: 1, max: 7500 })
  })

  it('uses a minimum of $1, never $0', () => {
    expect(computeDailyDoubleWagerRange(-1).min).toBe(1)
    expect(computeDailyDoubleWagerRange(12345).min).toBe(1)
  })
})
