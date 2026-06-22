// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuilderState } from './useBuilderState'
import { generateDefaultPointValues } from '../utils/builderFormStructure'

describe('useBuilderState structural actions', () => {
  // Helper to get a hook with a multi-round setup
  function setupMultiRound() {
    const { result } = renderHook(() => useBuilderState())
    // Start with 2 rounds, default 6 categories
    act(() => {
      result.current.setTotalRounds(2)
      result.current.setCategoriesPerRound(6)
    })
    return result
  }

  describe('addColumn', () => {
    it('appends a new category with correct row count and point values', () => {
      const { result } = renderHook(() => useBuilderState())
      act(() => {
        result.current.setCategoriesPerRound(3)
      })

      const roundBefore = result.current.formState.rounds[0]
      expect(roundBefore.categories).toHaveLength(3)

      act(() => {
        result.current.addColumn(0)
      })

      const round = result.current.formState.rounds[0]
      expect(round.categories).toHaveLength(4)

      const newCat = round.categories[3]
      expect(newCat.name).toBe('Category 4')
      expect(newCat.isDefaultName).toBe(true)
      expect(newCat.clues).toHaveLength(round.pointValues.length)

      // Each clue value matches the round's pointValues
      newCat.clues.forEach((clue, idx) => {
        expect(clue.value).toBe(String(round.pointValues[idx]))
        expect(clue.clue).toBe('')
        expect(clue.solution).toBe('')
        expect(clue.dailyDouble).toBe(false)
      })
    })

    it('only affects the specified round', () => {
      const result = setupMultiRound()
      const round1CatCount = result.current.formState.rounds[1].categories.length

      act(() => {
        result.current.addColumn(0)
      })

      expect(result.current.formState.rounds[1].categories).toHaveLength(round1CatCount)
    })
  })

  describe('addRow', () => {
    it('appends a row to all categories with correct point value', () => {
      const { result } = renderHook(() => useBuilderState())
      act(() => {
        result.current.setCategoriesPerRound(3)
      })

      const rowCountBefore = result.current.formState.rounds[0].pointValues.length
      expect(rowCountBefore).toBe(5)

      act(() => {
        result.current.addRow(0)
      })

      const round = result.current.formState.rounds[0]
      expect(round.pointValues).toHaveLength(6)
      // New point value = (newRowCount) * 200 * (roundIdx + 1)
      expect(round.pointValues[5]).toBe(6 * 200 * 1) // 1200

      // All categories have 6 clues
      round.categories.forEach(cat => {
        expect(cat.clues).toHaveLength(6)
        expect(cat.clues[5].value).toBe(String(1200))
        expect(cat.clues[5].clue).toBe('')
        expect(cat.clues[5].solution).toBe('')
      })
    })

    it('calculates point value correctly for round 2', () => {
      const result = setupMultiRound()

      act(() => {
        result.current.addRow(1)
      })

      const round = result.current.formState.rounds[1]
      // newRowCount = 6, roundNumber = 2, so new value = 6 * 200 * 2 = 2400
      expect(round.pointValues[5]).toBe(2400)
    })
  })

  describe('deleteCategory', () => {
    it('removes the category at given index', () => {
      const { result } = renderHook(() => useBuilderState())
      act(() => {
        result.current.setCategoriesPerRound(4)
      })

      act(() => {
        result.current.deleteCategory(0, 1)
      })

      expect(result.current.formState.rounds[0].categories).toHaveLength(3)
    })

    it('updates default names of remaining categories', () => {
      const { result } = renderHook(() => useBuilderState())
      act(() => {
        result.current.setCategoriesPerRound(4)
      })

      // Delete category at index 0 (was "Category 1")
      act(() => {
        result.current.deleteCategory(0, 0)
      })

      const cats = result.current.formState.rounds[0].categories
      expect(cats[0].name).toBe('Category 1')
      expect(cats[1].name).toBe('Category 2')
      expect(cats[2].name).toBe('Category 3')
    })

    it('preserves custom category names after deletion', () => {
      const { result } = renderHook(() => useBuilderState())
      act(() => {
        result.current.setCategoriesPerRound(4)
        result.current.setCategoryName(0, 2, 'Custom Cat')
      })

      // Delete category at index 0
      act(() => {
        result.current.deleteCategory(0, 0)
      })

      const cats = result.current.formState.rounds[0].categories
      // Custom cat was at idx 2, now at idx 1
      expect(cats[1].name).toBe('Custom Cat')
      expect(cats[1].isDefaultName).toBe(false)
    })
  })

  describe('swapCategories', () => {
    it('exchanges full content of two categories', () => {
      const { result } = renderHook(() => useBuilderState())
      act(() => {
        result.current.setCategoriesPerRound(3)
        result.current.setCategoryName(0, 0, 'History')
        result.current.setCategoryName(0, 2, 'Science')
      })

      act(() => {
        result.current.swapCategories(0, 0, 2)
      })

      const cats = result.current.formState.rounds[0].categories
      // Position 0 now has Science content
      expect(cats[0].name).toBe('Science')
      expect(cats[0].isDefaultName).toBe(false)
      // Position 2 now has History content
      expect(cats[2].name).toBe('History')
      expect(cats[2].isDefaultName).toBe(false)
    })

    it('updates default names after swap', () => {
      const { result } = renderHook(() => useBuilderState())
      act(() => {
        result.current.setCategoriesPerRound(3)
      })

      // All categories are default-named
      act(() => {
        result.current.swapCategories(0, 0, 2)
      })

      const cats = result.current.formState.rounds[0].categories
      // Default names should reflect new positions
      expect(cats[0].name).toBe('Category 1')
      expect(cats[1].name).toBe('Category 2')
      expect(cats[2].name).toBe('Category 3')
    })
  })

  describe('reorderCategories', () => {
    it('moves category from one position to another', () => {
      const { result } = renderHook(() => useBuilderState())
      act(() => {
        result.current.setCategoriesPerRound(4)
        result.current.setCategoryName(0, 0, 'First')
        result.current.setCategoryName(0, 3, 'Last')
      })

      // Move category from index 0 to index 3
      act(() => {
        result.current.reorderCategories(0, 0, 3)
      })

      const cats = result.current.formState.rounds[0].categories
      // "First" should be at position 3
      expect(cats[3].name).toBe('First')
      // "Last" shifted to position 2
      expect(cats[2].name).toBe('Last')
    })

    it('updates default names to reflect new positions', () => {
      const { result } = renderHook(() => useBuilderState())
      act(() => {
        result.current.setCategoriesPerRound(4)
      })

      act(() => {
        result.current.reorderCategories(0, 0, 3)
      })

      const cats = result.current.formState.rounds[0].categories
      cats.forEach((cat, idx) => {
        expect(cat.name).toBe(`Category ${idx + 1}`)
      })
    })
  })

  describe('updatePointValue', () => {
    it('updates pointValues array and all clue values at that row', () => {
      const { result } = renderHook(() => useBuilderState())
      act(() => {
        result.current.setCategoriesPerRound(3)
      })

      act(() => {
        result.current.updatePointValue(0, 2, 999)
      })

      const round = result.current.formState.rounds[0]
      expect(round.pointValues[2]).toBe(999)

      // All categories' clue at row 2 should have value "999"
      round.categories.forEach(cat => {
        expect(cat.clues[2].value).toBe('999')
      })
    })

    it('does not affect other rows', () => {
      const { result } = renderHook(() => useBuilderState())
      act(() => {
        result.current.setCategoriesPerRound(2)
      })

      const originalPointValues = [...result.current.formState.rounds[0].pointValues]

      act(() => {
        result.current.updatePointValue(0, 1, 777)
      })

      const round = result.current.formState.rounds[0]
      expect(round.pointValues[0]).toBe(originalPointValues[0])
      expect(round.pointValues[1]).toBe(777)
      expect(round.pointValues[2]).toBe(originalPointValues[2])
    })
  })

  describe('addRound', () => {
    it('appends a new round with 6 categories and 5 rows', () => {
      const { result } = renderHook(() => useBuilderState())

      act(() => {
        result.current.addRound()
      })

      expect(result.current.formState.rounds).toHaveLength(2)
      expect(result.current.formState.totalRounds).toBe(2)

      const newRound = result.current.formState.rounds[1]
      expect(newRound.categories).toHaveLength(6)
      expect(newRound.pointValues).toHaveLength(5)
    })

    it('scales point values to the new round position', () => {
      const { result } = renderHook(() => useBuilderState())

      act(() => {
        result.current.addRound()
      })

      const newRound = result.current.formState.rounds[1]
      // Round 2: multiplier = 2
      expect(newRound.pointValues).toEqual([400, 800, 1200, 1600, 2000])
    })

    it('gives all categories default names', () => {
      const { result } = renderHook(() => useBuilderState())

      act(() => {
        result.current.addRound()
      })

      const newRound = result.current.formState.rounds[1]
      newRound.categories.forEach((cat, idx) => {
        expect(cat.name).toBe(`Category ${idx + 1}`)
        expect(cat.isDefaultName).toBe(true)
      })
    })
  })

  describe('deleteRound', () => {
    it('removes the round at given index', () => {
      const result = setupMultiRound()

      act(() => {
        result.current.deleteRound(0)
      })

      expect(result.current.formState.rounds).toHaveLength(1)
      expect(result.current.formState.totalRounds).toBe(1)
    })

    it('recalculates point values for remaining rounds', () => {
      const result = setupMultiRound()
      // Round 0 has round 1 values, Round 1 has round 2 values
      // Delete round 0 → former round 1 becomes round 0 with round 1 values

      act(() => {
        result.current.deleteRound(0)
      })

      const remainingRound = result.current.formState.rounds[0]
      // Should now have round-1 point values
      expect(remainingRound.pointValues).toEqual(generateDefaultPointValues(1, 5))
    })

    it('preserves category content after recalculation', () => {
      const result = setupMultiRound()

      // Set a custom category name in round 1 (idx 1)
      act(() => {
        result.current.setCategoryName(1, 0, 'Preserved')
      })

      // Delete round 0 → round 1 becomes round 0
      act(() => {
        result.current.deleteRound(0)
      })

      expect(result.current.formState.rounds[0].categories[0].name).toBe('Preserved')
    })
  })

  describe('swapRounds', () => {
    it('exchanges content of two rounds', () => {
      const result = setupMultiRound()

      // Set custom name in round 0
      act(() => {
        result.current.setCategoryName(0, 0, 'Round1Cat')
        result.current.setCategoryName(1, 0, 'Round2Cat')
      })

      act(() => {
        result.current.swapRounds(0, 1)
      })

      // Content swapped: former round 1 content is now at position 0
      expect(result.current.formState.rounds[0].categories[0].name).toBe('Round2Cat')
      expect(result.current.formState.rounds[1].categories[0].name).toBe('Round1Cat')
    })

    it('recalculates point values for both rounds to match new positions', () => {
      const result = setupMultiRound()

      act(() => {
        result.current.swapRounds(0, 1)
      })

      // Round at position 0 should have round-1 values
      expect(result.current.formState.rounds[0].pointValues).toEqual(generateDefaultPointValues(1, 5))
      // Round at position 1 should have round-2 values
      expect(result.current.formState.rounds[1].pointValues).toEqual(generateDefaultPointValues(2, 5))
    })

    it('updates clue values to match recalculated point values', () => {
      const result = setupMultiRound()

      act(() => {
        result.current.swapRounds(0, 1)
      })

      const round0 = result.current.formState.rounds[0]
      round0.categories.forEach(cat => {
        cat.clues.forEach((clue, idx) => {
          expect(clue.value).toBe(String(round0.pointValues[idx]))
        })
      })
    })
  })
})
