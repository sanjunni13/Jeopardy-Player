import type {
  BuilderFormState,
  CategoryFormState,
  ClueFormState,
} from './builderFormStructure'
import type { BuilderDraft } from './draftApi'
import type { NormalizedGame, RoundName, Category } from '../types/game'

// ─── Constants ─────────────────────────────────────────────────────────────────

const ROUND_NAMES: RoundName[] = [
  'single',
  'double',
  'triple',
  'quadruple',
  'quintuple',
  'sextuple',
]

// ─── Conversion Functions ──────────────────────────────────────────────────────

/**
 * Converts a valid BuilderFormState to a NormalizedGame.
 * Clue values are converted from string to number.
 */
export function builderStateToNormalizedGame(state: BuilderFormState): NormalizedGame {
  const rounds: Record<string, Category[]> = {}

  for (let r = 0; r < state.totalRounds; r++) {
    const roundName = ROUND_NAMES[r]
    rounds[roundName] = state.rounds[r].map(cat => ({
      category: cat.name,
      clues: cat.clues.map(c => ({
        value: Number(c.value),
        clue: c.clue,
        solution: c.solution,
        dailyDouble: c.dailyDouble,
        html: false,
      })),
    }))
  }

  return {
    rounds: rounds as Record<RoundName, Category[]>,
    final: {
      category: state.finalRound.category,
      clue: state.finalRound.clue,
      solution: state.finalRound.solution,
      html: false,
    },
    totalRounds: state.totalRounds,
  }
}

/**
 * Converts a BuilderFormState to a BuilderDraft for storage.
 * Includes gameName, totalRounds, categoriesPerRound plus game data.
 */
export function builderStateToDraft(state: BuilderFormState): BuilderDraft {
  const rounds: Record<string, Category[]> = {}

  for (let r = 0; r < state.totalRounds; r++) {
    const roundName = ROUND_NAMES[r]
    rounds[roundName] = state.rounds[r].map(cat => ({
      category: cat.name,
      clues: cat.clues.map(c => ({
        value: Number(c.value),
        clue: c.clue,
        solution: c.solution,
        dailyDouble: c.dailyDouble,
        html: false,
        ...(c.media ? { media: c.media } : {}),
      })),
    }))
  }

  return {
    gameName: state.gameName,
    totalRounds: state.totalRounds,
    categoriesPerRound: state.categoriesPerRound,
    rounds: rounds as Record<RoundName, Category[]>,
    final: {
      category: state.finalRound.category,
      clue: state.finalRound.clue,
      solution: state.finalRound.solution,
      html: false,
    },
  }
}

/**
 * Converts a BuilderDraft back to a BuilderFormState.
 * Numeric clue values are converted back to strings for form inputs.
 */
export function draftToBuilderState(draft: BuilderDraft): BuilderFormState {
  const rounds: CategoryFormState[][] = []

  for (let r = 0; r < draft.totalRounds; r++) {
    const roundName = ROUND_NAMES[r]
    const categories = draft.rounds[roundName] ?? []

    rounds.push(
      categories.map(cat => ({
        name: cat.category,
        clues: cat.clues.map(c => {
          const clue: ClueFormState = {
            value: String(c.value),
            clue: c.clue,
            solution: c.solution,
            dailyDouble: c.dailyDouble,
          }
          const media = (c as Record<string, unknown>).media as ClueFormState['media'] | undefined
          if (media !== undefined) {
            clue.media = media
          }
          return clue
        }) as [ClueFormState, ClueFormState, ClueFormState, ClueFormState, ClueFormState],
      }))
    )
  }

  return {
    gameName: draft.gameName,
    totalRounds: draft.totalRounds,
    categoriesPerRound: draft.categoriesPerRound,
    rounds,
    finalRound: {
      category: draft.final.category,
      clue: draft.final.clue,
      solution: draft.final.solution,
    },
  }
}

/**
 * Compares current form state to the last-saved snapshot to determine if there are unsaved changes.
 * If lastSaved is null (new game), returns true if any field has content.
 * Note: clue values are computed/read-only and excluded from dirty checks for new games.
 */
export function isDirtyState(
  current: BuilderFormState,
  lastSaved: BuilderFormState | null
): boolean {
  if (lastSaved === null) {
    // New game: dirty if any user-editable field has content
    // (clue values are computed and always populated, so they're excluded)
    return (
      current.gameName !== '' ||
      current.rounds.some(round =>
        round.some(
          cat =>
            cat.name !== '' ||
            cat.clues.some(c => c.clue !== '' || c.solution !== '')
        )
      ) ||
      current.finalRound.category !== '' ||
      current.finalRound.clue !== '' ||
      current.finalRound.solution !== ''
    )
  }
  // Existing draft: dirty if current differs from lastSaved
  return JSON.stringify(current) !== JSON.stringify(lastSaved)
}
