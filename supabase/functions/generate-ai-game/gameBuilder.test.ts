import { describe, it, expect } from 'vitest'
import {
  getPointValue,
  placeDailyDoubles,
  buildGame,
  BASE_VALUES,
  ROUND_NAMES,
} from './gameBuilder'
import type { GeminiCategory, GeminiFinal } from './gameBuilder'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGeminiCategory(name: string): GeminiCategory {
  return {
    name,
    clues: Array.from({ length: 5 }, (_, i) => ({
      clue: `Clue ${i + 1} for ${name}`,
      solution: `What is solution ${i + 1}?`,
    })),
  }
}

function makeGeminiFinal(): GeminiFinal {
  return {
    category: 'Final Category',
    clue: 'This is the final clue',
    solution: 'What is the final answer?',
  }
}

/** Deterministic random for tests (simple LCG) */
function createSeededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32
    return (s >>> 0) / 2 ** 32
  }
}

// ─── getPointValue ────────────────────────────────────────────────────────────

describe('getPointValue', () => {
  it('returns correct values for round 1 (single)', () => {
    expect(getPointValue(0, 1)).toBe(200)
    expect(getPointValue(1, 1)).toBe(400)
    expect(getPointValue(2, 1)).toBe(600)
    expect(getPointValue(3, 1)).toBe(800)
    expect(getPointValue(4, 1)).toBe(1000)
  })

  it('returns correct values for round 2 (double)', () => {
    expect(getPointValue(0, 2)).toBe(400)
    expect(getPointValue(1, 2)).toBe(800)
    expect(getPointValue(2, 2)).toBe(1200)
    expect(getPointValue(3, 2)).toBe(1600)
    expect(getPointValue(4, 2)).toBe(2000)
  })

  it('returns correct values for round 6 (sextuple)', () => {
    expect(getPointValue(0, 6)).toBe(1200)
    expect(getPointValue(1, 6)).toBe(2400)
    expect(getPointValue(2, 6)).toBe(3600)
    expect(getPointValue(3, 6)).toBe(4800)
    expect(getPointValue(4, 6)).toBe(6000)
  })
})

// ─── placeDailyDoubles ────────────────────────────────────────────────────────

describe('placeDailyDoubles', () => {
  it('returns empty array when dailyDoublesPerRound is 0', () => {
    const result = placeDailyDoubles(4, 5, 0)
    expect(result).toEqual([])
  })

  it('returns the correct number of positions', () => {
    const random = createSeededRandom(42)
    const result = placeDailyDoubles(4, 5, 3, random)
    expect(result).toHaveLength(3)
  })

  it('distributes across different categories when possible', () => {
    const random = createSeededRandom(123)
    const result = placeDailyDoubles(4, 5, 4, random)
    expect(result).toHaveLength(4)
    // All 4 categories should be used since dailyDoublesPerRound === categoriesPerRound
    const categories = new Set(result.map(p => p.categoryIndex))
    expect(categories.size).toBe(4)
  })

  it('wraps when dailyDoublesPerRound > categoriesPerRound', () => {
    const random = createSeededRandom(99)
    // 3 categories, 5 daily doubles -> some categories get 2
    const result = placeDailyDoubles(3, 5, 5, random)
    expect(result).toHaveLength(5)
    // Max per category: ceil(5/3) = 2
    const countByCategory: Record<number, number> = {}
    for (const pos of result) {
      countByCategory[pos.categoryIndex] = (countByCategory[pos.categoryIndex] || 0) + 1
    }
    for (const count of Object.values(countByCategory)) {
      expect(count).toBeLessThanOrEqual(2)
    }
  })

  it('no category exceeds ceil(dailyDoublesPerRound / categoriesPerRound)', () => {
    const random = createSeededRandom(7)
    const categoriesPerRound = 2
    const dailyDoublesPerRound = 2
    const maxPerCategory = Math.ceil(dailyDoublesPerRound / categoriesPerRound)
    const result = placeDailyDoubles(categoriesPerRound, 5, dailyDoublesPerRound, random)
    expect(result).toHaveLength(dailyDoublesPerRound)
    const countByCategory: Record<number, number> = {}
    for (const pos of result) {
      countByCategory[pos.categoryIndex] = (countByCategory[pos.categoryIndex] || 0) + 1
    }
    for (const count of Object.values(countByCategory)) {
      expect(count).toBeLessThanOrEqual(maxPerCategory)
    }
  })

  it('positions have valid indices', () => {
    const random = createSeededRandom(55)
    const result = placeDailyDoubles(6, 5, 6, random)
    for (const pos of result) {
      expect(pos.categoryIndex).toBeGreaterThanOrEqual(0)
      expect(pos.categoryIndex).toBeLessThan(6)
      expect(pos.clueIndex).toBeGreaterThanOrEqual(0)
      expect(pos.clueIndex).toBeLessThan(5)
    }
  })
})

// ─── buildGame ────────────────────────────────────────────────────────────────

describe('buildGame', () => {
  it('builds a game with correct round keys', () => {
    const categories = Array.from({ length: 6 }, (_, i) => makeGeminiCategory(`Cat ${i + 1}`))
    const game = buildGame(
      { rounds: 2, categoriesPerRound: 3, dailyDoublesPerRound: 1 },
      categories,
      makeGeminiFinal(),
      createSeededRandom(1)
    )

    expect(Object.keys(game.rounds)).toEqual(['single', 'double'])
    expect(game.rounds.single).toHaveLength(3)
    expect(game.rounds.double).toHaveLength(3)
  })

  it('assigns correct point values per round', () => {
    const categories = Array.from({ length: 4 }, (_, i) => makeGeminiCategory(`Cat ${i + 1}`))
    const game = buildGame(
      { rounds: 2, categoriesPerRound: 2, dailyDoublesPerRound: 0 },
      categories,
      makeGeminiFinal(),
      createSeededRandom(1)
    )

    // Round 1 (single): 200, 400, 600, 800, 1000
    for (const category of game.rounds.single) {
      expect(category.clues.map(c => c.value)).toEqual([200, 400, 600, 800, 1000])
    }

    // Round 2 (double): 400, 800, 1200, 1600, 2000
    for (const category of game.rounds.double) {
      expect(category.clues.map(c => c.value)).toEqual([400, 800, 1200, 1600, 2000])
    }
  })

  it('sets html to false on all clues', () => {
    const categories = Array.from({ length: 3 }, (_, i) => makeGeminiCategory(`Cat ${i + 1}`))
    const game = buildGame(
      { rounds: 1, categoriesPerRound: 3, dailyDoublesPerRound: 0 },
      categories,
      makeGeminiFinal(),
      createSeededRandom(1)
    )

    for (const roundCategories of Object.values(game.rounds)) {
      for (const category of roundCategories as Array<{ clues: Array<{ html: boolean }> }>) {
        for (const clue of category.clues) {
          expect(clue.html).toBe(false)
        }
      }
    }
  })

  it('sets html to false on final round', () => {
    const categories = [makeGeminiCategory('Cat 1')]
    const game = buildGame(
      { rounds: 1, categoriesPerRound: 1, dailyDoublesPerRound: 0 },
      categories,
      makeGeminiFinal(),
      createSeededRandom(1)
    )

    expect(game.final.html).toBe(false)
  })

  it('sets totalRounds correctly', () => {
    const categories = Array.from({ length: 12 }, (_, i) => makeGeminiCategory(`Cat ${i + 1}`))
    const game = buildGame(
      { rounds: 4, categoriesPerRound: 3, dailyDoublesPerRound: 0 },
      categories,
      makeGeminiFinal(),
      createSeededRandom(1)
    )

    expect(game.totalRounds).toBe(4)
  })

  it('places daily doubles in each round', () => {
    const categories = Array.from({ length: 6 }, (_, i) => makeGeminiCategory(`Cat ${i + 1}`))
    const game = buildGame(
      { rounds: 2, categoriesPerRound: 3, dailyDoublesPerRound: 2 },
      categories,
      makeGeminiFinal(),
      createSeededRandom(42)
    )

    for (const roundCategories of Object.values(game.rounds)) {
      const dailyDoubleCount = (roundCategories as Array<{ clues: Array<{ dailyDouble: boolean }> }>)
        .flatMap(cat => cat.clues)
        .filter(clue => clue.dailyDouble).length
      expect(dailyDoubleCount).toBe(2)
    }
  })

  it('preserves clue content from Gemini', () => {
    const categories = [makeGeminiCategory('Science')]
    const game = buildGame(
      { rounds: 1, categoriesPerRound: 1, dailyDoublesPerRound: 0 },
      categories,
      makeGeminiFinal(),
      createSeededRandom(1)
    )

    expect(game.rounds.single[0].category).toBe('Science')
    expect(game.rounds.single[0].clues[0].clue).toBe('Clue 1 for Science')
    expect(game.rounds.single[0].clues[0].solution).toBe('What is solution 1?')
  })

  it('preserves final round content from Gemini', () => {
    const categories = [makeGeminiCategory('Science')]
    const game = buildGame(
      { rounds: 1, categoriesPerRound: 1, dailyDoublesPerRound: 0 },
      categories,
      makeGeminiFinal(),
      createSeededRandom(1)
    )

    expect(game.final.category).toBe('Final Category')
    expect(game.final.clue).toBe('This is the final clue')
    expect(game.final.solution).toBe('What is the final answer?')
  })
})
