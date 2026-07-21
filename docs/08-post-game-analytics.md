# Post-Game Analytics System

## Purpose

The Post-Game Analytics system provides rich, visual breakdowns of player performance after a game ends. It computes score timelines, category accuracy, Daily Double analysis, comeback metrics, loss streaks, and head-to-head comparisons — giving players detailed insight into how they performed and enabling friendly competition through data.

## Architecture Overview

```
Game Over → computeAllAnalytics(session) → ComputedAnalytics
                                                │
                                                ├── Score Timelines (per player)
                                                ├── Category Accuracy (per player)
                                                ├── Enriched Daily Double Records
                                                ├── Biggest Comebacks
                                                ├── Longest Loss Streaks
                                                └── Head-to-Head Comparisons

AnalyticsScreen.tsx
    ├── ScoreTimelineChart.tsx (Recharts line chart)
    ├── CategoryAccuracy.tsx (bar/table display)
    ├── DailyDoubleBreakdown.tsx (DD performance cards)
    ├── BiggestComeback.tsx (comeback metrics)
    ├── LongestLossStreak.tsx (loss streak display)
    ├── HeadToHead.tsx (pairwise comparison cards)
    └── ClueHeatmap.tsx (board coverage grid)
```

## Key Files

| File | Responsibility |
|------|---------------|
| `src/utils/analyticsUtils.ts` | All analytics computation (pure functions) |
| `src/utils/heatmapUtils.ts` | Heatmap grid coordinate mapping |
| `src/utils/exportGamePdf.ts` | PDF export of game results |
| `src/utils/imageExporter.ts` | Image export (HTML-to-image) |
| `src/components/game/AnalyticsScreen.tsx` | Main analytics view (competitive games) |
| `src/components/game/CoopGameOver.tsx` | Co-op end screen with contribution table |

## Analytics Computed

### 1. Score Timelines (`computeScoreTimeline`)

Per-player sequence of `(ordinal, cumulative score)` points representing score progression throughout the game.

- First point is always `{ ordinal: 0, score: 0 }`
- One point per non-null marking (correct or incorrect), in board order
- Daily Doubles use the actual wager value (from `DailyDoubleRecord`)
- Final Jeopardy delta appended as the last point (if player participated)

Used for: Line chart showing score progression over time.

### 2. Category Accuracy (`computeCategoryAccuracy`)

Per-player breakdown of correct vs. total attempts by category.

- Same-named categories across different rounds are aggregated
- Categories with zero markings for a player are omitted
- Final Jeopardy included as a separate "category" row when applicable

Used for: Bar chart or table showing strengths/weaknesses by topic.

### 3. Enriched Daily Double Records (`enrichDailyDoubleRecords`)

Adds human-readable context to raw DD records:
- `roundDisplayName`: e.g., "Single Jeopardy", "Double Jeopardy"
- `categoryName`: The actual category name from game data
- `clueValue`: Face value of the DD clue
- `netImpact`: `+wager` if correct, `-wager` if incorrect

Output length always equals input length (1:1 mapping).

### 4. Biggest Comebacks (`computeBiggestComebacks`)

For each player: `delta = finalScore - lowestScore` (capped at 0 minimum).

- Sorted by descending delta
- Caller filters for `delta > 0` before displaying
- Shows the magnitude of a player's recovery from their worst point

### 5. Longest Loss Streaks (`computeLongestLossStreaks`)

Finds the longest consecutive run of score-decreasing events for each player.

- `streakLength`: Number of consecutive incorrect answers
- `totalLost`: Sum of negative deltas across the streak
- `lowestScore`: Score at the end of the streak
- Only includes players with `streakLength >= 2`
- Sorted by descending streakLength, then descending totalLost

### 6. Head-to-Head Comparisons (`computeHeadToHead`)

Generates all unique unordered player pairs (n×(n-1)/2 total).

For each pair:
- Correct/incorrect counts for both players
- Daily Double attempts and wins for both
- Final scores
- Players ordered alphabetically within each pair

Only computed when 2+ players participated.

### 7. Clue Heatmap

Uses `heatmapUtils.ts` to map clue states to a grid visualization showing which clues were attempted, by whom, and with what result. Visualizes board coverage.

## Entry Point

```typescript
function computeAllAnalytics(session: GameSession): ComputedAnalytics {
  // Calls all individual analytics functions and aggregates results
  // Returns: sortedPlayers, scoreTimelines, categoryAccuracy,
  //          dailyDoubleRecordsEnriched, biggestComebacks,
  //          longestLossStreaks, headToHeads
}
```

## Export Capabilities

### PDF Export (`exportGamePdf.ts`)

Generates a print-ready PDF with:
- Game title and date
- Final standings with scores
- Answer key (all clues and solutions)
- Per-player breakdowns

For co-op games: team result, pool vs. target, contribution table.

### Image Export (`imageExporter.ts`)

Uses `html-to-image` to capture DOM elements as shareable images — useful for posting results to social media.

## Data Sources

The analytics system consumes the complete `GameSession` object:
- `game: NormalizedGame` — Board structure for category names and clue values
- `players: Player[]` — Final scores, correct/incorrect counts, FJ stats
- `orderedRoundNames: RoundName[]` — Round order for timeline computation
- `clueStates: Record<string, ClueState>` — Per-clue markings for all players
- `dailyDoubleRecords: DailyDoubleRecord[]` — Wager and outcome for each DD

## Dependencies

| Package | Usage |
|---------|-------|
| `recharts` | Line charts, bar charts for score timelines and accuracy |
| `jspdf` | PDF document generation |
| `jspdf-autotable` | Table formatting within PDFs |
| `html-to-image` | DOM-to-image capture for sharing |
| `canvas-confetti` | Victory confetti animation on game-over screen |

## Related UI Components

- `src/components/game/AnalyticsScreen.tsx` — Main analytics container (competitive)
- `src/components/game/ScoreTimelineChart.tsx` — Recharts line chart
- `src/components/game/CategoryAccuracy.tsx` — Accuracy breakdown display
- `src/components/game/DailyDoubleBreakdown.tsx` — DD performance cards
- `src/components/game/BiggestComeback.tsx` — Comeback metric display
- `src/components/game/LongestLossStreak.tsx` — Loss streak display
- `src/components/game/HeadToHead.tsx` — Pairwise comparison cards
- `src/components/game/ClueHeatmap.tsx` — Board coverage grid visualization
- `src/components/game/CoopGameOver.tsx` — Co-op variant with contribution table
- `src/components/game/GameOver.tsx` — Competitive game-over with analytics access

## UX Interactions

- **Auto-display**: Analytics screen appears automatically after game-over
- **Tabbed/sectioned layout**: Different analytics sections accessible via scrolling or tabs
- **Interactive charts**: Hover tooltips on Recharts visualizations show exact values
- **Player filtering**: Some views allow selecting a specific player to focus on
- **Export PDF**: Button generates and downloads a game report PDF
- **Share image**: Captures current view as an image for sharing
- **Confetti**: Winner announcement triggers canvas-confetti animation
- **Co-op variant**: Shows team contribution table instead of competitive rankings
