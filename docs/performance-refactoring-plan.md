# Performance Refactoring Plan

Status of all identified performance issues.

---

## Issue #6 — GamePage God Component Decomposition

**Status:** ⏳ Documented — requires dedicated refactoring session

**Current state:** `GamePage.tsx` is ~1400 lines with 20+ `useState`, 7+ `useEffect`, and all game logic inline.

**Refactoring needed:**

1. **Extract `useSessionSync` hook** (~150 lines)
   - Owns: `sessionId`, `hostUserId`, `sessionChannelRef`, `sessionPlayers`, `onlinePlayers`
   - Handles: session creation, channel subscription, presence listeners, message dispatch, cleanup on unmount
   - Moves effects: session creation effect, session lifecycle cleanup effect, session phase sync effect

2. **Extract `useBuzzerHost` hook** (~100 lines)
   - Owns: `buzzState`, `isDailyDouble`, `isTimesUp`
   - Handlers: `handleBuzzerClearQueue`, `handleBuzzerLock`, `handleBuzzerUnlock`
   - Moves effects: clue activate/deactivate effect, timer expiry logic

3. **Extract `useFinalJeopardyHost` hook** (~80 lines)
   - Owns: `finalJeopardyState`, `fjAnswerRevealed`, `coopFjWagerRef`
   - Handlers: `handleFJClueRevealed`, FJ scoring logic
   - Moves effects: FJ state polling (now event-driven via Realtime)

4. **Extract `useGameScoring` hook** (~200 lines)
   - Owns: `session` (GameSession state), `stealBonusAwardedTo`
   - Handlers: `handleMark`, `handlePlay`, `handleClueSelect`, DD/wager logic
   - Pure game state transitions, no network calls

5. **Split render tree into sub-components:**
   - `<GameLoadingState>` — loading/error handling
   - `<GameSessionHeader>` — QR code, cheat sheet toggle, active rules
   - `<GamePhaseRenderer>` — switch on `phase`, renders the correct screen
   - Each phase component receives only its needed props

**Estimated effort:** 2-3 days. No behavioral changes, purely structural.

---

## Issue #8 — Lazy-Load Heavy Libraries

**Status:** ✅ Completed

**Changes made:**
- `exportGamePdf` and `exportCoopGamePdf` are now dynamically imported at call sites in GamePage.tsx via `await import('../../utils/exportGamePdf')`
- `ReactPlayer` in `MediaAttachment.tsx` is now loaded via `React.lazy()` with a Suspense fallback
- Static import of `exportGamePdf` removed from GamePage top-level imports
- `jsPDF` and `recharts` now have their own manual chunks in vite.config.ts (`vendor-pdf`, `vendor-charts`)

**Result:** These heavy libraries (jsPDF ~400KB, react-player ~100KB) are no longer in the initial page bundle — they load on-demand.

---

## Issue #11 — Synchronous Analytics Computation

**Status:** ✅ Already optimized (no changes needed)

**Finding:** `computeAllAnalytics` was already wrapped in `useMemo(() => computeAllAnalytics(session), [session])` in AnalyticsScreen.tsx (line 38). Recomputation on re-renders is already prevented.

**Future consideration:** For very large games (6 rounds × 6 categories × 5 clues × 6 players), a Web Worker via Comlink could be introduced. Current game sizes don't warrant this.

---

## Issue #9 — Dual Supabase Client Consolidation

**Status:** ✅ Completed

**Changes made:**
- Deleted `lib/client.ts` (was never imported anywhere — dead code)
- Deleted `lib/server.ts` (SSR infrastructure unused in Vite SPA)
- Removed `@supabase/ssr` from `package.json` dependencies
- `lib/utils.ts` retained (contains `cn()` utility used by shadcn/ui components)

**Result:** Single Supabase client at `src/utils/supabase.ts`. One fewer dependency installed. No duplicate connection pools.

---

## Issue #16 — Improved Chunk Splitting

**Status:** ✅ Completed

**Changes made in `vite.config.ts`:**
- `vendor-react` — react + react-dom
- `vendor-router` — @tanstack/react-router
- `vendor-supabase` — @supabase packages
- `vendor-ui` — motion + canvas-confetti (removed fuse.js — no longer used)
- `vendor-charts` — recharts + d3-* dependencies
- `vendor-pdf` — jspdf + jspdf-autotable
- `vendor-radix` — radix-ui + @radix-ui packages

**Also:** Removed `fuse.js` from `package.json` dependencies entirely (GameLibraryPage search is now server-side).

---

## Previously Completed Fixes (from prior session)

| Issue | Description | Status |
|-------|-------------|--------|
| #2 | Game Library infinite scroll + server-side pagination | ✅ |
| #5 | Removed redundant 3s polling from useGameSession | ✅ |
| #7 | N+1 queries → single Edge Function (update-game-stats) | ✅ |
| #4 | Server-side rating aggregation via RPC | ✅ |
| #1 | Removed Fuse.js; search is server-side | ✅ |
| #12 | Infinite scroll (IntersectionObserver) replaces rendering all cards | ✅ |
| #3 | Leaderboard pagination (fetchLeaderboardPage) | ✅ |
| #10 | storage_path column for single-request game file download | ✅ |
| #13 | AbortSignal support added to fetch operations | ✅ |
| #14 | Redundant auth checks removed from API functions | ✅ |
| #15 | Builder dirty check — documented (low priority) | ⏳ |
