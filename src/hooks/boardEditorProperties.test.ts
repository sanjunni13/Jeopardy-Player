// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import fc from 'fast-check'
import { useBuilderState } from './useBuilderState'
import { generateDefaultPointValues } from '../utils/builderFormStructure'

// Feature: board-style-game-editor, Property 3: Custom category names never modified

describe('Property 3: Custom category names are never modified by structural operations', () => {
  /**
   * **Validates: Requirements 2.5, 3.4, 3.6**
   *
   * For any category with `isDefaultName: false` and any structural operation
   * (reorder, swap, add column, delete column), the category's name SHALL remain
   * exactly as set by the user regardless of its new position.
   */

  // ─── Generators ─────────────────────────────────────────────────────────────

  // Generate a custom category name (non-empty, distinct from default pattern)
  const customNameArb = fc.string({ minLength: 1, maxLength: 30 })
    .filter(s => s.trim().length > 0 && !s.match(/^Category \d+$/))

  // Generate initial category count (at least 3 so we have room for operations)
  const categoryCountArb = fc.integer({ min: 3, max: 8 })

  // Generate indices for which categories to set custom names
  function _customIndicesArb(catCount: number) {
    return fc.uniqueArray(fc.integer({ min: 0, max: catCount - 1 }), {
      minLength: 1,
      maxLength: Math.min(catCount, 4),
    })
  }

  // Structural operation types that don't destroy custom-named categories
  type StructuralOp =
    | { type: 'addColumn' }
    | { type: 'reorder'; fromIdx: number; toIdx: number }
    | { type: 'swap'; idxA: number; idxB: number }
    | { type: 'deleteOther'; idx: number }

  // Generate a valid structural operation given the current category count and
  // which indices have custom names (to avoid deleting a custom-named category)
  function _structuralOpArb(catCount: number, customIndices: number[]): fc.Arbitrary<StructuralOp> {
    const ops: fc.Arbitrary<StructuralOp>[] = [
      // addColumn is always valid
      fc.constant({ type: 'addColumn' as const }),
      // reorder: any two distinct indices in current range
      fc.tuple(
        fc.integer({ min: 0, max: catCount - 1 }),
        fc.integer({ min: 0, max: catCount - 1 })
      ).filter(([a, b]) => a !== b)
        .map(([fromIdx, toIdx]) => ({ type: 'reorder' as const, fromIdx, toIdx })),
      // swap: any two distinct indices
      fc.tuple(
        fc.integer({ min: 0, max: catCount - 1 }),
        fc.integer({ min: 0, max: catCount - 1 })
      ).filter(([a, b]) => a !== b)
        .map(([idxA, idxB]) => ({ type: 'swap' as const, idxA, idxB })),
    ]

    // deleteOther: only valid if there's a non-custom index to delete AND catCount > 1
    const nonCustomIndices = Array.from({ length: catCount }, (_, i) => i)
      .filter(i => !customIndices.includes(i))
    if (nonCustomIndices.length > 0 && catCount > 1) {
      ops.push(
        fc.constantFrom(...nonCustomIndices)
          .map(idx => ({ type: 'deleteOther' as const, idx }))
      )
    }

    return fc.oneof(...ops)
  }

  it('custom category names remain unchanged after a single structural operation', () => {
    fc.assert(
      fc.property(
        categoryCountArb,
        fc.func(customNameArb), // generates unique custom names
        fc.integer({ min: 0, max: 99 }), // seed for operation selection
        (catCount, nameFn, _opSeed) => {
          const { result } = renderHook(() => useBuilderState())

          // Setup: create a board with catCount categories
          act(() => {
            result.current.setCategoriesPerRound(catCount)
          })

          // Pick 1..min(catCount,4) categories to give custom names
          const customIndexCount = Math.min(catCount, Math.max(1, (catCount % 3) + 1))
          const customIndices: number[] = []
          for (let i = 0; i < customIndexCount && i < catCount; i++) {
            customIndices.push(i * Math.max(1, Math.floor(catCount / customIndexCount)))
          }
          // Deduplicate and limit to valid range
          const uniqueCustomIndices = [...new Set(customIndices)].filter(i => i < catCount)

          // Set custom names and record them
          const customNames: Map<number, string> = new Map()
          act(() => {
            uniqueCustomIndices.forEach((idx, i) => {
              const name = `Custom_${i}_${nameFn(fc.stringify(i))?.slice(0, 10) || 'name'}`
              result.current.setCategoryName(0, idx, name)
              customNames.set(idx, name)
            })
          })

          // Verify custom names were set
          for (const [idx, name] of customNames) {
            expect(result.current.formState.rounds[0].categories[idx].name).toBe(name)
            expect(result.current.formState.rounds[0].categories[idx].isDefaultName).toBe(false)
          }

          // Record all custom names before operation (by content identity)
          const customNameSet = new Set(customNames.values())

          // Apply a random structural operation
          const currentCatCount = result.current.formState.rounds[0].categories.length
          const nonCustomIndicesArr = Array.from({ length: currentCatCount }, (_, i) => i)
            .filter(i => !uniqueCustomIndices.includes(i))

          // Pick an operation type based on seed
          const opTypes = ['addColumn', 'reorder', 'swap', 'deleteOther']
          const opType = opTypes[Math.abs(_opSeed) % opTypes.length]

          act(() => {
            switch (opType) {
              case 'addColumn':
                result.current.addColumn(0)
                break
              case 'reorder': {
                const from = Math.abs(_opSeed) % currentCatCount
                const to = (from + 1) % currentCatCount
                result.current.reorderCategories(0, from, to)
                break
              }
              case 'swap': {
                const a = Math.abs(_opSeed) % currentCatCount
                const b = (a + 1) % currentCatCount
                result.current.swapCategories(0, a, b)
                break
              }
              case 'deleteOther': {
                if (nonCustomIndicesArr.length > 0 && currentCatCount > 1) {
                  const deleteIdx = nonCustomIndicesArr[Math.abs(_opSeed) % nonCustomIndicesArr.length]
                  result.current.deleteCategory(0, deleteIdx)
                } else {
                  // Fallback: just add a column
                  result.current.addColumn(0)
                }
                break
              }
            }
          })

          // After operation: find all categories with isDefaultName: false
          // and verify their names are in the original custom name set
          const categoriesAfter = result.current.formState.rounds[0].categories
          const customCatsAfter = categoriesAfter.filter(cat => !cat.isDefaultName)

          // Every custom-named category should still have its original name
          for (const cat of customCatsAfter) {
            expect(customNameSet.has(cat.name)).toBe(true)
          }

          // The number of custom-named categories should be unchanged
          // (unless we deleted a custom one, which we avoid)
          expect(customCatsAfter.length).toBe(uniqueCustomIndices.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('custom category names survive a sequence of multiple structural operations', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 6 }), // initial category count
        fc.array(customNameArb, { minLength: 1, maxLength: 3 }), // custom names to assign
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 2, maxLength: 5 }), // operation sequence
        (catCount, customNamesArr, opSequence) => {
          const { result } = renderHook(() => useBuilderState())

          // Setup board
          act(() => {
            result.current.setCategoriesPerRound(catCount)
          })

          // Assign custom names to the first N categories (where N = customNamesArr.length)
          const assignCount = Math.min(customNamesArr.length, catCount - 1) // keep at least one default
          const customNameRecord: Record<string, true> = {}

          act(() => {
            for (let i = 0; i < assignCount; i++) {
              result.current.setCategoryName(0, i, customNamesArr[i])
              customNameRecord[customNamesArr[i]] = true
            }
          })

          // Record all custom names as a set
          const expectedCustomNames = new Set(customNamesArr.slice(0, assignCount))

          // Apply a sequence of structural operations
          for (const opCode of opSequence) {
            const cats = result.current.formState.rounds[0].categories
            const currentCount = cats.length
            if (currentCount < 2) break // safety

            const _customIdx = cats.map((c, i) => ({ c, i })).filter(x => !x.c.isDefaultName).map(x => x.i)
            const defaultIdx = cats.map((c, i) => ({ c, i })).filter(x => x.c.isDefaultName).map(x => x.i)

            act(() => {
              switch (opCode % 4) {
                case 0: // addColumn
                  result.current.addColumn(0)
                  break
                case 1: // reorder
                  if (currentCount >= 2) {
                    result.current.reorderCategories(0, 0, currentCount - 1)
                  }
                  break
                case 2: // swap
                  if (currentCount >= 2) {
                    result.current.swapCategories(0, 0, currentCount - 1)
                  }
                  break
                case 3: // delete a default-named category (not a custom one)
                  if (defaultIdx.length > 0 && currentCount > 2) {
                    result.current.deleteCategory(0, defaultIdx[0])
                  } else {
                    result.current.addColumn(0)
                  }
                  break
              }
            })
          }

          // After all operations: verify all custom-named categories still have their original names
          const finalCats = result.current.formState.rounds[0].categories
          const customCatsAfter = finalCats.filter(cat => !cat.isDefaultName)

          // Every remaining custom category name must be one of the original custom names
          for (const cat of customCatsAfter) {
            expect(expectedCustomNames.has(cat.name)).toBe(true)
          }

          // All original custom names should still exist somewhere in the board
          for (const name of expectedCustomNames) {
            const found = finalCats.some(cat => cat.name === name && !cat.isDefaultName)
            expect(found).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})


// Feature: board-style-game-editor, Property 6: Add column produces correctly structured category
describe('Property 6: Add column produces correctly structured category', () => {
  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * For any board state with C categories and R rows in round N, adding a new column
   * SHALL result in C+1 categories where the new category has exactly R clues,
   * each with empty text fields, point values matching the corresponding row's value,
   * `isDefaultName: true`, and name `"Category {C+1}"`.
   */

  const categoriesArb = fc.integer({ min: 1, max: 6 })

  it('adding a column produces C+1 categories with correctly structured new category', () => {
    fc.assert(
      fc.property(categoriesArb, (numCategories) => {
        const { result } = renderHook(() => useBuilderState())

        // Set up initial board with the random number of categories
        act(() => {
          result.current.setCategoriesPerRound(numCategories)
        })

        const roundIdx = 0
        const roundBefore = result.current.formState.rounds[roundIdx]
        const C = roundBefore.categories.length
        const R = roundBefore.pointValues.length

        // Add a column
        act(() => {
          result.current.addColumn(roundIdx)
        })

        const roundAfter = result.current.formState.rounds[roundIdx]

        // 1. Round has C+1 categories
        expect(roundAfter.categories.length).toBe(C + 1)

        // 2. New category (at index C) has isDefaultName === true and name === "Category {C+1}"
        const newCategory = roundAfter.categories[C]
        expect(newCategory.isDefaultName).toBe(true)
        expect(newCategory.name).toBe(`Category ${C + 1}`)

        // 3. New category has exactly R clues
        expect(newCategory.clues.length).toBe(R)

        // 4. Each clue has correct point value and empty text fields
        for (let rowIdx = 0; rowIdx < R; rowIdx++) {
          const clue = newCategory.clues[rowIdx]
          expect(clue.value).toBe(String(roundAfter.pointValues[rowIdx]))
          expect(clue.clue).toBe('')
          expect(clue.solution).toBe('')
          expect(clue.dailyDouble).toBe(false)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('adding a column after adding rows includes the extra rows in the new column', () => {
    fc.assert(
      fc.property(categoriesArb, (numCategories) => {
        const { result } = renderHook(() => useBuilderState())

        // Set up initial board
        act(() => {
          result.current.setCategoriesPerRound(numCategories)
        })

        // Add a row first to increase R
        act(() => {
          result.current.addRow(0)
        })

        const roundIdx = 0
        const roundBefore = result.current.formState.rounds[roundIdx]
        const C = roundBefore.categories.length
        const R = roundBefore.pointValues.length

        // Now add a column — new column should reflect the extra row
        act(() => {
          result.current.addColumn(roundIdx)
        })

        const roundAfter = result.current.formState.rounds[roundIdx]

        // C+1 categories
        expect(roundAfter.categories.length).toBe(C + 1)

        // New category has exactly R clues (including the added row)
        const newCategory = roundAfter.categories[C]
        expect(newCategory.isDefaultName).toBe(true)
        expect(newCategory.name).toBe(`Category ${C + 1}`)
        expect(newCategory.clues.length).toBe(R)

        // Each clue matches point values
        for (let rowIdx = 0; rowIdx < R; rowIdx++) {
          const clue = newCategory.clues[rowIdx]
          expect(clue.value).toBe(String(roundAfter.pointValues[rowIdx]))
          expect(clue.clue).toBe('')
          expect(clue.solution).toBe('')
          expect(clue.dailyDouble).toBe(false)
        }
      }),
      { numRuns: 100 }
    )
  })
})


// Feature: board-style-game-editor, Property 7: Add row extends all categories uniformly
describe('Property 7: Add row extends all categories uniformly', () => {
  /**
   * **Validates: Requirements 6.5, 6.6**
   *
   * For any board state with C categories and R rows in round N, adding a new row
   * SHALL result in R+1 rows where every category has exactly one additional empty clue,
   * and the new row's point value equals `(R+1) * 200 * N`.
   */

  // Generator for initial category count (1-6)
  const categoriesArb = fc.integer({ min: 1, max: 6 })

  // Generator for number of extra rows to add before testing (0-3)
  const extraRowsArb = fc.integer({ min: 0, max: 3 })

  // Generator for round index (0-based, up to 5 rounds)
  const roundIdxArb = fc.integer({ min: 0, max: 5 })

  it('adding a row results in R+1 rows with correct point value and empty clues for every category', () => {
    fc.assert(
      fc.property(
        categoriesArb,
        extraRowsArb,
        roundIdxArb,
        (numCategories, extraRows, roundIdx) => {
          const { result } = renderHook(() => useBuilderState())

          // Set up initial board with the specified number of categories
          act(() => {
            result.current.setCategoriesPerRound(numCategories)
          })

          // Add extra rounds if needed to reach the desired roundIdx
          if (roundIdx > 0) {
            act(() => {
              for (let i = 0; i < roundIdx; i++) {
                result.current.addRound()
              }
            })
          }

          // Add some extra rows first to vary the row count
          if (extraRows > 0) {
            act(() => {
              for (let i = 0; i < extraRows; i++) {
                result.current.addRow(roundIdx)
              }
            })
          }

          // Capture state before adding the test row
          const roundBefore = result.current.formState.rounds[roundIdx]
          const R = roundBefore.pointValues.length
          const C = roundBefore.categories.length
          const roundNumber = roundIdx + 1

          // Deep copy existing clues to compare later
          const existingClues = roundBefore.categories.map(cat =>
            cat.clues.map(clue => ({ ...clue }))
          )

          // Add a new row
          act(() => {
            result.current.addRow(roundIdx)
          })

          const roundAfter = result.current.formState.rounds[roundIdx]

          // 1. pointValues.length === R + 1
          expect(roundAfter.pointValues.length).toBe(R + 1)

          // 2. New point value equals (R+1) * 200 * roundNumber
          const expectedPointValue = (R + 1) * 200 * roundNumber
          expect(roundAfter.pointValues[R]).toBe(expectedPointValue)

          // 3. Every category has exactly R+1 clues
          for (let catIdx = 0; catIdx < C; catIdx++) {
            expect(roundAfter.categories[catIdx].clues.length).toBe(R + 1)
          }

          // 4. The new clue (last) for each category has correct structure
          for (let catIdx = 0; catIdx < C; catIdx++) {
            const newClue = roundAfter.categories[catIdx].clues[R]
            expect(newClue.value).toBe(String(expectedPointValue))
            expect(newClue.clue).toBe('')
            expect(newClue.solution).toBe('')
            expect(newClue.dailyDouble).toBe(false)
          }

          // 5. Existing clues are unchanged
          for (let catIdx = 0; catIdx < C; catIdx++) {
            for (let clueIdx = 0; clueIdx < R; clueIdx++) {
              const before = existingClues[catIdx][clueIdx]
              const after = roundAfter.categories[catIdx].clues[clueIdx]
              expect(after.value).toBe(before.value)
              expect(after.clue).toBe(before.clue)
              expect(after.solution).toBe(before.solution)
              expect(after.dailyDouble).toBe(before.dailyDouble)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})


// Feature: board-style-game-editor, Property 10: Delete category preserves remaining data
describe('Property 10: Delete category preserves remaining categories\' data', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * For any board with C > 1 categories and any valid deletion index I, the resulting
   * board SHALL have C-1 categories where every category that was not at index I retains
   * its full content (clue text, solutions, media, custom names) unmodified.
   */

  // ─── Generators ─────────────────────────────────────────────────────────────

  // Category count: 3–8 so we always have C > 1 after deletion
  const categoryCountArb = fc.integer({ min: 3, max: 8 })

  it('deleting a category preserves all remaining categories\' content', () => {
    fc.assert(
      fc.property(
        categoryCountArb,
        fc.integer({ min: 0, max: 100 }), // used to derive deletion index
        (catCount, deletionSeed) => {
          const { result } = renderHook(() => useBuilderState())

          // Setup: create board with catCount categories
          act(() => {
            result.current.setCategoriesPerRound(catCount)
          })

          // Set unique CUSTOM names on all categories
          const customNames: string[] = []
          act(() => {
            for (let i = 0; i < catCount; i++) {
              const name = `Custom_Cat_${i}_data`
              customNames.push(name)
              result.current.setCategoryName(0, i, name)
            }
          })

          // Set some clue content: set clue text on first clue of each category to something unique
          act(() => {
            for (let i = 0; i < catCount; i++) {
              result.current.setClueField(0, i, 0, 'clue', `Clue_text_for_cat_${i}`)
              result.current.setClueField(0, i, 0, 'solution', `Solution_for_cat_${i}`)
            }
          })

          // Generate valid deletion index
          const deleteIdx = deletionSeed % catCount

          // Record all category data before deletion (except the one at deleteIdx)
          const categoriesBefore = result.current.formState.rounds[0].categories
          const preservedData: Array<{ name: string; clues: typeof categoriesBefore[0]['clues'] }> = []
          for (let i = 0; i < categoriesBefore.length; i++) {
            if (i === deleteIdx) continue
            preservedData.push({
              name: categoriesBefore[i].name,
              clues: JSON.parse(JSON.stringify(categoriesBefore[i].clues)),
            })
          }

          // Perform deletion
          act(() => {
            result.current.deleteCategory(0, deleteIdx)
          })

          const categoriesAfter = result.current.formState.rounds[0].categories

          // Verify C-1 categories remain
          expect(categoriesAfter.length).toBe(catCount - 1)

          // Verify each remaining category's custom name and clue content match what was recorded
          for (let i = 0; i < preservedData.length; i++) {
            const catAfter = categoriesAfter[i]

            // Custom name is preserved (since all are custom, they won't be renamed)
            expect(catAfter.name).toBe(preservedData[i].name)
            expect(catAfter.isDefaultName).toBe(false)

            // Clue content is preserved
            expect(catAfter.clues.length).toBe(preservedData[i].clues.length)
            for (let j = 0; j < catAfter.clues.length; j++) {
              expect(catAfter.clues[j].clue).toBe(preservedData[i].clues[j].clue)
              expect(catAfter.clues[j].solution).toBe(preservedData[i].clues[j].solution)
              expect(catAfter.clues[j].value).toBe(preservedData[i].clues[j].value)
              expect(catAfter.clues[j].dailyDouble).toBe(preservedData[i].clues[j].dailyDouble)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})


// Feature: board-style-game-editor, Property 8: Category swap exchanges full content
describe('Property 8: Category swap exchanges full content bidirectionally', () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For any board and any two distinct category indices A and B, after a swap
   * the content at position A SHALL be the former content of position B and vice versa.
   * Default category names are updated to reflect new positions; custom names remain unchanged.
   */

  // ─── Generators ─────────────────────────────────────────────────────────────

  const categoryCountArb = fc.integer({ min: 3, max: 8 })

  // Generate a unique custom name that doesn't match default pattern
  const customNameArb = fc.string({ minLength: 1, maxLength: 20 })
    .filter(s => s.trim().length > 0 && !s.match(/^Category \d+$/))

  // Generate two distinct indices within a range
  function _distinctPairArb(max: number) {
    return fc.tuple(
      fc.integer({ min: 0, max: max - 1 }),
      fc.integer({ min: 0, max: max - 1 })
    ).filter(([a, b]) => a !== b)
  }

  it('swap exchanges full content (all custom names) at positions A and B', () => {
    fc.assert(
      fc.property(
        categoryCountArb,
        fc.array(customNameArb, { minLength: 8, maxLength: 8 }),
        (catCount, namePool) => {
          const { result } = renderHook(() => useBuilderState())

          // Setup board with catCount categories
          act(() => {
            result.current.setCategoriesPerRound(catCount)
          })

          // Assign unique custom names and unique clue content to all categories
          act(() => {
            for (let i = 0; i < catCount; i++) {
              const uniqueName = `Custom_${i}_${namePool[i % namePool.length]}`
              result.current.setCategoryName(0, i, uniqueName)
              // Set unique clue text in first clue as content fingerprint
              result.current.setClueField(0, i, 0, 'clue', `clue_content_cat_${i}`)
              result.current.setClueField(0, i, 0, 'solution', `solution_content_cat_${i}`)
            }
          })

          // Generate two distinct indices
          const A = 0
          const B = catCount - 1
          // Use deterministic indices for simplicity within the property
          // (the property itself is parameterized over catCount)

          // Record content at A and B before swap
          const catsBefore = result.current.formState.rounds[0].categories
          const contentA = {
            name: catsBefore[A].name,
            isDefaultName: catsBefore[A].isDefaultName,
            clueText: catsBefore[A].clues[0].clue,
            solutionText: catsBefore[A].clues[0].solution,
          }
          const contentB = {
            name: catsBefore[B].name,
            isDefaultName: catsBefore[B].isDefaultName,
            clueText: catsBefore[B].clues[0].clue,
            solutionText: catsBefore[B].clues[0].solution,
          }

          // Perform swap
          act(() => {
            result.current.swapCategories(0, A, B)
          })

          // Verify content exchanged
          const catsAfter = result.current.formState.rounds[0].categories

          // Position A now has former content of B
          expect(catsAfter[A].clues[0].clue).toBe(contentB.clueText)
          expect(catsAfter[A].clues[0].solution).toBe(contentB.solutionText)
          // Position B now has former content of A
          expect(catsAfter[B].clues[0].clue).toBe(contentA.clueText)
          expect(catsAfter[B].clues[0].solution).toBe(contentA.solutionText)

          // Since all names are custom (isDefaultName: false), they swap with content
          expect(catsAfter[A].name).toBe(contentB.name)
          expect(catsAfter[B].name).toBe(contentA.name)
          expect(catsAfter[A].isDefaultName).toBe(false)
          expect(catsAfter[B].isDefaultName).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('swap with randomized distinct indices exchanges content bidirectionally', () => {
    fc.assert(
      fc.property(
        categoryCountArb,
        fc.array(customNameArb, { minLength: 8, maxLength: 8 }),
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 0, max: 99 }),
        (catCount, namePool, seedA, seedB) => {
          const { result } = renderHook(() => useBuilderState())

          // Setup board
          act(() => {
            result.current.setCategoriesPerRound(catCount)
          })

          // Assign unique custom names and content to all categories
          act(() => {
            for (let i = 0; i < catCount; i++) {
              const uniqueName = `Cat_${i}_${namePool[i % namePool.length]}`
              result.current.setCategoryName(0, i, uniqueName)
              // Set unique content fingerprint for each clue row
              const numClues = result.current.formState.rounds[0].pointValues.length
              for (let j = 0; j < numClues; j++) {
                result.current.setClueField(0, i, j, 'clue', `q_${i}_${j}`)
                result.current.setClueField(0, i, j, 'solution', `a_${i}_${j}`)
              }
            }
          })

          // Generate two distinct indices from seeds
          const A = seedA % catCount
          let B = seedB % catCount
          if (B === A) B = (A + 1) % catCount

          // Record full content at A and B before swap
          const catsBefore = result.current.formState.rounds[0].categories
          const cluesA = catsBefore[A].clues.map(c => ({ clue: c.clue, solution: c.solution }))
          const cluesB = catsBefore[B].clues.map(c => ({ clue: c.clue, solution: c.solution }))
          const nameA = catsBefore[A].name
          const nameB = catsBefore[B].name

          // Perform swap
          act(() => {
            result.current.swapCategories(0, A, B)
          })

          // Verify: position A now has former content of B
          const catsAfter = result.current.formState.rounds[0].categories
          for (let j = 0; j < cluesB.length; j++) {
            expect(catsAfter[A].clues[j].clue).toBe(cluesB[j].clue)
            expect(catsAfter[A].clues[j].solution).toBe(cluesB[j].solution)
          }
          // Verify: position B now has former content of A
          for (let j = 0; j < cluesA.length; j++) {
            expect(catsAfter[B].clues[j].clue).toBe(cluesA[j].clue)
            expect(catsAfter[B].clues[j].solution).toBe(cluesA[j].solution)
          }

          // Custom names swap with their content
          expect(catsAfter[A].name).toBe(nameB)
          expect(catsAfter[B].name).toBe(nameA)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('swap with mixed default/custom names updates defaults to new positions', () => {
    fc.assert(
      fc.property(
        categoryCountArb,
        customNameArb,
        fc.integer({ min: 0, max: 99 }),
        (catCount, customName, seed) => {
          const { result } = renderHook(() => useBuilderState())

          // Setup board — all categories start with default names
          act(() => {
            result.current.setCategoriesPerRound(catCount)
          })

          // Pick one category to make custom, rest stay default
          const customIdx = seed % catCount
          const defaultIdx = (customIdx + 1) % catCount

          act(() => {
            result.current.setCategoryName(0, customIdx, customName)
            // Add unique content to both categories for tracking
            result.current.setClueField(0, customIdx, 0, 'clue', 'custom_cat_clue')
            result.current.setClueField(0, defaultIdx, 0, 'clue', 'default_cat_clue')
          })

          // Record state before swap
          const catsBefore = result.current.formState.rounds[0].categories
          const beforeCustom = {
            name: catsBefore[customIdx].name,
            isDefaultName: catsBefore[customIdx].isDefaultName,
            clueText: catsBefore[customIdx].clues[0].clue,
          }
          const beforeDefault = {
            name: catsBefore[defaultIdx].name,
            isDefaultName: catsBefore[defaultIdx].isDefaultName,
            clueText: catsBefore[defaultIdx].clues[0].clue,
          }

          expect(beforeCustom.isDefaultName).toBe(false)
          expect(beforeDefault.isDefaultName).toBe(true)

          // Swap the custom and default categories
          act(() => {
            result.current.swapCategories(0, customIdx, defaultIdx)
          })

          const catsAfter = result.current.formState.rounds[0].categories

          // Content exchanged
          expect(catsAfter[customIdx].clues[0].clue).toBe(beforeDefault.clueText)
          expect(catsAfter[defaultIdx].clues[0].clue).toBe(beforeCustom.clueText)

          // Custom name remains unchanged (preserves user-set name)
          expect(catsAfter[defaultIdx].name).toBe(customName)
          expect(catsAfter[defaultIdx].isDefaultName).toBe(false)

          // Default name updates to reflect new position
          expect(catsAfter[customIdx].isDefaultName).toBe(true)
          expect(catsAfter[customIdx].name).toBe(`Category ${customIdx + 1}`)
        }
      ),
      { numRuns: 100 }
    )
  })
})


// Feature: board-style-game-editor, Property 9: Round swap preserves content, recalculates values
describe('Property 9: Round swap preserves content while recalculating point values', () => {
  /**
   * **Validates: Requirements 11.5, 11.6**
   *
   * For any game with multiple rounds and any two round positions P and Q,
   * after swapping: all category names, clue text, solutions, and media of each
   * round SHALL be preserved, but point values SHALL be recalculated to match
   * the new round position number.
   */

  // Import generateDefaultPointValues for expected value calculation
  // (already available via the hook's implementation, but we need it for assertions)

  it('swapping two rounds preserves category content and recalculates point values', async () => {
    const { generateDefaultPointValues } = await import('../utils/builderFormStructure')

    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }), // total rounds (need at least 2 for swap)
        fc.nat(), // seed for generating P and Q
        fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && !s.match(/^Category \d+$/)), { minLength: 2, maxLength: 6 }),
        (totalRounds, idxSeed, customNames) => {
          const { result } = renderHook(() => useBuilderState())

          // Setup: create multiple rounds
          act(() => {
            result.current.setTotalRounds(totalRounds)
          })

          // Generate two distinct round indices P and Q
          const P = idxSeed % totalRounds
          let Q = (P + 1 + (idxSeed % Math.max(1, totalRounds - 1))) % totalRounds
          if (Q === P) Q = (P + 1) % totalRounds

          // Set unique category names in round P
          const catCountP = result.current.formState.rounds[P].categories.length
          const namesForP: string[] = []
          act(() => {
            for (let i = 0; i < Math.min(customNames.length, catCountP); i++) {
              const name = `P_${customNames[i]}_${i}`
              result.current.setCategoryName(P, i, name)
              namesForP.push(name)
            }
          })

          // Set unique category names in round Q
          const catCountQ = result.current.formState.rounds[Q].categories.length
          const namesForQ: string[] = []
          act(() => {
            for (let i = 0; i < Math.min(customNames.length, catCountQ); i++) {
              const name = `Q_${customNames[i]}_${i}`
              result.current.setCategoryName(Q, i, name)
              namesForQ.push(name)
            }
          })

          // Set some clue text in round P and Q to verify content preservation
          act(() => {
            result.current.setClueField(P, 0, 0, 'clue', 'RoundP_Clue_Text')
            result.current.setClueField(P, 0, 0, 'solution', 'RoundP_Solution_Text')
            result.current.setClueField(Q, 0, 0, 'clue', 'RoundQ_Clue_Text')
            result.current.setClueField(Q, 0, 0, 'solution', 'RoundQ_Solution_Text')
          })

          // Record category names before swap
          const roundPCatNamesBefore = result.current.formState.rounds[P].categories.map(c => c.name)
          const roundQCatNamesBefore = result.current.formState.rounds[Q].categories.map(c => c.name)

          // Record clue text before swap
          const roundPClueTextBefore = result.current.formState.rounds[P].categories[0].clues[0].clue
          const roundPSolutionBefore = result.current.formState.rounds[P].categories[0].clues[0].solution
          const roundQClueTextBefore = result.current.formState.rounds[Q].categories[0].clues[0].clue
          const roundQSolutionBefore = result.current.formState.rounds[Q].categories[0].clues[0].solution

          // Perform the swap
          act(() => {
            result.current.swapRounds(P, Q)
          })

          const roundPAfter = result.current.formState.rounds[P]
          const roundQAfter = result.current.formState.rounds[Q]
          const rowCountP = roundPAfter.pointValues.length
          const rowCountQ = roundQAfter.pointValues.length

          // Verify: category names from former round P are now at position Q and vice versa
          const roundPCatNamesAfter = roundPAfter.categories.map(c => c.name)
          const roundQCatNamesAfter = roundQAfter.categories.map(c => c.name)

          expect(roundPCatNamesAfter).toEqual(roundQCatNamesBefore)
          expect(roundQCatNamesAfter).toEqual(roundPCatNamesBefore)

          // Verify: clue text from round P is now at position Q and vice versa
          expect(roundPAfter.categories[0].clues[0].clue).toBe(roundQClueTextBefore)
          expect(roundPAfter.categories[0].clues[0].solution).toBe(roundQSolutionBefore)
          expect(roundQAfter.categories[0].clues[0].clue).toBe(roundPClueTextBefore)
          expect(roundQAfter.categories[0].clues[0].solution).toBe(roundPSolutionBefore)

          // Verify: point values at position P are recalculated for position P+1
          const expectedPointValuesP = generateDefaultPointValues(P + 1, rowCountP)
          expect(roundPAfter.pointValues).toEqual(expectedPointValuesP)

          // Verify: point values at position Q are recalculated for position Q+1
          const expectedPointValuesQ = generateDefaultPointValues(Q + 1, rowCountQ)
          expect(roundQAfter.pointValues).toEqual(expectedPointValuesQ)

          // Verify: clue values are updated to match new point values
          for (const cat of roundPAfter.categories) {
            for (let clueIdx = 0; clueIdx < cat.clues.length; clueIdx++) {
              expect(cat.clues[clueIdx].value).toBe(String(expectedPointValuesP[clueIdx]))
            }
          }
          for (const cat of roundQAfter.categories) {
            for (let clueIdx = 0; clueIdx < cat.clues.length; clueIdx++) {
              expect(cat.clues[clueIdx].value).toBe(String(expectedPointValuesQ[clueIdx]))
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})


// Feature: board-style-game-editor, Property 11: Delete round recalculates remaining values
describe('Property 11: Delete round removes data and recalculates remaining point values', () => {
  /**
   * **Validates: Requirements 11.10**
   *
   * For any game with R > 1 rounds and any valid deletion index I, the resulting game
   * SHALL have R-1 rounds where remaining rounds retain their category/clue content
   * but have point values recalculated to match their new position numbers.
   */

  // Generate round count between 2 and 5
  const roundCountArb = fc.integer({ min: 2, max: 5 })

  // Generate a unique custom category name distinct from the default pattern
  const customNameArb = fc.string({ minLength: 2, maxLength: 20 })
    .filter(s => s.trim().length > 0 && !s.match(/^Category \d+$/))

  it('deleting a round results in R-1 rounds with content preserved and point values recalculated', () => {
    fc.assert(
      fc.property(
        roundCountArb,
        fc.integer({ min: 0, max: 100 }), // seed for deletion index
        fc.array(customNameArb, { minLength: 5, maxLength: 10 }),
        (roundCount, deleteSeed, customNames) => {
          const { result } = renderHook(() => useBuilderState())

          // Setup: create a game with roundCount rounds
          // Start with 1 round (default), add the rest
          act(() => {
            for (let i = 1; i < roundCount; i++) {
              result.current.addRound()
            }
          })

          expect(result.current.formState.rounds.length).toBe(roundCount)

          // Set unique custom category names in different rounds to track content
          const categoryNamesPerRound: string[][] = []
          act(() => {
            for (let roundIdx = 0; roundIdx < roundCount; roundIdx++) {
              const categories = result.current.formState.rounds[roundIdx].categories
              const roundNames: string[] = []
              for (let catIdx = 0; catIdx < categories.length; catIdx++) {
                const nameIdx = (roundIdx * categories.length + catIdx) % customNames.length
                const name = `${customNames[nameIdx]}_R${roundIdx}_C${catIdx}`
                result.current.setCategoryName(roundIdx, catIdx, name)
                roundNames.push(name)
              }
              categoryNamesPerRound.push(roundNames)
            }
          })

          // Pick a valid deletion index
          const R = result.current.formState.rounds.length
          const deleteIdx = deleteSeed % R

          // Record category names for rounds that will remain after deletion
          const expectedRemainingNames: string[][] = []
          for (let i = 0; i < R; i++) {
            if (i !== deleteIdx) {
              expectedRemainingNames.push(categoryNamesPerRound[i])
            }
          }

          // Delete the round
          act(() => {
            result.current.deleteRound(deleteIdx)
          })

          const afterState = result.current.formState

          // 1. formState.rounds.length === R - 1
          expect(afterState.rounds.length).toBe(R - 1)

          // 2. formState.totalRounds === R - 1
          expect(afterState.totalRounds).toBe(R - 1)

          // 3. Remaining rounds retain their category names (content preserved)
          for (let newIdx = 0; newIdx < afterState.rounds.length; newIdx++) {
            const round = afterState.rounds[newIdx]
            const expectedNames = expectedRemainingNames[newIdx]
            for (let catIdx = 0; catIdx < round.categories.length; catIdx++) {
              expect(round.categories[catIdx].name).toBe(expectedNames[catIdx])
            }
          }

          // 4. Point values for each remaining round match generateDefaultPointValues(newPosition + 1, rowCount)
          for (let newIdx = 0; newIdx < afterState.rounds.length; newIdx++) {
            const round = afterState.rounds[newIdx]
            const rowCount = round.pointValues.length
            const expectedPointValues = generateDefaultPointValues(newIdx + 1, rowCount)
            expect(round.pointValues).toEqual(expectedPointValues)
          }

          // 5. Clue values at each row match the recalculated point values
          for (let newIdx = 0; newIdx < afterState.rounds.length; newIdx++) {
            const round = afterState.rounds[newIdx]
            for (let catIdx = 0; catIdx < round.categories.length; catIdx++) {
              for (let rowIdx = 0; rowIdx < round.pointValues.length; rowIdx++) {
                expect(round.categories[catIdx].clues[rowIdx].value).toBe(
                  String(round.pointValues[rowIdx])
                )
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
