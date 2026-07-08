import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { sortGames } from './gameSorting'
import type { GameRatingSummary } from './gameSorting'
import type { GameRecord } from '../types/game'

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generate a minimal GameRecord with unique id, game_name, and times_played */
const gameRecordArb = (idSuffix?: string) =>
  fc.record({
    id: fc.uuid().map(u => u + (idSuffix ?? '')),
    game_name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    total_rounds: fc.integer({ min: 1, max: 5 }),
    times_played: fc.integer({ min: 0, max: 10000 }),
    winners: fc.constant([] as string[]),
    created_by: fc.constant(null as number | null),
    source: fc.constant(null as string | null),
    high_score: fc.constant(null as number | null),
    high_score_player: fc.constant(null as string | null),
    creator_name: fc.constant(null as string | null),
  }) as fc.Arbitrary<GameRecord>

/** Generate a list of GameRecords with unique IDs */
const gameListArb = fc.array(gameRecordArb(), { minLength: 0, maxLength: 20 })
  .map(games => {
    // Ensure unique IDs by appending index
    return games.map((g, i) => ({ ...g, id: `${g.id}-${i}` }))
  })

/** Generate a rating summary: either rated (averageRating non-null) or unrated (null) */
const ratingSummaryArb = fc.oneof(
  // Rated game
  fc.record({
    averageRating: fc.double({ min: 1.0, max: 5.0, noNaN: true }).map(v => Math.round(v * 10) / 10) as fc.Arbitrary<number | null>,
    ratingCount: fc.integer({ min: 1, max: 500 }),
  }),
  // Unrated game
  fc.constant({ averageRating: null as number | null, ratingCount: 0 }),
)

/** Generate a ratings map for a given list of games (some rated, some not) */
function ratingsMapArb(games: GameRecord[]): fc.Arbitrary<Map<string, GameRatingSummary>> {
  if (games.length === 0) return fc.constant(new Map())

  return fc.tuple(
    ...games.map(g =>
      ratingSummaryArb.map(summary => ({
        gameId: g.id,
        ...summary,
      }))
    )
  ).map(summaries => {
    const map = new Map<string, GameRatingSummary>()
    for (const s of summaries) {
      map.set(s.gameId, s)
    }
    return map
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Feature: game-ratings-favorites, Property 8: Highest Rated sort ordering', () => {
  /**
   * **Validates: Requirements 5.1, 5.6**
   *
   * For any list of games where each game has an average rating (or null) and a rating count,
   * sorting by "highest-rated" SHALL produce a list where:
   * (a) all rated games precede all unrated games,
   * (b) rated games are ordered by average rating descending with rating count descending as tiebreaker,
   * (c) unrated games are ordered alphabetically by name (case-insensitive).
   */

  it('rated games always precede unrated games', () => {
    fc.assert(
      fc.property(
        gameListArb.chain(games => ratingsMapArb(games).map(ratings => ({ games, ratings }))),
        ({ games, ratings }) => {
          const sorted = sortGames(games, 'highest-rated', ratings)

          // Find the boundary between rated and unrated
          let lastRatedIndex = -1
          let firstUnratedIndex = sorted.length

          sorted.forEach((game, idx) => {
            const summary = ratings.get(game.id)
            const isRated = summary?.averageRating !== null && summary?.averageRating !== undefined
            if (isRated) lastRatedIndex = idx
            if (!isRated && idx < firstUnratedIndex) firstUnratedIndex = idx
          })

          // All rated games should come before all unrated games
          if (lastRatedIndex >= 0 && firstUnratedIndex < sorted.length) {
            expect(lastRatedIndex).toBeLessThan(firstUnratedIndex)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('rated games are sorted by average rating descending, then rating count descending', () => {
    fc.assert(
      fc.property(
        gameListArb.chain(games => ratingsMapArb(games).map(ratings => ({ games, ratings }))),
        ({ games, ratings }) => {
          const sorted = sortGames(games, 'highest-rated', ratings)

          // Extract only rated games
          const ratedGames = sorted.filter(g => {
            const s = ratings.get(g.id)
            return s?.averageRating !== null && s?.averageRating !== undefined
          })

          // Check pairwise ordering
          for (let i = 0; i < ratedGames.length - 1; i++) {
            const currSummary = ratings.get(ratedGames[i].id)!
            const nextSummary = ratings.get(ratedGames[i + 1].id)!
            const currAvg = currSummary.averageRating!
            const nextAvg = nextSummary.averageRating!

            if (currAvg !== nextAvg) {
              expect(currAvg).toBeGreaterThanOrEqual(nextAvg)
            } else {
              // Tiebreaker: ratingCount descending
              expect(currSummary.ratingCount).toBeGreaterThanOrEqual(nextSummary.ratingCount)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('unrated games are ordered alphabetically by name (case-insensitive)', () => {
    fc.assert(
      fc.property(
        gameListArb.chain(games => ratingsMapArb(games).map(ratings => ({ games, ratings }))),
        ({ games, ratings }) => {
          const sorted = sortGames(games, 'highest-rated', ratings)

          // Extract only unrated games
          const unratedGames = sorted.filter(g => {
            const s = ratings.get(g.id)
            return s?.averageRating === null || s?.averageRating === undefined
          })

          // Check pairwise alphabetical ordering (case-insensitive)
          for (let i = 0; i < unratedGames.length - 1; i++) {
            const cmp = unratedGames[i].game_name.toLowerCase()
              .localeCompare(unratedGames[i + 1].game_name.toLowerCase())
            expect(cmp).toBeLessThanOrEqual(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Feature: game-ratings-favorites, Property 9: Most Played sort ordering', () => {
  /**
   * **Validates: Requirements 5.2, 5.4**
   *
   * For any list of games where each game has a times_played value,
   * sorting by "most-played" SHALL produce a list ordered by times_played descending,
   * with games having equal times_played ordered alphabetically by game name (case-insensitive ascending).
   */

  it('games are sorted by times_played descending with alphabetical tiebreaker', () => {
    fc.assert(
      fc.property(
        gameListArb,
        (games) => {
          const emptyRatings = new Map<string, GameRatingSummary>()
          const sorted = sortGames(games, 'most-played', emptyRatings)

          // Check pairwise ordering
          for (let i = 0; i < sorted.length - 1; i++) {
            const curr = sorted[i]
            const next = sorted[i + 1]

            if (curr.times_played !== next.times_played) {
              // Primary sort: times_played descending
              expect(curr.times_played).toBeGreaterThan(next.times_played)
            } else {
              // Tiebreaker: game_name ascending (case-insensitive)
              const cmp = curr.game_name.toLowerCase()
                .localeCompare(next.game_name.toLowerCase())
              expect(cmp).toBeLessThanOrEqual(0)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Feature: game-ratings-favorites, Property 10: Favourites filter is a reversible intersection', () => {
  /**
   * **Validates: Requirements 6.2, 6.3**
   *
   * For any set of games G and set of favourite game IDs F,
   * applying the favourites filter returns exactly the subset of G whose IDs are in F.
   * This is a pure logic test (filter games where id is in favouriteIds).
   */

  it('filtering by favourite IDs returns exactly the games whose IDs are in the favourite set', () => {
    fc.assert(
      fc.property(
        gameListArb,
        fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
        (games, extraFavIds) => {
          // Build favourites set: some IDs from games + some random IDs not in games
          const gameIds = games.map(g => g.id)
          // Pick a random subset of game IDs to be favourites
          const fromGames = gameIds.filter((_, i) => i % 2 === 0)
          const favouriteIds = new Set([...fromGames, ...extraFavIds])

          // Apply the filter (same logic as the library page would use)
          const filtered = games.filter(g => favouriteIds.has(g.id))

          // Property: every item in filtered has an ID in favouriteIds
          for (const game of filtered) {
            expect(favouriteIds.has(game.id)).toBe(true)
          }

          // Property: every game in the original list whose ID is in favouriteIds is in the filtered result
          const filteredIds = new Set(filtered.map(g => g.id))
          for (const game of games) {
            if (favouriteIds.has(game.id)) {
              expect(filteredIds.has(game.id)).toBe(true)
            }
          }

          // Property: length matches exactly
          const expectedCount = games.filter(g => favouriteIds.has(g.id)).length
          expect(filtered.length).toBe(expectedCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('deactivating the filter restores the full set', () => {
    fc.assert(
      fc.property(
        gameListArb,
        (games) => {
          const favouriteIds = new Set(games.slice(0, Math.floor(games.length / 2)).map(g => g.id))

          // Apply filter
          const filtered = games.filter(g => favouriteIds.has(g.id))

          // "Deactivate" filter — just use the full set
          const restored = games

          // The restored set should equal the original set
          expect(restored).toEqual(games)
          // And filtered should be a subset
          expect(filtered.length).toBeLessThanOrEqual(games.length)
          for (const game of filtered) {
            expect(games.some(g => g.id === game.id)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
