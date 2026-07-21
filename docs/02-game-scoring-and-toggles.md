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

**Purpose**: All players share a single score pool instead of competing individually.

**Key Functions** (`coopScoring.ts`):
- `calculateBoardTotal(game)`: Sum of all clue values across all rounds (excludes FJ)
- `calculateTargetScore(boardTotal, targetPercentage)`: `Math.floor(boardTotal × targetPercentage / 100)`
- `applyCoopScoring(opts)`: Reverses previous marking + applies new marking to pool
- `getCoopDailyDoubleMaxWager(teamPool)`: `Math.max(teamPool, 1000)` when pool > 0, else `1000`

**Victory Condition**: `teamPool >= targetScore`

The pool can go negative — this is intentional.

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
