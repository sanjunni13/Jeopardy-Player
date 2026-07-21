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

### Competitive Mode

For each player, the host marks their answer on the scoring panel:

```typescript
// Simple application
applyScoreMark(currentScore: number, wager: number, isCorrect: boolean): number
// Returns: isCorrect ? currentScore + wager : currentScore - wager

// Reversal + re-application (when host changes their mind)
reverseAndApplyMark(currentScore: number, wager: number, previousMark: boolean, newMark: boolean): number
// First reverses the previous mark, then applies the new one
```

The `FinalJeopardy.tsx` component maintains local player state and handles marking with full reversal support — if the host clicks "Correct" then changes to "Incorrect", the previous correct is undone before the incorrect is applied.

Player stats updated per marking:
- `correctFinalJeopardy`: Set to 1 on correct (0 or 1 per game)
- `incorrectFinalJeopardy`: Set to 1 on incorrect (0 or 1 per game)
- `totalEarned`: Adjusted by wager amount on correct

### Co-op Mode

- Single team wager applied to `teamPool`
- **Correct**: `teamPool += wager`
- **Incorrect**: `teamPool -= wager`
- Uses `onCoopMarkAnswer` callback which flows back up to `GamePage`

## Player Panel Workflow (In-Depth)

The player-side Final Jeopardy experience is managed by `FinalJeopardyEntryPage.tsx` and the `useFinalJeopardyEntry` hook. Here's the complete step-by-step flow from the player's perspective:

### Phase 1: Wager Entry

**What the player sees**: Their name, current score, max wager amount, and a numeric input field with a "Submit Wager" button.

**Technical flow**:
1. On mount, `FinalJeopardyEntryPage` fetches the current session to check if the player has already submitted a wager (handles reconnect case)
2. Player types a dollar amount (only digits allowed via `pattern="[0-9]*"`)
3. Client-side validation on submit:
   - Cannot be empty or NaN
   - Cannot be negative
   - Cannot exceed `maxWager` (player's current score if positive, or $1000 if score ≤ 0)
   - Must be a whole integer
4. On valid submission:
   - Fetches latest session state from DB (double-check for duplicate submission)
   - Appends a `FinalJeopardyWager` object to `final_jeopardy_state.wagers[]` in DB
   - Broadcasts `fj_wager_received` message on the channel so host sees real-time status
   - Sets local `wagerSubmitted = true`

**Wager range rules** (`getValidWagerRange`):
- Score > 0 → range is `[$0, $score]`
- Score ≤ 0 → range is `[$0, $1000]` (allows participation even with negative scores)

### Phase 2: Waiting for Clue

**What the player sees**: "Wager submitted! Waiting for the clue to be revealed…" confirmation message plus the ScoreboardStrip showing current scores.

**Technical detail**: The `submissionsLocked` prop (passed from `PlaySessionPage`) controls whether the answer input is shown. This prop is `true` until the host reveals the clue (detected via channel message or session phase change).

### Phase 3: Answer Entry

**What the player sees**: A textarea labeled "Your Answer" with a "Submit Answer" button, character counter (max 200), and the `ScoreboardStrip`.

**Technical flow** (via `useFinalJeopardyEntry` hook):
1. Player types answer (max 200 characters, counter shows remaining)
2. On submit:
   - `validateAnswer(answer)`: Must be non-empty after trim, max 200 chars
   - `validateWager(wager, playerScore)`: Re-validates the wager for safety
   - Fetches latest session to check `canSubmitFinalJeopardy()` (prevents double submission)
   - Appends a `FinalJeopardySubmission` to `final_jeopardy_state.submissions[]` in DB
   - Broadcasts `fj_submission_received` on the channel
   - Sets `status: 'submitted'`
3. On error: Status set to `'error'`, form stays populated for retry

### Phase 4: Submission Confirmed

**What the player sees**: "Your answer has been submitted" confirmation. No further interaction needed.

### Co-op Mode Player Experience

When co-op mode is detected (via session state or props), the player sees an entirely different screen:

**What the player sees**: "The host is handling the team wager and answer." with a subtext "Discuss the answer with your team!"

Players do NOT submit individual wagers or answers in co-op FJ. The host handles everything on their device. Players can still submit answers for the host to review (team discussion), but the wager and judgment are centralized.

### Reconnection Handling

Both the wager and answer phases check on mount whether the player has already submitted:
- Wager: `fetchSession()` checks if `wagers[]` contains an entry for this player name (case-insensitive)
- Answer: `fetchSession()` checks via `canSubmitFinalJeopardy(submissions, playerName)`

If already submitted, the component immediately shows the confirmation state without requiring re-submission.

### Validation Functions (`finalJeopardyValidation.ts`)

```typescript
// Wager range for a given score
getValidWagerRange(playerScore: number): { min: number; max: number }

// Validates a specific wager amount
validateWager(wager: number, playerScore: number): ValidationResult

// Validates answer text
validateAnswer(answer: string): ValidationResult

// Can this player still submit? (prevents double submission)
canSubmitFinalJeopardy(submissions: FinalJeopardySubmission[], playerName: string): boolean

// Have ALL players submitted? (host uses this to know when to proceed)
allPlayersSubmitted(players: SessionPlayer[], submissions: FinalJeopardySubmission[]): boolean
```

## Host Panel Workflow

1. **Wager Phase**: Host sees which players have submitted wagers (green checkmark vs. "Waiting…" for each). Cannot proceed until all wagers are in. An "All Submitted ✓" badge appears when complete.
2. **Clue Phase**: Host reveals the clue to all players (click or Space/Enter). Players then see the answer entry form on their devices.
3. **Submission Phase**: Host waits for all player answers to come in. Same status indicators (submitted ✓ vs. waiting).
4. **Reveal Phase**: Once all answers are in and the host reveals the solution, a scoring panel appears showing each player with their wager, their answer text, and Correct/Incorrect buttons. Host clicks to mark each player.
5. **Finish**: After all players are marked, "Finish Game" button becomes enabled. Clicking transitions to Game Over.

### Co-op Host Panel Variant

When `coopMode` is active and answers are revealed:
- Shows all submitted answers grouped under "Team Answers" (player name + their answer text)
- Single "Team Judgment" section with one Correct/Incorrect button pair
- Host makes one collective decision for the whole team
- "Finish Game" button enabled after the team marking is made

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
