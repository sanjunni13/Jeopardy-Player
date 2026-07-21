# Final Jeopardy System

## Purpose

The Final Jeopardy system manages the culminating round of every game — a special multi-phase sequence where players wager from their current score, view a single clue, submit written answers, and then have their answers revealed one by one by the host. It supports both competitive (individual) and co-op (team) variants, with real-time synchronization between host and player devices.

## Architecture Overview

### Phase Flow (Competitive Mode)

```
Category Reveal → Wager Entry → Clue Reveal → Answer Submission → Host Reveals → Scoring
     │                │              │                │                  │           │
     │            Players           All              Players          Host marks   Scores
     │            submit          players            submit           correct/     updated
     │            wagers          see clue           answers          incorrect    per player
```

### Phase Flow (Co-op Mode)

```
Category Reveal → Team Wager → Clue Reveal → Answer Submission → Host Judgment → Pool Update
     │               │              │               │                  │              │
     │          Host enters        All            Players          Single team    teamPool
     │          one team          players         submit           correct/       adjusted
     │          wager             see clue        answers          incorrect      by wager
```

### Real-Time Message Flow

```
Host Device                    Channel                     Player Devices
    │                            │                              │
    ├── phase_change ────────────┼─────────────────────────────→│  (show FJ UI)
    │                            │                              │
    │←──────────────────────────←┼── fj_wager_received ────────←┤  (player submits wager)
    │                            │                              │
    ├── fj_all_wagers_in ────────┼─────────────────────────────→│  (all wagers received)
    │                            │                              │
    │←──────────────────────────←┼── fj_submission_received ───←┤  (player submits answer)
    │                            │                              │
    ├── fj_reveal ───────────────┼─────────────────────────────→│  (host reveals one player)
    │                            │                              │
    ├── fj_score_update ─────────┼─────────────────────────────→│  (score adjusted)
```

## Key Files

| File | Responsibility |
|------|---------------|
| `src/components/game/FinalJeopardy.tsx` | Main FJ component (orchestrates phases) |
| `src/components/host/FinalJeopardyHostPanel.tsx` | Host-side: review wagers, reveal submissions, mark answers |
| `src/components/player/FinalJeopardyEntryPage.tsx` | Player-side: submit wager and answer |
| `src/hooks/useFinalJeopardyEntry.ts` | Player-side hook for wager/answer state management |
| `src/utils/finalJeopardyValidation.ts` | Wager validation logic |
| `src/utils/finalJeopardyScoring.ts` | FJ scoring calculations |
| `src/types/session.ts` | `FinalJeopardyState`, `FinalJeopardyWager`, `FinalJeopardySubmission` |

## State Model

```typescript
interface FinalJeopardyState {
  wagers: FinalJeopardyWager[]
  submissions: FinalJeopardySubmission[]
  revealedIndex: number       // -1 = none revealed, 0+ = revealing in sequence
  coopMode?: boolean          // true when co-op mode is active
}

interface FinalJeopardyWager {
  playerName: string
  wager: number
  submittedAt: string         // ISO timestamp
}

interface FinalJeopardySubmission {
  playerName: string
  wager: number
  answer: string
  submittedAt: string         // ISO timestamp
}
```

## Wager Validation (`finalJeopardyValidation.ts`)

### Competitive Mode
- **Maximum wager**: Player's current score (if positive), or $0 if score is ≤ 0
- **Minimum wager**: $0 (players with negative scores can still participate without risking)
- **Must be integer**: Non-integer values rejected
- **Each player submits independently**: No visibility into other players' wagers

### Co-op Mode
- **Maximum wager**: `Math.max(teamPool, 1000)` when `teamPool > 0`, else `1000`
- **Single wager**: Host enters one team wager rather than individual players
- **Applied to team pool**: Result adds/deducts from the shared pool

## Scoring Logic (`finalJeopardyScoring.ts`)

For each player:
- **Correct**: `score += wager`
- **Incorrect**: `score -= wager`

In co-op mode:
- **Correct**: `teamPool += wager`
- **Incorrect**: `teamPool -= wager`

Player stats are also updated:
- `correctFinalJeopardy` incremented on correct (0 or 1 per game)
- `incorrectFinalJeopardy` incremented on incorrect (0 or 1 per game)

## Host Panel Workflow

1. **Wager Phase**: Host sees which players have submitted wagers. Cannot proceed until all wagers are in.
2. **Clue Phase**: Host reveals the clue to all players.
3. **Submission Phase**: Host waits for all player answers to come in.
4. **Reveal Phase**: Host reveals submissions one at a time (in chosen order), marks each as correct/incorrect.
5. **Scoring**: After each marking, the score update is broadcast.

### Co-op Variant
- Shows all received answers grouped under "Team Answers" instead of individual player reveals
- Single correct/incorrect button pair for the collective team judgment
- One wager input controlled by the host

## Channel Messages

| Message | Direction | Payload | When |
|---------|-----------|---------|------|
| `fj_wager_received` | Player → All | `{ playerName }` | Player submits wager |
| `fj_all_wagers_in` | Host → All | — | All wagers received |
| `fj_submission_received` | Player → All | `{ playerName }` | Player submits answer |
| `fj_reveal` | Host → All | `{ index, submission }` | Host reveals one player |
| `fj_score_update` | Host → All | `{ playerName, newScore }` | Score adjusted after marking |

## Dependencies

| Package | Usage |
|---------|-------|
| `@supabase/supabase-js` | Realtime channel messages, DB state updates |
| `motion` (framer-motion) | Reveal animations |

## Related UI Components

### Host-Side
- `src/components/game/FinalJeopardy.tsx` — Main orchestrator component
- `src/components/host/FinalJeopardyHostPanel.tsx` — Wager review, reveal controls, marking buttons

### Player-Side
- `src/components/player/FinalJeopardyEntryPage.tsx` — Wager input + answer textarea

### Shared
- `src/components/game/Scoreboard.tsx` — Shows updated scores after FJ markings

## UX Interactions

- **Category reveal**: Dramatic display of the FJ category name
- **Wager entry**: Players see their current score and input a wager (validated in real time)
- **Waiting state**: Players see "Waiting for all wagers..." while others submit
- **Clue reveal**: Full-screen display of the FJ clue text
- **Answer submission**: Text input for players to type their answer
- **Host reveal**: One-by-one dramatic reveals showing answer, wager, and result
- **Score animation**: Scores animate up/down as each player is revealed
- **Co-op judgment**: Host sees all team answers together, makes one collective decision
