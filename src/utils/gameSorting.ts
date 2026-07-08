import type { GameRecord } from '../types/game'

export interface GameRatingSummary {
  gameId: string
  averageRating: number | null
  ratingCount: number
}

export type SortOption = 'default' | 'highest-rated' | 'most-played'

/**
 * Returns a sorted copy of the games array based on the selected sort option.
 * Does NOT mutate the input array.
 */
export function sortGames(
  games: GameRecord[],
  sortOption: SortOption,
  ratings: Map<string, GameRatingSummary>
): GameRecord[] {
  const copy = [...games]

  switch (sortOption) {
    case 'highest-rated':
      return copy.sort((a, b) => {
        const ratingA = ratings.get(a.id)
        const ratingB = ratings.get(b.id)

        const avgA = ratingA?.averageRating ?? null
        const avgB = ratingB?.averageRating ?? null

        const isRatedA = avgA !== null
        const isRatedB = avgB !== null

        // Unrated games go to the end
        if (isRatedA && !isRatedB) return -1
        if (!isRatedA && isRatedB) return 1

        // Both unrated: alphabetical by game_name (case-insensitive)
        if (!isRatedA && !isRatedB) {
          return a.game_name.toLowerCase().localeCompare(b.game_name.toLowerCase())
        }

        // Both rated: descending by averageRating
        if (avgA! !== avgB!) {
          return avgB! - avgA!
        }

        // Tiebreak: descending by ratingCount
        const countA = ratingA?.ratingCount ?? 0
        const countB = ratingB?.ratingCount ?? 0
        return countB - countA
      })

    case 'most-played':
      return copy.sort((a, b) => {
        // Descending by times_played
        if (a.times_played !== b.times_played) {
          return b.times_played - a.times_played
        }

        // Tiebreak: ascending alphabetical by game_name (case-insensitive)
        return a.game_name.toLowerCase().localeCompare(b.game_name.toLowerCase())
      })

    case 'default':
    default:
      return copy
  }
}
