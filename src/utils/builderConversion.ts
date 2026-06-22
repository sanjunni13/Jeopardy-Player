import type {
  BuilderFormState,
  CategoryFormState,
  ClueFormState,
  MediaAttachment,
  RoundFormState,
} from './builderFormStructure'
import { generateDefaultPointValues } from './builderFormStructure'
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
    rounds[roundName] = state.rounds[r].categories.map(cat => ({
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
 * Collects all media attachments into a manifest keyed by clue path.
 */
export function builderStateToDraft(state: BuilderFormState): BuilderDraft {
  const rounds: Record<string, Category[]> = {}
  const media: Record<string, MediaAttachment[]> = {}

  for (let r = 0; r < state.totalRounds; r++) {
    const roundName = ROUND_NAMES[r]
    rounds[roundName] = state.rounds[r].categories.map((cat, catIdx) => ({
      category: cat.name,
      clues: cat.clues.map((c, clueIdx) => {
        // Collect media into manifest
        if (c.media && c.media.length > 0) {
          const key = `round.${r}.cat.${catIdx}.clue.${clueIdx}`
          media[key] = c.media
        }
        return {
          value: Number(c.value),
          clue: c.clue,
          solution: c.solution,
          dailyDouble: c.dailyDouble,
          html: false,
        }
      }),
    }))
  }

  // Collect final round media
  if (state.finalRound.media && state.finalRound.media.length > 0) {
    media['final'] = state.finalRound.media
  }

  const draft: BuilderDraft = {
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

  // Only include media field if there are attachments
  if (Object.keys(media).length > 0) {
    draft.media = media
  }

  return draft
}

/**
 * Converts a BuilderDraft back to a BuilderFormState.
 * Numeric clue values are converted back to strings for form inputs.
 * Detects old-format drafts and upgrades them (backward compatibility):
 * - If categories have exactly 5 clues with no media, treats as old format
 * - Generates pointValues from stored clue values
 * - Defaults isDefaultName: false for existing categories
 * - Reads media from the manifest and attaches to corresponding clues/final
 */
export function draftToBuilderState(draft: BuilderDraft): BuilderFormState {
  const rounds: RoundFormState[] = []
  const mediaManifest = draft.media ?? {}

  for (let r = 0; r < draft.totalRounds; r++) {
    const roundName = ROUND_NAMES[r]
    const categories = draft.rounds[roundName] ?? []

    const categoryStates: CategoryFormState[] = categories.map((cat, catIdx) => ({
      name: cat.category,
      clues: cat.clues.map((c, clueIdx) => {
        const key = `round.${r}.cat.${catIdx}.clue.${clueIdx}`
        const clueMedia = mediaManifest[key]
        const clue: ClueFormState = {
          value: String(c.value),
          clue: c.clue,
          solution: c.solution,
          dailyDouble: c.dailyDouble,
        }
        if (clueMedia && clueMedia.length > 0) {
          clue.media = clueMedia
        }
        return clue
      }),
      isDefaultName: false, // Existing drafts: assume user-named
    }))

    // Generate pointValues: use stored clue values from the first category if available,
    // otherwise fall back to defaults for the round position
    let pointValues: number[]
    if (categoryStates.length > 0 && categoryStates[0].clues.length > 0) {
      // Extract point values from the first category's clue values
      pointValues = categoryStates[0].clues.map(c => {
        const num = Number(c.value)
        return isNaN(num) || num === 0 ? 0 : num
      })
      // If all values are 0 (empty draft), use defaults
      if (pointValues.every(v => v === 0)) {
        pointValues = generateDefaultPointValues(r + 1, categoryStates[0].clues.length)
      }
    } else {
      const rowCount = 5
      pointValues = generateDefaultPointValues(r + 1, rowCount)
    }

    rounds.push({ categories: categoryStates, pointValues })
  }

  // Build final round state with media
  const finalMedia = mediaManifest['final']
  const finalRound: BuilderFormState['finalRound'] = {
    category: draft.final.category,
    clue: draft.final.clue,
    solution: draft.final.solution,
  }
  if (finalMedia && finalMedia.length > 0) {
    finalRound.media = finalMedia
  }

  return {
    gameName: draft.gameName,
    totalRounds: draft.totalRounds,
    categoriesPerRound: draft.categoriesPerRound,
    rounds,
    finalRound,
  }
}

/**
 * Compares current form state to the last-saved snapshot to determine if there are unsaved changes.
 * If lastSaved is null (new game), returns true if any non-default field has content.
 */
export function isDirtyState(
  current: BuilderFormState,
  lastSaved: BuilderFormState | null
): boolean {
  if (lastSaved === null) {
    // New game: dirty if any field has user-entered content
    return (
      current.gameName !== '' ||
      current.rounds.some(round =>
        round.categories.some(
          cat =>
            (!cat.isDefaultName && cat.name !== '') ||
            cat.clues.some(
              c =>
                c.value !== '' ||
                c.clue !== '' ||
                c.solution !== '' ||
                (c.media != null && c.media.length > 0)
            )
        )
      ) ||
      current.finalRound.category !== '' ||
      current.finalRound.clue !== '' ||
      current.finalRound.solution !== '' ||
      (current.finalRound.media != null && current.finalRound.media.length > 0)
    )
  }
  // Existing draft: dirty if current differs from lastSaved
  return JSON.stringify(current) !== JSON.stringify(lastSaved)
}
