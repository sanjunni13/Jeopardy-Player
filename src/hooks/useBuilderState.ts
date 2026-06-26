import { useState, useCallback, useMemo } from 'react'
import { generateEmptyFormState, recalculateClueValues } from '../utils/builderFormStructure'
import type { BuilderFormState, ClueFormState, FinalRoundFormState, ValidationErrors, MediaData } from '../utils/builderFormStructure'
import { validateGameName, validateClueValue, validateForPublish as validateForPublishFn, validateForSave as validateForSaveFn } from '../utils/builderValidation'
import { builderStateToNormalizedGame, builderStateToDraft, draftToBuilderState, isDirtyState } from '../utils/builderConversion'
import type { BuilderDraft } from '../utils/draftApi'
import type { NormalizedGame } from '../types/game'
import { computeClueValue } from '../utils/clueValues'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ClueFieldValue = string | boolean | MediaData | null

// ─── Return type ───────────────────────────────────────────────────────────────

export interface UseBuilderStateReturn {
  formState: BuilderFormState
  errors: ValidationErrors
  isDirty: boolean
  setGameName: (name: string) => void
  setTotalRounds: (n: number) => void
  setCategoriesPerRound: (n: number) => void
  setCategoryName: (roundIdx: number, catIdx: number, name: string) => void
  setClueField: (roundIdx: number, catIdx: number, clueIdx: number, field: keyof ClueFormState, value: ClueFieldValue) => void
  setFinalField: (field: keyof FinalRoundFormState, value: string) => void
  validateField: (fieldPath: string) => void
  validateForPublish: () => boolean
  validateForSave: () => boolean
  resetDirty: () => void
  loadFromDraft: (draft: BuilderDraft) => void
  toBuildDraft: () => BuilderDraft
  toNormalizedGame: () => NormalizedGame
}

// ─── Helper: create empty category ────────────────────────────────────────────

function createEmptyCategory(roundIndex: number) {
  return {
    name: '',
    clues: [
      { value: String(computeClueValue(1, roundIndex + 1)), clue: '', solution: '', dailyDouble: false },
      { value: String(computeClueValue(2, roundIndex + 1)), clue: '', solution: '', dailyDouble: false },
      { value: String(computeClueValue(3, roundIndex + 1)), clue: '', solution: '', dailyDouble: false },
      { value: String(computeClueValue(4, roundIndex + 1)), clue: '', solution: '', dailyDouble: false },
      { value: String(computeClueValue(5, roundIndex + 1)), clue: '', solution: '', dailyDouble: false },
    ] as [ClueFormState, ClueFormState, ClueFormState, ClueFormState, ClueFormState],
  }
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
      let newRounds

      if (n > currentRounds.length) {
        // Grow: append new empty rounds with computed values
        const additional = Array.from({ length: n - currentRounds.length }, (_, i) => {
          const roundIndex = currentRounds.length + i
          return Array.from({ length: prev.categoriesPerRound }, () => createEmptyCategory(roundIndex))
        })
        newRounds = [...currentRounds, ...additional]
      } else {
        // Shrink: truncate
        newRounds = currentRounds.slice(0, n)
      }

      // Recalculate all clue values across all rounds
      newRounds = recalculateClueValues(newRounds)

      return { ...prev, totalRounds: n, rounds: newRounds }
    })
  }, [])

  const setCategoriesPerRound = useCallback((n: number) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map((round, roundIdx) => {
        if (n > round.length) {
          // Grow: append empty categories with computed values
          const additional = Array.from({ length: n - round.length }, () => createEmptyCategory(roundIdx))
          return [...round, ...additional]
        }
        // Shrink: truncate
        return round.slice(0, n)
      })

      return { ...prev, categoriesPerRound: n, rounds: newRounds }
    })
  }, [])

  const setCategoryName = useCallback((roundIdx: number, catIdx: number, name: string) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map((round, rIdx) => {
        if (rIdx !== roundIdx) return round
        return round.map((cat, cIdx) => {
          if (cIdx !== catIdx) return cat
          return { ...cat, name }
        })
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
    value: ClueFieldValue
  ) => {
    setFormState(prev => {
      const newRounds = prev.rounds.map((round, rIdx) => {
        if (rIdx !== roundIdx) return round
        return round.map((cat, cIdx) => {
          if (cIdx !== catIdx) return cat
          const newClues = [...cat.clues] as [ClueFormState, ClueFormState, ClueFormState, ClueFormState, ClueFormState]
          newClues[clueIdx] = { ...newClues[clueIdx], [field]: value }
          return { ...cat, clues: newClues }
        })
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
        const value = currentState.rounds[roundIdx]?.[catIdx]?.clues[clueIdx]?.value ?? ''
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
    // Recalculate clue values to ensure they match the computed formula
    newState.rounds = recalculateClueValues(newState.rounds)
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
  }
}
