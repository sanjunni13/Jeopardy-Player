# Game Scoring & Special Toggles System

## Purpose

The Game Scoring & Special Toggles System provides a modular, composable set of gameplay modifiers that alter how points are earned and lost during a game. It handles all score delta computation — including the complex logic of marking reversals — through a single authoritative function (`applyModifiers`), ensuring scoring is always consistent regardless of which combination of toggles is active.

## Architecture Overview

### Design Principles

1. **Single source of truth**: All scoring flows through `applyModifiers()` — no ad-hoc score calculations elsewhere
2. **Immutable config**: `ToggleConfig` is frozen at game start and never mutated during play
3. **Atomic reversals**: Changing a marking automatically undoes the previous delta before applying the new one
4. **Pure functions**: All scoring utilities are side-effect-free, making them ideal for property-based testing

### Toggle Composition Rules

| Toggle | Composes With | Mutually Exclusive With |
|--------|--------------|------------------------|
| Co-op Mode | Wagering, Timed Clues | Rules Engine |
| Wagering Mode | Co-op, Rules Engine, Timed Clues | — |
| Rules Engine | Wagering, Timed Clues | Co-op Mode |
| Timed Clues | Co-op, Wagering, Rules Engine | — |

When Co-op is enabled, the Rules Engine section is disabled, hidden, and its config resets to defaults.

## Key Files

| File | Responsibility |
|------|---------------|
| `src/utils/gameToggles.ts` | Core scoring logic: `applyModifiers()`, all helper functions |
| `src/utils/coopScoring.ts` | Co-op-specific scoring: board total, target score, pool deltas |
| `src/utils/clueValues.ts` | Clue value calculations per round |
| `src/hooks/useClueTimer.ts` | Countdown timer for Timed Clue Responses |
| `src/types/game.ts` | `ToggleConfig`, `CoopConfig`, `WageringConfig`, `RulesEngineConfig`, `TimedClueConfig` |

## Toggle Details

### Wagering Mode (`WageringConfig`)

```typescript
interface WageringConfig {
  enabled: boolean
  wagerFloor: number  // integer 1-10000, default 100
}
```

**Behavior**: Before each clue, players choose how much to wager. The wager replaces the clue's fixed cell value for all scoring calculations.

**Wager Range Computation** (`computeWagerRange`):
- `score > wagerFloor` → range is `[wagerFloor, score]`
- `score ≤ 0` → range is `[1, wagerFloor]` (allows participation with low/negative scores)

### Rules Engine (`RulesEngineConfig`)

Contains three sub-modifiers:

#### Steal Bonus (`StealBonusConfig`)
```typescript
interface StealBonusConfig {
  enabled: boolean
  bonusPoints: number  // integer 1-5000, default 200
}
```

**Condition** (`checkStealCondition`): Awards `bonusPoints` to a correct player if at least one *other* player has an `'incorrect'` marking on the same clue. The bonus is additive on top of the multiplied base value.

#### Streak Multiplier (`StreakMultiplierConfig`)
```typescript
interface StreakMultiplierConfig {
  enabled: boolean
  threshold: number    // integer 2-5, default 3
  multiplier: number   // integer 2-5, default 2
}
```

**Behavior**: 
- `updateStreakCount(prev, result)`: Increments on `'correct'`, resets to 0 on `'incorrect'` or `null`
- `computeStreakMultiplier(streakCount, threshold, multiplier)`: Returns `multiplier` when `streakCount >= threshold`, else `1`

The multiplier is applied to the base value before the steal bonus is added.

#### Penalty Doubler (`PenaltyDoublerConfig`)
```typescript
interface PenaltyDoublerConfig {
  enabled: boolean  // no additional configuration
}
```

**Behavior** (`computePenaltyDoubler`): Always doubles the deduction on incorrect answers: `deduction = value × 2`.

### Timed Clues (`TimedClueConfig`)

```typescript
interface TimedClueConfig {
  enabled: boolean
  timerDuration: number  // integer 5-120, default 30
}
```

**Behavior**: A countdown starts when a clue is displayed. When it reaches 0, `onExpire` fires and the buzzer system locks. The `useClueTimer` hook manages the interval, decrementing every second.

**Timer Hook Features**:
- `remaining`: Current seconds left
- `isRunning`: Whether the timer is active
- `stop()`: Pauses without resetting
- `reset()`: Stops and resets to duration
- `onTick` callback: Fires every second with current remaining (used for display broadcast)

### Co-op Mode (`CoopConfig`)

```typescript
interface CoopConfig {
  enabled: boolean
  targetPercentage: number  // integer 50-100, default 75
}
```

**Purpose**: All players share a single score pool instead of competing individually. The team wins if the pool reaches a configurable target threshold by game end. Ideal for classrooms, icebreakers, or groups where competition isn't appropriate.

**Key Functions** (`coopScoring.ts`):
- `calculateBoardTotal(game)`: Sum of all clue values across all rounds (excludes FJ)
- `calculateTargetScore(boardTotal, targetPercentage)`: `Math.floor(boardTotal × targetPercentage / 100)`
- `applyCoopScoring(opts)`: Reverses previous marking + applies new marking to pool
- `getCoopDailyDoubleMaxWager(teamPool)`: `Math.max(teamPool, 1000)` when pool > 0, else `1000`

**Victory Condition**: `teamPool >= targetScore`

The pool can go negative — this is intentional and allows dramatic comebacks.

#### Co-op Mode In-Depth

**Initialization** (when host clicks "Play"):
1. `calculateBoardTotal(game)` sums all clue values across all rounds
2. `calculateTargetScore(boardTotal, config.coop.targetPercentage)` computes the target
3. `GameSession` is initialized with `teamPool: 0`, `targetScore`, and `boardTotal`

**Scoring Flow** (`GamePage.handleMark` when co-op is active):
1. Player buzzes in and host marks them correct/incorrect (standard buzzer flow)
2. Instead of calling `applyModifiers()`, calls `applyCoopScoring()`:
   - Reverses any previous marking on this player for this clue
   - Applies new marking: +baseValue (correct) or -baseValue (incorrect)
   - Returns `{ poolDelta, newPool }`
3. `session.teamPool` updated with `newPool`
4. Individual player stats still tracked (`correctCount`, `incorrectCount`, `totalEarned`) for analytics
5. Broadcasts `coop_pool_update` message to all connected player devices

**Composition with Other Toggles**:
- **Co-op + Wagering**: The wager amount replaces the clue's base value for pool calculations. Each player's wager determines how much is added/deducted from the pool for their answer.
- **Co-op + Timed Clues**: Timer locks the buzzer system at zero exactly as in competitive mode. No special interaction with co-op scoring.
- **Co-op + Rules Engine**: MUTUALLY EXCLUSIVE. When co-op is enabled, the Rules Engine section is hidden, disabled, and reset to defaults. Competitive-only modifiers (steal bonus, streak multiplier, penalty doubler) don't apply in collaborative play.

**Daily Doubles in Co-op**:
- The DD max wager is `Math.max(teamPool, 1000)` when `teamPool > 0`
- If `teamPool ≤ 0`, max wager is `$1000` (allows team to recover from negative)
- DD result adds to or deducts from the team pool, not an individual score

**Final Jeopardy in Co-op** (see detailed doc in `06-final-jeopardy.md`):
- Host enters a single team wager (max = `Math.max(teamPool, 1000)`)
- All players can still submit individual answers via their devices for discussion
- Host views all submitted answers and makes ONE collective correct/incorrect judgment
- Result adjusts `teamPool` by the wager amount

**Game Over**:
- Victory: `teamPool >= targetScore` → "Team Victory! 🎉" heading + confetti
- Defeat: `teamPool < targetScore` → "Team Defeat 😔" heading, no confetti
- Contribution table shows each player's correct count, incorrect count, and net contribution
- Leaderboard submission is **skipped entirely** — no `updateGameStats()` call
- Only `incrementTimesPlayed()` is called on the game record

**Edge Cases**:
- `boardTotal` is 0 → target is 0, team wins by default
- Single-player co-op → valid; one player plays against the board solo
- `teamPool` goes deeply negative → progress bar clamps to 0% visually, but numeric display shows actual value

#### Buzzing in Co-op Mode

The buzzer system is **completely unchanged** in co-op mode. All buzzer mechanics work identically to competitive play:

1. **First buzz wins**: When a clue is activated, all players race to buzz in. The first buzz (by timestamp) goes to the front of the queue.
2. **Lockout on incorrect**: If a player answers incorrectly, they are added to the `lockedOut` list and cannot buzz again for that clue. Other players can still attempt.
3. **System lock/unlock**: The host can manually lock or unlock the buzzer system at any time.
4. **Timed clues**: If Timed Clues toggle is active, the countdown locks buzzers at zero.
5. **Queue clearing**: When the host moves on (returns to board), the queue is cleared and lockouts are reset for the next clue.

The only difference is what happens AFTER the host marks a player's answer:
- Competitive: `applyModifiers()` adjusts that player's individual score
- Co-op: `applyCoopScoring()` adjusts the shared `teamPool`

Individual player `Player.score` fields are set to 0 and unused for display in co-op mode. The `CoopScoreboard` shows the team pool instead of individual scores. However, `correctCount`, `incorrectCount`, and `totalEarned` are still tracked per-player for the contribution table in `CoopGameOver`.

## The `applyModifiers()` Function

This is the authoritative scoring entry point. It handles all toggle interactions atomically.

### Formula for a Correct Marking

```
base       = wagering.enabled ? wager : baseValue
multiplied = (streakMultiplier.enabled && newStreak >= threshold)
               ? base × multiplier
               : base
delta      = (stealBonus.enabled && stealConditionMet)
               ? multiplied + bonusPoints
               : multiplied
```

### Formula for an Incorrect Marking

```
base      = wagering.enabled ? wager : baseValue
deduction = penaltyDoubler.enabled ? base × 2 : base
delta     = -deduction
```

### Marking Reversals

When `prevMarking` is non-null, the function:
1. Computes what delta was originally applied for the previous marking
2. Subtracts that delta (undoes it)
3. Applies the new marking's delta
4. Returns the net `scoreDelta`

This ensures changing a marking from `correct` → `incorrect` (or vice versa) is handled as a single atomic operation.

### Return Value

```typescript
interface ApplyModifiersResult {
  scoreDelta: number              // Net points to add to player's score
  newStreakCount: number           // Updated consecutive correct count
  newPerRoundIncorrect: number    // Updated per-round incorrect count
  stealBonusApplied: boolean      // Whether steal bonus was awarded
}
```

## State Tracked Per Game Session

```typescript
// In GameSession:
toggleConfig: ToggleConfig           // Frozen at game-start
streakCounts: Record<string, number> // Per-player consecutive correct count
perRoundIncorrect: Record<string, number> // Per-player incorrect count (resets each round)
activeWagers: Record<string, number> | null // Wagers for current clue (null when not wagering)
teamPool: number                     // Co-op score pool
targetScore: number                  // Co-op target
boardTotal: number                   // Sum of all clue values
```

## Dependencies

| Package | Usage |
|---------|-------|
| (none external) | Pure TypeScript — no external dependencies for scoring logic |

## Related UI Components

- `src/components/game/GameSettingsPanel.tsx` — Pre-game toggle configuration UI
- `src/components/game/CoopScoreboard.tsx` — Team pool display with progress bar
- `src/components/game/CoopGameOver.tsx` — Victory/defeat screen for co-op games
- `src/components/game/WagerEntry.tsx` — Wagering mode input UI
- `src/components/game/ActiveRulesIndicator.tsx` — Shows active toggle labels during gameplay
- `src/components/game/Scoreboard.tsx` — Competitive scoreboard (non-co-op)
- `src/components/game/DailyDoubleWager.tsx` — DD wager input (respects toggle rules)

## UX Interactions

- Toggle configuration happens during the **Player Entry** phase before gameplay begins
- The `GameSettingsPanel` enforces mutual exclusivity (enabling co-op disables rules engine)
- Active toggles are displayed as labels via `ActiveRulesIndicator` during gameplay
- Scores animate in real time as markings are applied (framer-motion transitions)
- Timed clues show a visible countdown that changes color: white → yellow (10s) → red (5s)
