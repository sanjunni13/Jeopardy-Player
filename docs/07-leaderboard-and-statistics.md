# Leaderboard & Player Statistics System

## Purpose

The Leaderboard system tracks cumulative player performance across all games — wins, accuracy, Daily Double success, Final Jeopardy performance, and earnings — providing a persistent competitive meta-layer that spans individual game sessions. It motivates repeat play by surfacing lifetime stats and enabling players to compare themselves against others.

## Architecture Overview

```
Game Ends → updateGameStats()
                │
                ├── Update `games` table (times_played, winners, high_score)
                │
                └── For each player:
                        ├── Authenticated player → update by Player ID
                        ├── Existing player (by name) → update by name match
                        └── New player → INSERT new row
                                │
                                └── All update: games_played, games_won,
                                    correct/incorrect answers, DD stats,
                                    FJ stats, balance, total_earned

LeaderboardPage.tsx
    │
    ├── fetchAllPlayers() → players table
    ├── sortPlayers(column, direction)
    └── Render LeaderboardTable with SortableColumnHeaders
```

## Key Files

| File | Responsibility |
|------|---------------|
| `src/utils/leaderboardApi.ts` | `fetchAllPlayers()` — retrieves all rows from `players` table |
| `src/utils/leaderboardUtils.ts` | Sorting, rate computation, currency formatting |
| `src/utils/gameApi.ts` | `updateGameStats()` — post-game stat updates |
| `src/components/leaderboard/LeaderboardTable.tsx` | Table display component |
| `src/components/leaderboard/SortableColumnHeader.tsx` | Column header with sort toggle |
| `src/routes/pages/LeaderboardPage.tsx` | Leaderboard page |

## Player Stats Model

```typescript
interface PlayerRow {
  id: string
  player_name: string
  total_games_played: number
  total_games_won: number
  total_correct_answers: number
  total_incorrect_answers: number
  total_correct_daily_doubles: number
  total_incorrect_daily_doubles: number
  total_correct_final_jeopardies: number
  total_incorrect_final_jeopardies: number
  current_balance: number          // Cumulative net score across all games
  total_money_earned: number       // Sum of all correct clue values (always positive)
}
```

## Derived Statistics

| Stat | Formula |
|------|---------|
| Win Rate | `total_games_won / total_games_played × 100` |
| Accuracy Rate | `total_correct_answers / (total_correct + total_incorrect) × 100` |
| FJ Accuracy Rate | `total_correct_fj / (total_correct_fj + total_incorrect_fj) × 100` |

The `computeRate(numerator, denominator)` function returns 0 when denominator is 0 (avoids division by zero).

## Sortable Columns

```typescript
type SortableColumn =
  | 'player_name'
  | 'win_rate'
  | 'total_games_played'
  | 'accuracy_rate'
  | 'fj_accuracy_rate'
  | 'total_money_earned'
  | 'current_balance'
```

- Sorting is performed client-side
- Ties are broken by `player_name` ascending (A-Z)
- Sort direction toggles between `asc` and `desc`

## Post-Game Stats Update Flow (`updateGameStats`)

### For Authenticated Players (by Player ID)
1. Extract authenticated player's `playerId` from their profile
2. Look up the player row directly by ID
3. Increment all relevant counters
4. Update `current_balance` by adding the game's final score

### For Non-Authenticated Players (by Name Match)
1. Case-insensitive search in `players` table by `player_name`
2. If found: increment counters on the existing row
3. If NOT found: INSERT a new row with initial stats from this game

### Stat Fields Updated
- `total_games_played` += 1
- `total_games_won` += 1 (if player is in `winnerNames`)
- `total_correct_answers` += player.correctCount
- `total_incorrect_answers` += player.incorrectCount
- `total_correct_daily_doubles` += player.correctDailyDoubles
- `total_incorrect_daily_doubles` += player.incorrectDailyDoubles
- `total_correct_final_jeopardies` += player.correctFinalJeopardy
- `total_incorrect_final_jeopardies` += player.incorrectFinalJeopardy
- `current_balance` += player.score
- `total_money_earned` += player.totalEarned

### Co-op Games

When co-op mode is active, leaderboard submission is **skipped entirely** (`updateGameStats` is not called). Only `incrementTimesPlayed()` is called on the game itself. Individual tracking still works (correctCount, incorrectCount) for display in `CoopGameOver`, but these don't persist to the leaderboard.

## Balance Mechanics

- `current_balance`: The cumulative net score across all games. Can go negative if a player has more losses than wins.
- `total_money_earned`: Only counts positive earnings (correct answers). Never decreases.
- Currency formatting: `formatCurrency(value)` → displays as `$X,XXX` or `-$X,XXX` for negative values.

## Dependencies

| Package | Usage |
|---------|-------|
| `@supabase/supabase-js` | Database queries to `players` table |

## Related UI Components

- `src/routes/pages/LeaderboardPage.tsx` — Full-page leaderboard view
- `src/components/leaderboard/LeaderboardTable.tsx` — Sortable table with all stats
- `src/components/leaderboard/SortableColumnHeader.tsx` — Clickable column headers with sort indicators

## UX Interactions

- **View leaderboard**: Accessible from the main navigation
- **Sort columns**: Click any column header to sort by that stat (toggles asc/desc)
- **Win rate display**: Shown as percentage with colored indicator
- **Currency display**: Formatted with $ sign and comma separators
- **New player creation**: Happens transparently — first-time players are auto-added to the leaderboard after their first game
- **AbortSignal support**: `fetchAllPlayers` accepts an optional AbortSignal for request cancellation when navigating away
