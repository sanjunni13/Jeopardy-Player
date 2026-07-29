# Multi-Display Mode (Shelved Feature)

## Purpose

Multi-Display Mode provides a dedicated, read-only TV/projector display page that renders the game in a large-font, high-contrast, TV-optimized layout without any interactive controls. The host device handles all game logic and broadcasts state updates to the display via Supabase Realtime, enabling a "game show" setup where the TV shows the board/clues while the host controls the game from a phone or laptop.

## Current Status: SHELVED

This feature is fully designed and implemented but currently shelved. All code lives in the `.shelved/multi-display-mode/` directory and is not active in the main application. The feature was completed per spec but moved out of the active codebase (likely pending final integration testing or UX polish).

## Architecture Overview

```
Host Device (GamePage)                       TV/Display (DisplayPage)
    │                                              │
    ├── Broadcasts display_* messages ─────────────┼── useDisplaySession() listens
    │                                              │
    ├── Responds to display_sync_request ──────────┼── Requests full sync on connect
    │   with display_full_sync                     │
    │                                              │
    ├── Detects display presence ───────────────────┼── Tracks presence { type: 'display' }
    │   (📺 indicator)                             │
    │                                              │
    └── Normal game logic (unchanged) ─────────────└── Pure rendering (no game logic)
```

### Key Design Principles

1. **Fire-and-forget**: Host broadcasts display messages without waiting for acknowledgment — failures don't affect gameplay
2. **Read-only**: Display page has zero interactive controls — it only renders state
3. **Late-join support**: Display can connect mid-game and request a full state sync
4. **Multiple displays**: Multiple display instances can connect simultaneously

## Key Files (in `.shelved/multi-display-mode/`)

| File | Responsibility |
|------|---------------|
| `DisplayPage.tsx` | Main page component with phase-based rendering |
| `DisplayPage.css` | TV-optimized base styles |
| `useDisplaySession.ts` | Hook: channel subscription, state management, sync logic |
| `display.ts` | Display-specific type definitions |
| `DisplayQRCode.tsx` | QR popup for TV connection URL |

### Display Components (`components-display/`)

| Component | Purpose |
|-----------|---------|
| `DisplayBoard.tsx` | TV-optimized game board grid |
| `DisplayClue.tsx` | Full-screen clue display |
| `DisplayScoreStrip.tsx` | Bottom score bar with animations |
| `DisplayTimer.tsx` | Large countdown display |
| `DisplayBuzzerActivity.tsx` | Buzz-in overlay (player name, correct/incorrect) |
| `DisplayDailyDouble.tsx` | DD splash + wager + clue display |
| `DisplayFinalJeopardy.tsx` | FJ category, clue, and reveal sequence |
| `DisplayRoundTransition.tsx` | Between-round animation |
| `DisplayGameOver.tsx` | Final scores + winner + confetti |
| `DisplayLoading.tsx` | "Connecting to game..." spinner |
| `DisplayError.tsx` | Session not found message |
| `DisplayWaiting.tsx` | "Waiting for game to begin" screen |

## Display Message Protocol

### Sync Messages
- `display_sync_request` — Display → Host: "Send me the full state"
- `display_full_sync` — Host → Display: Complete state snapshot

### Incremental Updates
- `display_clue_selected` — A clue was chosen from the board
- `display_answer_revealed` — The solution is now visible
- `display_board_return` — Returning to the board view
- `display_scores_update` — Player scores changed
- `display_round_transition` — Moving to next round
- `display_phase_change` — Game phase changed
- `display_buzz_in` — A player buzzed in
- `display_buzz_result` — Correct/incorrect result
- `display_timer_tick` — Timer countdown (every second)
- `display_timer_expired` — Timer reached zero
- `display_dd_player_selected` — DD player chosen
- `display_dd_wager_confirmed` — DD wager submitted
- `display_fj_category` — FJ category revealed
- `display_fj_clue_revealed` — FJ clue text shown
- `display_fj_reveal` — FJ player answer revealed
- `display_game_over` — Game complete

## Display State Model

```typescript
interface DisplayState {
  phase: DisplayPhase
  currentRoundIndex: number
  currentRoundName: string
  chosenClueKeys: string[]
  players: DisplayPlayer[]
  activeClue: DisplayActiveClue | null
  answerRevealed: boolean
  buzzedPlayer: string | null
  buzzResult: 'correct' | 'incorrect' | null
  timerRemaining: number | null
  fjState: DisplayFJState | null
}

type DisplayPhase =
  | 'waiting' | 'board' | 'clue' | 'daily-double'
  | 'round-transition' | 'final-jeopardy' | 'game-over'
```

## `useDisplaySession` Hook

Responsibilities:
1. Fetch session row from DB to get `game_id` and `host_user_id`
2. Download game JSON from Supabase Storage
3. Subscribe to realtime channel
4. Track presence with `{ type: 'display', connectedAt: timestamp }`
5. Broadcast `display_sync_request` on connection
6. Manage `DisplayState` as local state (updated by incoming messages)
7. Handle `display_full_sync` — replace entire state
8. Handle incremental messages — update relevant fields
9. Reconnection logic (request sync on reconnect)
10. Host disconnect detection (60s timeout → warning indicator)

Returns: `{ displayState, connectionState, error }`

## TV-Optimized Design

### Visual Specifications
- **Viewport**: Full 100vw × 100vh, overflow hidden
- **Background**: Dark (#0f172a), light text (#f8fafc)
- **No interactivity**: No cursors, hover states, focus rings, or user-select
- **Font scaling**: `clamp()` for various viewport sizes
- **Minimum fonts**: Categories 2.5rem, values 2rem, timer 4rem
- **Target resolutions**: 1920×1080, 3840×2160, 1280×720

### Timer Display
- Large countdown number (4rem minimum)
- Color transitions: white → yellow (10s) → red (5s)
- "Time's Up!" indicator when expired

### Score Strip
- Bottom-positioned bar with player names and scores
- Animated value transitions (framer-motion)
- Highest-score player highlighted
- Font scaling for 6+ players

### Accessibility
- Respects `prefers-reduced-motion` for all animations
- DD splash: static reveal instead of animation
- Score transitions: instant instead of counting
- Round transition: fade instead of slide

## Host Integration Points

### Broadcast Triggers (added to `GamePage`)
- `handleClueSelect` → `display_clue_selected`
- Answer reveal → `display_answer_revealed`
- `handleReturnToBoard` → `display_board_return`
- `handleMark` → `display_buzz_result` + `display_scores_update`
- First buzz → `display_buzz_in`
- Round transition → `display_round_transition` + `display_phase_change`
- DD flow → `display_dd_*` messages
- Timer tick → `display_timer_tick` (every second)
- FJ → `display_fj_*` messages
- Game over → `display_game_over`

### Sync Request Handler
When host receives `display_sync_request`, it constructs and broadcasts a `display_full_sync` payload from current game state.

### Display Presence Detection
- Host monitors presence for entries with `{ type: 'display' }`
- Shows "📺 Display connected" indicator in session controls

### Display QR Code
- Separate QR from the player join QR
- Labeled "TV Display" with instruction: "Open this on your TV or projector"
- URL: `/display/$sessionId`

## How to Un-Shelve

To bring this feature back into the active codebase:
1. Move files from `.shelved/multi-display-mode/` to their target locations:
   - `DisplayPage.tsx` → `src/routes/pages/`
   - `useDisplaySession.ts` → `src/hooks/`
   - `display.ts` → `src/types/`
   - `components-display/*` → `src/components/display/`
   - `DisplayQRCode.tsx` → `src/components/host/`
2. Register the `/display/$sessionId` route in `routeTree.tsx`
3. Re-enable host broadcast logic in `GamePage.tsx`
4. Run the test suite to verify integration

## Dependencies

| Package | Usage |
|---------|-------|
| `@supabase/supabase-js` | Realtime channels, presence, DB queries |
| `motion` (framer-motion) | Score animations, transitions |
| `canvas-confetti` | Game-over winner celebration |
| `qrcode` | Display QR code generation |

## Related UI Components

All display components are in `.shelved/multi-display-mode/components-display/`:
- 12 presentational components (listed above)
- Each has dedicated CSS for TV-optimized styling
- `DisplayQRCode.tsx` — Host-side popup for TV connection
