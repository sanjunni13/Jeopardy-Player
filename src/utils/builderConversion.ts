import type {
  BuilderFormState,
  CategoryFormState,
  ClueFormState,
  FinalRoundFormState,
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
      clues: cat.clues.map(c => {
        const { clueHtml, hasHtml } = buildClueHtml(c.clue, c.media)
        return {
          value: Number(c.value),
          clue: clueHtml,
          solution: c.solution,
          dailyDouble: c.dailyDouble,
          html: hasHtml,
        }
      }),
    }))
  }

  const { clueHtml: finalClueHtml, hasHtml: finalHasHtml } = buildClueHtml(
    state.finalRound.clue,
    state.finalRound.media
  )

  return {
    rounds: rounds as Record<RoundName, Category[]>,
    final: {
      category: state.finalRound.category,
      clue: finalClueHtml,
      solution: state.finalRound.solution,
      html: finalHasHtml,
    },
    totalRounds: state.totalRounds,
  }
}

/** Convert media + text into an HTML clue string for the published game */
function buildClueHtml(
  text: string,
  media: BuilderFormState['finalRound']['media']
): { clueHtml: string; hasHtml: boolean } {
  if (!media) {
    return { clueHtml: text, hasHtml: false }
  }

  let mediaHtml = ''
  switch (media.type) {
    case 'image':
      mediaHtml = `<img src="${media.url}" alt="Clue media" style="max-width:100%;max-height:50vh;object-fit:contain;border-radius:0.5rem;" />`
      break
    case 'audio':
      mediaHtml = `<audio controls src="${media.url}"></audio>`
      break
    case 'youtube': {
      // Extract video ID for iframe embed
      const videoId = extractYouTubeId(media.url)
      if (videoId) {
        mediaHtml = `<iframe src="https://www.youtube.com/embed/${videoId}" style="width:80vw;max-width:900px;height:50vh;border-radius:0.5rem;" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>`
      }
      break
    }
  }

  const textPart = text.trim() ? `<p>${text}</p>` : ''
  const combined = mediaHtml + textPart

  return { clueHtml: combined, hasHtml: true }
}

/** Extract YouTube video ID from various URL formats */
function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return match ? match[1] : null
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
      ...(state.finalRound.media ? { media: state.finalRound.media } : {}),
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

  const finalMedia = (draft.final as Record<string, unknown>).media as FinalRoundFormState['media'] | undefined

  return {
    gameName: draft.gameName,
    totalRounds: draft.totalRounds,
    categoriesPerRound: draft.categoriesPerRound,
    rounds,
    finalRound: {
      category: draft.final.category,
      clue: draft.final.clue,
      solution: draft.final.solution,
      ...(finalMedia !== undefined ? { media: finalMedia } : {}),
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
