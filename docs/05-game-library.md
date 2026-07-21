# Game Library System

## Purpose

The Game Library is the central hub where users browse, search, filter, and manage their collection of Jeopardy games. It aggregates game metadata with rating summaries, favorite status, and play statistics — providing a complete view of every available game along with tools to discover, organize, and start playing them.

## Architecture Overview

```
GameLibraryPage.tsx
    │
    ├── Fetches game records from `games` table
    ├── Fetches rating summaries via fetchGameRatings()
    ├── Fetches favorites via fetchFavorites()
    │
    ├── Fuse.js fuzzy search (client-side)
    ├── Sorting via gameSorting.ts
    │
    ├── GameDetailsDialog.tsx (modal with full game info)
    └── RandomGamePicker (useRandomGamePicker hook)
```

### Data Model

```typescript
interface GameRecord {
  id: string
  game_name: string
  total_rounds: number
  times_played: number
  winners: string[]
  created_by: number | null      // FK → players.id
  source: string | null
  high_score: number | null
  high_score_player: string | null
  creator_name: string | null    // Joined from players table
}

// Extended with rating data for library display
interface GameRecordWithRating extends GameRecord {
  averageRating: number | null   // null if no ratings
  ratingCount: number
}
```

## Key Files

| File | Responsibility |
|------|---------------|
| `src/routes/pages/GameLibraryPage.tsx` | Main library page with search, sort, filter |
| `src/components/GameDetailsDialog.tsx` | Modal showing full game details |
| `src/components/GameDetailsDialog.css` | Dialog styling |
| `src/utils/gameSorting.ts` | Sorting logic for game lists |
| `src/utils/gameNameUtils.ts` | Game name formatting and display utilities |
| `src/utils/gameApi.ts` | `saveGame()`, `updateGameStats()`, `incrementTimesPlayed()` |
| `src/hooks/useRandomGamePicker.ts` | Random game selection logic |

## Search

The library uses **Fuse.js** for client-side fuzzy search. Games are indexed and searched as they're fetched — no server-side search endpoint needed.

**Searchable fields**: Game name, creator name, and potentially source field.

**Behavior**:
- Instant results as the user types
- Fuzzy matching tolerates typos
- Results are ranked by relevance score

## Sorting (`gameSorting.ts`)

Available sort options (inferred from the utility):
- Name (alphabetical A-Z / Z-A)
- Times played (most/least)
- Rating (highest/lowest)
- Total rounds
- Date created (newest/oldest)
- High score

Sorting is performed client-side on the full game list.

## Game Statistics

The following stats are tracked and updated after each game via `updateGameStats()`:

- `times_played` — Incremented after every completed game
- `winners` — Array of winner names appended after each game
- `high_score` — Highest individual score ever achieved
- `high_score_player` — Name of the high score holder

### Update Flow

```
Game Over → updateGameStats(gameId, players, winnerNames)
    │
    ├── Fetch current game row
    ├── Increment times_played
    ├── Append winnerNames to winners[]
    ├── Check if any player beat high_score
    └── Update games table
```

For co-op games, only `times_played` is incremented (via `incrementTimesPlayed()`), since individual rankings don't apply.

## Game Details Dialog

A modal that displays comprehensive information about a game:
- Game name, creator, source
- Number of rounds, times played
- High score and holder
- Average rating with star display
- Winner history
- Play / Delete actions

## Random Game Picker

The `useRandomGamePicker` hook provides a "surprise me" feature that selects a random game from the user's library. Useful for when users can't decide what to play.

## Dependencies

| Package | Usage |
|---------|-------|
| `fuse.js` | Client-side fuzzy search |
| `@supabase/supabase-js` | Database queries for games table |

## Related UI Components

- `src/routes/pages/GameLibraryPage.tsx` — Main page: grid/list view, search bar, sort controls
- `src/components/GameDetailsDialog.tsx` — Full game info modal
- `src/components/AverageRatingBadge.tsx` — Star rating display on game cards
- `src/components/FavoriteToggle.tsx` — Heart icon to favorite/unfavorite
- `src/components/StarRating.tsx` — Interactive star rating input
- `src/components/DeleteGameDialog.tsx` — Confirmation dialog for game deletion
- `src/components/GameCard.tsx` (in `src/components/game/`) — Card representation of a game in the library grid

## UX Interactions

- **Browse**: Games displayed in a responsive grid with cards showing name, rating, rounds, times played
- **Search**: Instant fuzzy search via input field at the top of the library
- **Sort**: Dropdown or toggle controls for sort field and direction
- **Details**: Clicking a game card opens the details dialog
- **Favorite**: Heart toggle on each card for quick add/remove from favorites
- **Rate**: Star rating accessible from the details dialog or post-game prompt
- **Random Pick**: Button to randomly select a game from the library
- **Delete**: Available in details dialog for games the user owns (with confirmation)
- **Play**: "Play" button in details dialog navigates to game page
