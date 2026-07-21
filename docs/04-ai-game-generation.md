# AI Game Generation System

## Purpose

The AI Game Generation system allows users to create complete Jeopardy games without manual content entry. It provides three distinct generation modes — pulling from a historical Jeopardy archive, keyword-driven generation, and fully AI-powered custom generation — each backed by a Supabase Edge Function that handles the server-side logic.

## Architecture Overview

```
Client (GenerateGamePage.tsx)
    │
    ├── generateArchiveGame()  ──→  Supabase Edge Function: generate-archive-game
    ├── generateLabsGame()     ──→  Supabase Edge Function: generate-labs-game
    └── generateAiGame()       ──→  Supabase Edge Function: generate-ai-game
                                              │
                                              ├── Reads from J-Archive database (archive mode)
                                              ├── Uses keyword matching (labs mode)
                                              └── Calls Google GenAI API (AI mode)
                                              │
                                              └── Returns { success: true, id: string }
                                                   or { error: string }
```

All endpoints follow the same pattern:
1. Client authenticates via Supabase Auth session
2. Sends POST request with JWT in Authorization header
3. Edge function processes the request, generates game data, saves to storage + DB
4. Returns the new game's ID for client-side redirect

## Key Files

| File | Responsibility |
|------|---------------|
| `src/utils/generateApi.ts` | Client-side API wrapper for all three generation modes |
| `src/routes/pages/GenerateGamePage.tsx` | UI for selecting mode and configuring parameters |

## Generation Modes

### 1. Archive Mode

**Function**: `generateArchiveGame(rounds, categoriesPerRound, gameName)`

**Purpose**: Pulls real historical Jeopardy categories and clues from an archive database. Produces authentic-feeling games with real trivia.

**Parameters**:
- `rounds` (number) — How many rounds to include
- `categoriesPerRound` (number) — Categories per round
- `gameName` (string) — Display name for the game

**Edge Function**: `generate-archive-game`

### 2. Labs Mode

**Function**: `generateLabsGame(keywords, gameName)`

**Purpose**: Generates games themed around user-provided topics/keywords. More targeted than archive mode but doesn't use full AI generation.

**Parameters**:
- `keywords` (string[]) — Topic keywords to build categories around
- `gameName` (string) — Display name for the game

**Edge Function**: `generate-labs-game`

### 3. AI Mode (Full Custom)

**Function**: `generateAiGame(params)`

**Purpose**: Full AI-powered generation using Google's Generative AI. Produces entirely original clues tailored to the user's specifications.

**Parameters** (`GenerateAiGameParams`):
- `rounds` (number) — Number of rounds
- `categoriesPerRound` (number) — Categories per round
- `difficulty` (number) — Difficulty level
- `dailyDoublesPerRound` (number) — How many DDs per round
- `specialRequests` (string) — Free-text instructions for the AI (e.g., "focus on 90s pop culture")
- `gameName` (string) — Display name for the game

**Edge Function**: `generate-ai-game`

## Response Types

### Success
```typescript
interface GenerateResponse {
  success: true
  id: string  // The saved game's database ID
}
```

### Error
```typescript
interface GenerateErrorResponse {
  error: string
}
```

### Rate Limit (AI mode only)
```typescript
interface RateLimitErrorResponse {
  error: string
  retryAfterSeconds: number  // How long to wait before retrying
}
```

## Authentication Flow

Every generation request requires an active Supabase Auth session:

```typescript
const { data: { session } } = await supabase.auth.getSession()
const token = session?.access_token
// If no token → return { error: 'Not authenticated' }

// Otherwise, include in request:
headers: {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
}
```

The edge function validates the token server-side and uses the authenticated user's ID for file storage paths.

## Error Handling

- **No auth session**: Returns `{ error: 'Not authenticated' }` immediately (no network call)
- **Network failure**: Caught by try/catch in the edge function; returns error response
- **Rate limiting** (AI mode): Returns `retryAfterSeconds` so the UI can display a countdown
- **Generation failure**: Edge function returns descriptive error message

## Dependencies

| Package | Usage |
|---------|-------|
| `@supabase/supabase-js` | Auth session retrieval, fetch to edge functions |
| `@google/genai` | Google Generative AI (used server-side in edge function) |

## Related UI Components

- `src/routes/pages/GenerateGamePage.tsx` — Mode selection, parameter forms, generation progress
- Generation success redirects to the Game Library where the new game appears

## UX Interactions

- User selects a generation mode (Archive, Labs, or AI)
- Fills in parameters appropriate to the mode
- Submits and sees a loading/progress state
- On success: redirected to the game in the library
- On rate limit (AI mode): sees a countdown timer before they can retry
- On error: sees an inline error message with the option to retry
