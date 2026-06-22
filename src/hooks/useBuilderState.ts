import { useState, useCallback, useMemo } from 'react'
import { generateEmptyFormState, generateDefaultPointValues } from '../utils/builderFormStructure'
import type { BuilderFormState, ClueFormState, FinalRoundFormState, ValidationErrors, RoundFormState, CategoryFormState } from '../utils/builderFormStructure'
import { validateGameName, validateClueValue, validateForPublish as validateForPublishFn, validateForSave as validateForSaveFn } from '../utils/builderValidation'
import { builderStateToNormalizedGame, builderStateToDraft, draftToBuilderState, isDirtyState } from '../utils/builderConversion'
import type { BuilderDraft } from '../utils/draftApi'
import type { NormalizedGame } from '../types/game'

// ─── Return type ───────────────────────────────────────────────────────────────

export interface UseBuilderStateReturn {
  formState: BuilderFormState
  errors: ValidationErrors
  isDirty: boolean
  setGameName: (name: string) => void
  setTotalRounds: (n: number) => void
  setCategoriesPerRound: (n: number) => void
  setCategoryName: (roundIdx: number, catIdx: number, name: string) => void
  setClueField: (roundIdx: number, catIdx: number, clueIdx: number, field: keyof ClueFormState, value: string | boolean) => void
  setFinalField: (field: keyof FinalRoundFormState, value: string) => void
  validateField: (fieldPath: string) => void
  validateForPublish: () => boolean
  validateForSave: () => boolean
  resetDirty: () => void
  loadFromDraft: (draft: BuilderDraft) => void
  toBuildDraft: () => BuilderDraft
  toNormalizedGame: () => NormalizedGame
  // Structural actions
  addColumn: (roundIdx: number) => void
  addRow: (roundIdx: number) => void
  deleteCategory: (roundIdx: number, catIdx: number) => void
  swapCategories: (roundIdx: number, catIdxA: number, catIdxB: number) => void
  reorderCategories: (roundIdx: number, fromIdx: number, toIdx: number) => void
  updatePointValue: (roundIdx: number, rowIdx: number, newValue: number) => void
  addRound: () => void
  deleteRound: (roundIdx: number) => void
  swapRounds: (roundIdxA: number, roundIdxB: number) => void
}

// ─── Helper: create empty category ────────────────────────────────────────────

function createEmptyCategory(categoryIndex: number, rowCount: number = 5): CategoryFormState {
  return {
    name: `Category ${categoryIndex + 1}`,
    clues: Array.from({ length: rowCount }, () => ({
      value: '',
      clue: '',
      solution: '',
      dailyDouble: false,
    })),
    isDefaultName: true,
  }
}

// ─── Helper: create empty round ───────────────────────────────────────────────

function createEmptyRound(roundIndex: number, categoriesPerRound: number): RoundFormState {
  return {
    categories: Array.from({ length: categoriesPerRound }, (_, catIdx) =>
      createEmptyCategory(catIdx)
    ),
    pointValues: generateDefaultPointValues(roundIndex + 1, 5),
  }
}

// ─── Helper: update default category names to reflect positions ───────────────

function updateDefaultNames(categories: CategoryFormState[]): CategoryFormState[] {
  return categories.map((cat, idx) => {
    if (cat.isDefaultName) {
      return { ...cat, name: `Category ${idx + 1}` }
    }
    return cat
  })
}

// ─── Helper: recalculate point values for a round at a given position ─────────

function recalculatePointValues(round: RoundFormState, roundNumber: number): RoundFormState {
  const newPointValues = generateDefaultPointValues(roundNumber, round.pointValues.length)
  const newCategories = round.categories.map(cat => ({
    ...cat,
    clues: cat.clues.map((clue, clueIdx) => ({
      ...clue,
      value: String(newPointValues[clueIdx]),
    })),
  }))
  return { ...round, pointValues: newPointValues, categories: newCategories }
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useBuilderState(): UseBuilderStateReturn {
  const [formState, setFormState] = useState<BuilderFormState>(() =>
    generateEmptyFormState(1, 1)
  )
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<BuilderFormState | null>(null)

  const isDirty = useMemo(() => isDirtyState(formState, lastSavedSnapshot), [formState, lastSavedSnapshot])

  // ─── Setters ───────────────────────────────────────────────────────────────

  const setGameName = useCallback((name: string) => {
    setFormState(prev => ({ ...prev, gameName: name }))
    setErrors(prev => {
      const error = validateGameName(name)
      if (!error && 'gameName' in prev) {
        const next = { ...prev }
        delete next['gameName']
        return next
      }
      return prev
    })
  }, [])

  const setTotalRounds = useCallback((n: number) => {
    setFormState(prev => {
      const currentRounds = prev.rounds
      let newRounds: RoundFormState[]

      if (n > currentRounds.length) {
        // Grow: append new empty rounds
        const additional = Array.from({ length: n - currentRounds.length }, (_, i) =>
          createEmptyRound(currentRounds.length + i, prev.categoriesPerRound)
        )
        newRounds = [...currentRounds, ...additional]
      } else {
        // Shrink: truncate
        newRounds = currentRounds.slice(0, n)
      }

      return { ...prev, totalRounds: n, rounds: newRounds }
    })
  }, [])

  const setCategoriesPerRound = useCallback((n: number) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map(round => {
        if (n > round.categories.length) {
          // Grow: append empty categories
          const additional = Array.from({ length: n - round.categories.length }, (_, i) =>
            createEmptyCategory(round.categories.length + i)
          )
          return { ...round, categories: [...round.categories, ...additional] }
        }
        // Shrink: truncate
        return { ...round, categories: round.categories.slice(0, n) }
      })

      return { ...prev, categoriesPerRound: n, rounds: newRounds }
    })
  }, [])

  const setCategoryName = useCallback((roundIdx: number, catIdx: number, name: string) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map((round, rIdx) => {
        if (rIdx !== roundIdx) return round
        const newCategories = round.categories.map((cat, cIdx) => {
          if (cIdx !== catIdx) return cat
          return { ...cat, name, isDefaultName: false }
        })
        return { ...round, categories: newCategories }
      })
      return { ...prev, rounds: newRounds }
    })
    // Clear error if the field is now valid (non-empty for category names)
    const fieldPath = `rounds.${roundIdx}.${catIdx}.name`
    setErrors(prev => {
      if (name.trim() !== '' && prev[fieldPath]) {
        const next = { ...prev }
        delete next[fieldPath]
        return next
      }
      return prev
    })
  }, [])

  const setClueField = useCallback((
    roundIdx: number,
    catIdx: number,
    clueIdx: number,
    field: keyof ClueFormState,
    value: string | boolean
  ) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map((round, rIdx) => {
        if (rIdx !== roundIdx) return round
        const newCategories = round.categories.map((cat, cIdx) => {
          if (cIdx !== catIdx) return cat
          const newClues = [...cat.clues]
          newClues[clueIdx] = { ...newClues[clueIdx], [field]: value }
          return { ...cat, clues: newClues }
        })
        return { ...round, categories: newCategories }
      })
      return { ...prev, rounds: newRounds }
    })

    // Clear error for this field path if valid
    const fieldPath = `rounds.${roundIdx}.${catIdx}.clues.${clueIdx}.${field}`
    setErrors(prev => {
      if (!prev[fieldPath]) return prev

      let isValid = true
      if (field === 'value') {
        isValid = validateClueValue(value as string) === null
      } else if (field === 'clue' || field === 'solution') {
        isValid = (value as string).trim() !== ''
      }

      if (isValid) {
        const next = { ...prev }
        delete next[fieldPath]
        return next
      }
      return prev
    })
  }, [])

  const setFinalField = useCallback((field: keyof FinalRoundFormState, value: string) => {
    setFormState(prev => ({
      ...prev,
      finalRound: { ...prev.finalRound, [field]: value },
    }))

    const fieldPath = `final.${field}`
    setErrors(prev => {
      if (prev[fieldPath]) {
        const next = { ...prev }
        delete next[fieldPath]
        return next
      }
      return prev
    })
  }, [])

  // ─── Validation ────────────────────────────────────────────────────────────

  const validateField = useCallback((fieldPath: string) => {
    setFormState(currentState => {
      // We need to read current state synchronously for validation
      let error: string | null = null

      if (fieldPath === 'gameName') {
        error = validateGameName(currentState.gameName)
      } else if (fieldPath.match(/^rounds\.\d+\.\d+\.clues\.\d+\.value$/)) {
        const parts = fieldPath.split('.')
        const roundIdx = Number(parts[1])
        const catIdx = Number(parts[2])
        const clueIdx = Number(parts[4])
        const value = currentState.rounds[roundIdx]?.categories[catIdx]?.clues[clueIdx]?.value ?? ''
        error = validateClueValue(value)
      }

      setErrors(prev => {
        if (error) {
          return { ...prev, [fieldPath]: error }
        }
        const next = { ...prev }
        delete next[fieldPath]
        return next
      })

      // Return state unchanged — we only used setFormState to read the current state
      return currentState
    })
  }, [])

  const validateForPublish = useCallback((): boolean => {
    const allErrors = validateForPublishFn(formState)
    setErrors(allErrors)
    return Object.keys(allErrors).length === 0
  }, [formState])

  const validateForSave = useCallback((): boolean => {
    const formatErrors = validateForSaveFn(formState)
    setErrors(formatErrors)
    return Object.keys(formatErrors).length === 0
  }, [formState])

  // ─── State conversion ──────────────────────────────────────────────────────

  const loadFromDraft = useCallback((draft: BuilderDraft) => {
    const newState = draftToBuilderState(draft)
    setFormState(newState)
    setErrors({})
    setLastSavedSnapshot(JSON.parse(JSON.stringify(newState)))
  }, [])

  const toBuildDraft = useCallback((): BuilderDraft => {
    return builderStateToDraft(formState)
  }, [formState])

  const toNormalizedGame = useCallback((): NormalizedGame => {
    return builderStateToNormalizedGame(formState)
  }, [formState])

  // ─── Dirty tracking ────────────────────────────────────────────────────────

  const resetDirty = useCallback(() => {
    setFormState(current => {
      setLastSavedSnapshot(JSON.parse(JSON.stringify(current)))
      return current
    })
  }, [])

  // ─── Structural actions ────────────────────────────────────────────────────

  const addColumn = useCallback((roundIdx: number) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map((round, rIdx) => {
        if (rIdx !== roundIdx) return round
        const rowCount = round.pointValues.length
        const newCatIdx = round.categories.length
        const newCategory: CategoryFormState = {
          name: `Category ${newCatIdx + 1}`,
          clues: Array.from({ length: rowCount }, (_, clueIdx) => ({
            value: String(round.pointValues[clueIdx]),
            clue: '',
            solution: '',
            dailyDouble: false,
          })),
          isDefaultName: true,
        }
        return { ...round, categories: [...round.categories, newCategory] }
      })
      return { ...prev, rounds: newRounds }
    })
  }, [])

  const addRow = useCallback((roundIdx: number) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map((round, rIdx) => {
        if (rIdx !== roundIdx) return round
        const newRowCount = round.pointValues.length + 1
        const roundNumber = rIdx + 1
        const newPointValue = newRowCount * 200 * roundNumber
        const newPointValues = [...round.pointValues, newPointValue]
        const newCategories = round.categories.map(cat => ({
          ...cat,
          clues: [...cat.clues, {
            value: String(newPointValue),
            clue: '',
            solution: '',
            dailyDouble: false,
          }],
        }))
        return { ...round, categories: newCategories, pointValues: newPointValues }
      })
      return { ...prev, rounds: newRounds }
    })
  }, [])

  const deleteCategory = useCallback((roundIdx: number, catIdx: number) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map((round, rIdx) => {
        if (rIdx !== roundIdx) return round
        const newCategories = round.categories.filter((_, idx) => idx !== catIdx)
        return { ...round, categories: updateDefaultNames(newCategories) }
      })
      return { ...prev, rounds: newRounds }
    })
  }, [])

  const swapCategories = useCallback((roundIdx: number, catIdxA: number, catIdxB: number) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map((round, rIdx) => {
        if (rIdx !== roundIdx) return round
        const newCategories = [...round.categories]
        // Exchange full content
        const temp = newCategories[catIdxA]
        newCategories[catIdxA] = newCategories[catIdxB]
        newCategories[catIdxB] = temp
        return { ...round, categories: updateDefaultNames(newCategories) }
      })
      return { ...prev, rounds: newRounds }
    })
  }, [])

  const reorderCategories = useCallback((roundIdx: number, fromIdx: number, toIdx: number) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map((round, rIdx) => {
        if (rIdx !== roundIdx) return round
        const newCategories = [...round.categories]
        const [moved] = newCategories.splice(fromIdx, 1)
        newCategories.splice(toIdx, 0, moved)
        return { ...round, categories: updateDefaultNames(newCategories) }
      })
      return { ...prev, rounds: newRounds }
    })
  }, [])

  const updatePointValue = useCallback((roundIdx: number, rowIdx: number, newValue: number) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map((round, rIdx) => {
        if (rIdx !== roundIdx) return round
        const newPointValues = [...round.pointValues]
        newPointValues[rowIdx] = newValue
        const newCategories = round.categories.map(cat => {
          const newClues = [...cat.clues]
          newClues[rowIdx] = { ...newClues[rowIdx], value: String(newValue) }
          return { ...cat, clues: newClues }
        })
        return { ...round, categories: newCategories, pointValues: newPointValues }
      })
      return { ...prev, rounds: newRounds }
    })
  }, [])

  const addRound = useCallback(() => {
    setFormState(prev => {
      const newRoundIdx = prev.rounds.length
      const newRound = createEmptyRound(newRoundIdx, 6)
      return {
        ...prev,
        totalRounds: prev.totalRounds + 1,
        rounds: [...prev.rounds, newRound],
      }
    })
  }, [])

  const deleteRound = useCallback((roundIdx: number) => {
    setFormState(prev => {
      const newRounds = prev.rounds.filter((_, idx) => idx !== roundIdx)
      // Recalculate point values for all remaining rounds to match new positions
      const recalculatedRounds = newRounds.map((round, idx) =>
        recalculatePointValues(round, idx + 1)
      )
      return {
        ...prev,
        totalRounds: prev.totalRounds - 1,
        rounds: recalculatedRounds,
      }
    })
  }, [])

  const swapRounds = useCallback((roundIdxA: number, roundIdxB: number) => {
    setFormState(prev => {
      const newRounds = [...prev.rounds]
      // Exchange full content
      const temp = newRounds[roundIdxA]
      newRounds[roundIdxA] = newRounds[roundIdxB]
      newRounds[roundIdxB] = temp
      // Recalculate point values for both to match their new positions
      newRounds[roundIdxA] = recalculatePointValues(newRounds[roundIdxA], roundIdxA + 1)
      newRounds[roundIdxB] = recalculatePointValues(newRounds[roundIdxB], roundIdxB + 1)
      return { ...prev, rounds: newRounds }
    })
  }, [])

  return {
    formState,
    errors,
    isDirty,
    setGameName,
    setTotalRounds,
    setCategoriesPerRound,
    setCategoryName,
    setClueField,
    setFinalField,
    validateField,
    validateForPublish,
    validateForSave,
    resetDirty,
    loadFromDraft,
    toBuildDraft,
    toNormalizedGame,
    // Structural actions
    addColumn,
    addRow,
    deleteCategory,
    swapCategories,
    reorderCategories,
    updatePointValue,
    addRound,
    deleteRound,
    swapRounds,
  }
}
