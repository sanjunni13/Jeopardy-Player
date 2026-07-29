# Ratings & Favorites System

## Purpose

The Ratings & Favorites system allows players to rate games (1-5 stars) and bookmark their favorites, creating personalized collections and surfacing community quality signals in the Game Library. Ratings are aggregated into average scores displayed on game cards, helping players discover high-quality games.

## Architecture Overview

```
Player Action
    │
    ├── Rate a game (1-5 stars)
    │       │
    │       └── upsertRating(playerId, gameId, rating)
    │               └── INSERT or UPDATE in game_ratings table
    │                       (unique constraint: player_id + game_id)
    │
    └── Favorite / Unfavorite a game
            │
            ├── addFavorite(playerId, gameId)
            │       └── INSERT into game_favorites (duplicate = success)
            │
            └── removeFavorite(playerId, gameId)
                    └── DELETE from game_favorites
```

### Rating Aggregation for Library Display

```
GameLibraryPage loads
    │
    └── fetchGameRatings(gameIds[])
            │
            ├── SELECT all ratings for these game IDs
            ├── Group by game_id
            ├── Compute average (rounded to 1 decimal)
            └── Return GameRatingSummary[] for each game
```

## Key Files

| File | Responsibility |
|------|---------------|
| `src/utils/ratingsApi.ts` | `upsertRating()`, `fetchMyRating()`, `fetchGameRatings()` |
| `src/utils/favoritesApi.ts` | `addFavorite()`, `removeFavorite()`, `fetchFavorites()` |
| `src/hooks/useRating.ts` | Hook for managing a player's rating on a specific game |
| `src/hooks/useGameRatings.ts` | Hook for fetching batch rating summaries |
| `src/hooks/useFavorite.ts` | Hook for toggle favorite state |
| `src/components/StarRating.tsx` | Interactive 1-5 star input component |
| `src/components/StarRating.css` | Star rating styling |
| `src/components/RatingPrompt.tsx` | Post-game rating prompt |
| `src/components/RatingPrompt.css` | Rating prompt styling |
| `src/components/FavoriteToggle.tsx` | Heart icon toggle |
| `src/components/FavoriteToggle.css` | Favorite toggle styling |
| `src/components/AverageRatingBadge.tsx` | Display average + count |

## Ratings API

### `upsertRating(playerId, gameId, rating)`

- **Validation**: Rating must be integer 1-5 (rejected client-side otherwise)
- **Behavior**: Uses Supabase `upsert` with conflict on `(player_id, game_id)` — creates or updates
- **Returns**: `{ success: boolean; error?: string }`

### `fetchMyRating(playerId, gameId)`

- Fetches the current player's rating for a specific game
- Returns the rating value (1-5) or `null` if no rating exists
- Requires active auth session

### `fetchGameRatings(gameIds[])`

- Batch-fetches ratings for multiple games in one query
- Groups ratings by `game_id`, computes averages
- Average rounded to 1 decimal place: `Math.round((sum / count) * 10) / 10`
- Returns `GameRatingSummary[]` — games with no ratings get `{ averageRating: null, ratingCount: 0 }`
- Gracefully handles empty input, auth failure, and network errors

```typescript
interface GameRatingSummary {
  gameId: string
  averageRating: number | null  // null = no ratings yet
  ratingCount: number
}
```

## Favorites API

### `addFavorite(playerId, gameId)`

- Inserts into `game_favorites` table
- Duplicate key (Postgres error code `23505`) treated as success (already favorited)
- Returns: `{ success: boolean; error?: string }`

### `removeFavorite(playerId, gameId)`

- Deletes matching row from `game_favorites`
- Returns: `{ success: boolean; error?: string }`

### `fetchFavorites(playerId)`

- Returns array of favorited game IDs (`string[]`)
- Requires active auth session (RLS-protected table)
- Returns empty array on any failure (graceful degradation)

## Database Tables

### `game_ratings`
```
id: number (PK)
player_id: number (FK → players.id)
game_id: string (FK → games.id)
rating: number (1-5)
created_at: timestamp
UNIQUE(player_id, game_id)
```

### `game_favorites`
```
id: number (PK)
player_id: number (FK → players.id)
game_id: string (FK → games.id)
created_at: timestamp
UNIQUE(player_id, game_id)
```

## Dependencies

| Package | Usage |
|---------|-------|
| `@supabase/supabase-js` | Database queries with RLS |

## Related UI Components

- `src/components/StarRating.tsx` — Interactive star rating (hover + click)
- `src/components/RatingPrompt.tsx` — Modal/inline prompt shown after game completion
- `src/components/FavoriteToggle.tsx` — Heart icon that toggles filled/outline
- `src/components/AverageRatingBadge.tsx` — Read-only display: "★ 4.2 (12 ratings)"
- `src/components/GameDetailsDialog.tsx` — Shows rating + allows inline rating
- `src/routes/pages/GameLibraryPage.tsx` — Displays average ratings on game cards

## UX Interactions

- **Star rating input**: Hover preview (stars light up), click to confirm. Stars are interactive on game detail view and post-game prompt.
- **Rating prompt**: Appears after game ends (competitive mode). "How was this game?" with star selector.
- **Upsert behavior**: Clicking a different star count updates the rating seamlessly (no "save" button).
- **Favorite toggle**: Tap heart icon on any game card → instant visual feedback (filled heart). Tap again to unfavorite.
- **Average badge**: Non-interactive display on game cards. Shows star icon + average value + "(N ratings)".
- **Filter by favorites**: Library can filter to show only favorited games.
- **Graceful degradation**: If rating/favorite APIs fail, UI still renders (just without rating data).
