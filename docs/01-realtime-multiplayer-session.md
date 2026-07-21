# Real-Time Multiplayer Session System (Buzzer)

## Purpose

The Real-Time Multiplayer Session System enables live, multi-device gameplay where a host runs the game on one device while players buzz in from their phones or tablets. It manages the full lifecycle of a game session — from creation and player joining, through real-time buzzer interactions, to session cleanup — ensuring all participants stay synchronized in real time.

## Architecture Overview

The system is built on three pillars:

1. **Database-backed session state** (Supabase `game_sessions` table) — the source of truth for session data
2. **Supabase Realtime channels** — for low-latency broadcast of game events between host and players
3. **Presence tracking** — for monitoring which players are currently connected

### Data Flow

```
Host Device                    Supabase                     Player Devices
    │                             │                              │
    ├── createSession() ──────────┼── INSERT game_sessions ──────┤
    │                             │                              │
    │   broadcastMessage() ───────┼── Realtime Channel ──────────┼── onChannelMessage()
    │                             │                              │
    │   updateBuzzState() ────────┼── UPDATE game_sessions ──────┤
    │                             │                              │
    │   trackPresence() ──────────┼── Presence ──────────────────┼── trackPresence()
    │                             │                              │
    ├── fetchSession() ───────────┼── SELECT game_sessions ──────┼── fetchSession()
    │                             │                              │
```

### Session Lifecycle

```
createSession() → lobby → buzzer → final-jeopardy → ended → (cleanup after 24h)
```

1. **Lobby** — Host creates session; players join via QR code or session URL
2. **Buzzer** — Active gameplay; clues are activated/deactivated, players buzz in
3. **Final Jeopardy** — Players submit wagers and answers
4. **Ended** — Game complete; session persists for 24h then gets deleted
5. **Stale cleanup** — Sessions inactive for 30+ minutes are auto-ended

## Key Files

| File | Responsibility |
|------|---------------|
| `src/utils/sessionApi.ts` | CRUD operations for `game_sessions` table |
| `src/utils/sessionChannel.ts` | Realtime channel lifecycle, broadcasting, presence, reconnection |
| `src/hooks/useGameSession.ts` | React hook managing subscription, state sync, and auto-reconnection |
| `src/utils/sessionIdGenerator.ts` | Cryptographically secure session ID generation |
| `src/utils/sessionRegistration.ts` | Player registration into sessions |
| `src/types/session.ts` | All session-related TypeScript types |

## Channel Message Protocol

All messages are broadcast on a channel named `session:{sessionId}` using the event name `session_event`. The `ChannelMessage` union type defines 20+ message variants:

### Session Management
- `phase_change` — Session phase transitions (lobby → buzzer → final-jeopardy → ended)
- `player_joined` — New player enters session
- `player_rejoined` — Existing player reconnects
- `player_removed` — Host removes a player
- `session_ended` — Game is over

### Buzzer Events
- `clue_activated` — Host opens a clue for buzzing
- `clue_deactivated` — Host closes the clue
- `buzz` — Player buzzes in (includes playerName + timestamp)
- `buzz_queue_update` — Full queue state broadcast
- `buzzer_locked` — Host locks the system
- `buzzer_unlocked` — Host unlocks the system
- `buzz_state_sync` — Full buzz state reconciliation
- `buzz_queue_cleared` — Queue reset with updated lockout list
- `player_incorrect` — Player marked incorrect, added to lockout list

### Final Jeopardy Events
- `fj_wager_received` — A player submitted their wager
- `fj_all_wagers_in` — All wagers received
- `fj_submission_received` — A player submitted their answer
- `fj_reveal` — Host reveals a player's submission
- `fj_score_update` — Score change after FJ marking

### Co-op Events
- `coop_pool_update` — Team pool value changed

## Reconnection Strategy

When a connection drops, the system attempts automatic recovery:

1. **Detection**: Channel subscription failure or disconnect event
2. **Retry loop**: Attempts reconnection every 2 seconds, up to 5 times
3. **On reconnect**: Subscribes to a fresh channel, re-registers message handlers, then reconciles state from DB
4. **On failure**: After 5 attempts, sets `connectionState` to `'failed'` and surfaces error to UI

### Periodic Reconciliation

While connected, the hook polls the database every 3 seconds to catch any missed broadcast messages (belt-and-suspenders approach). This ensures eventual consistency even if a broadcast is dropped.

## Presence Tracking

Players announce themselves via `channel.track(payload)` where payload includes:
- `playerName` — The player's display name
- `joinedAt` — ISO timestamp of when they started tracking

Presence events (`sync`, `join`, `leave`) allow the host to see who's currently online and detect disconnections.

## Buzz State Model

```typescript
interface BuzzState {
  clueActive: boolean;       // Is a clue currently open for buzzing?
  queue: BuzzEvent[];        // Ordered list of buzz-ins (by timestamp)
  lockedOut: string[];       // Players who already answered incorrectly
  systemLocked: boolean;     // Host manually locked the system
}
```

### Buzz Eligibility Rules (`canPlayerBuzz`)

A player can buzz if and only if ALL conditions are true:
- System is not locked (`!systemLocked`)
- A clue is active (`clueActive`)
- Player hasn't already buzzed (`!isDuplicateBuzz`)
- Player isn't locked out (`!isPlayerLockedOut`)

## Session Cleanup

- **Stale sessions**: Any session not updated in 30+ minutes is automatically marked as `ended`
- **Deletion**: Sessions in `ended` state for 24+ hours are deleted from the database
- **Trigger**: Cleanup runs opportunistically when a new session is created

## Dependencies

| Package | Usage |
|---------|-------|
| `@supabase/supabase-js` | Realtime channels, presence, database operations |
| `qrcode` | QR code generation for session join URLs |

## Related UI Components

### Host-Side
- `src/components/host/BuzzerHostPanel.tsx` — Displays buzz queue, allows mark correct/incorrect, lock/unlock
- `src/components/host/SessionQRCode.tsx` — QR code popup for player joining
- `src/components/host/PlayerConnectionStatus.tsx` — Shows which players are online/offline

### Player-Side
- `src/routes/pages/PlaySessionPage.tsx` — Entry point for player devices
- `src/components/player/BuzzerPage.tsx` — The big buzz button interface
- `src/components/player/ConnectionStatusBanner.tsx` — Connection health indicator
- `src/components/player/ScoreboardStrip.tsx` — Live score display for players
- `src/components/player/SessionEndedPage.tsx` — End state view

### Hooks
- `src/hooks/useBuzzer.ts` — Player-side buzz-in logic with optimistic state
- `src/hooks/useGameSession.ts` — Channel subscription + state management
- `src/hooks/useSessionQR.ts` — QR code generation for join URL
