# Database & Backend Architecture

## Purpose

The backend is entirely Supabase-hosted, providing authentication, a PostgreSQL database, file storage, realtime channels, and edge functions. This document maps the database schema, storage conventions, edge function inventory, and the environment configuration that ties the client to the backend.

## Architecture Overview

```
React SPA (Vite)
    │
    ├── Supabase Auth ──────────── User sessions, OAuth, email/password
    │
    ├── Supabase Database (Postgres)
    │       ├── players
    │       ├── games
    │       ├── game_sessions
    │       ├── game_ratings
    │       ├── game_favorites
    │       └── drafts
    │
    ├── Supabase Storage
    │       └── games bucket
    │               ├── {authUuid}/{gameName}.json
    │               ├── {authUuid}/drafts/{draftId}.json
    │               └── {authUuid}/clue-media/{draftId}/{round}-{cat}-{clue}/{file}
    │
    ├── Supabase Realtime
    │       └── session:{sessionId} channels
    │
    └── Supabase Edge Functions
            ├── generate-archive-game
            ├── generate-labs-game
            ├── generate-ai-game
            └── delete-user
```

## Database Tables

### `players`

Stores persistent player profiles and cumulative statistics.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer (PK) | Auto-incrementing player ID |
| `player_name` | text | Display name (unique, case-insensitive) |
| `auth_uuid` | uuid | Links to Supabase Auth user (nullable for non-auth players) |
| `total_games_played` | integer | Cumulative games played |
| `total_games_won` | integer | Cumulative games won |
| `total_correct_answers` | integer | Lifetime correct answers |
| `total_incorrect_answers` | integer | Lifetime incorrect answers |
| `total_correct_daily_doubles` | integer | Lifetime correct DDs |
| `total_incorrect_daily_doubles` | integer | Lifetime incorrect DDs |
| `total_correct_final_jeopardies` | integer | Lifetime correct FJ |
| `total_incorrect_final_jeopardies` | integer | Lifetime incorrect FJ |
| `current_balance` | integer | Cumulative net score (can be negative) |
| `total_money_earned` | integer | Sum of all correct answer values (always ≥ 0) |

### `games`

Stores game metadata (the actual game content lives in Storage).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Game identifier |
| `game_name` | text | Display name |
| `total_rounds` | integer | Number of rounds in the game |
| `times_played` | integer | How many times this game has been played |
| `winners` | text[] | Array of all winner names (appended each play) |
| `created_by` | integer (FK → players.id) | Creator's player ID |
| `source` | text | Origin of the game (nullable) |
| `high_score` | integer | Highest score ever achieved |
| `high_score_player` | text | Name of high score holder |

### `game_sessions`

Real-time multiplayer session state (ephemeral, cleaned up after 24h).

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | Cryptographically secure session ID |
| `host_user_id` | uuid | Auth UUID of the session host |
| `game_id` | uuid (FK → games.id) | Which game is being played |
| `phase` | text | Current phase: lobby, buzzer, final-jeopardy, ended |
| `is_locked` | boolean | Whether new players can join |
| `players` | jsonb | Array of `SessionPlayer` objects |
| `buzz_state` | jsonb | Current `BuzzState` object |
| `final_jeopardy_state` | jsonb | Current `FinalJeopardyState` object |
| `team_pool` | integer | Co-op team pool (nullable) |
| `target_score` | integer | Co-op target score (nullable) |
| `coop_mode` | boolean | Whether co-op is active (nullable) |
| `created_at` | timestamptz | Session creation time |
| `updated_at` | timestamptz | Last update time (used for stale detection) |

### `game_ratings`

Per-player, per-game ratings (1-5 stars).

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer (PK) | Auto-incrementing |
| `player_id` | integer (FK → players.id) | Who rated |
| `game_id` | uuid (FK → games.id) | Which game |
| `rating` | integer | 1-5 star rating |
| `created_at` | timestamptz | When the rating was created/updated |

**Constraint**: `UNIQUE(player_id, game_id)` — one rating per player per game

### `game_favorites`

Player's bookmarked/favorited games.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer (PK) | Auto-incrementing |
| `player_id` | integer (FK → players.id) | Who favorited |
| `game_id` | uuid (FK → games.id) | Which game |
| `created_at` | timestamptz | When favorited |

**Constraint**: `UNIQUE(player_id, game_id)` — can't favorite the same game twice

### `drafts`

Builder draft metadata (actual draft JSON lives in Storage).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Draft identifier |
| `auth_uuid` | uuid | Owner's auth UUID |
| `draft_name` | text | Display name |
| `created_at` | timestamptz | Creation time |
| `updated_at` | timestamptz | Last modification time |

## Supabase Storage

### `games` Bucket

All game-related files are stored in a single bucket with path-based organization:

```
games/
├── {authUuid}/
│   ├── {gameName}.json                    # Saved game files
│   ├── drafts/
│   │   └── {draftId}.json                 # Builder draft files
│   └── clue-media/
│       └── {draftId}/
│           └── {round}-{cat}-{clue}/
│               └── {sanitizedFileName}    # Attached media files
```

### URL Types
- **Signed URLs**: Used for authenticated access (7-day expiry, refreshable)
- **Public URLs**: Fallback if signed URL generation fails

### Media Constraints
- Images: max 5 MB (.jpg, .jpeg, .png, .gif, .webp)
- Audio: max 10 MB (.mp3)
- File names sanitized: non-alphanumeric chars replaced with underscores

## Edge Functions

### `generate-archive-game`
- **Method**: POST
- **Auth**: Bearer token (JWT)
- **Input**: `{ rounds, categoriesPerRound, gameName }`
- **Output**: `{ success: true, id }` or `{ error }`
- **Purpose**: Generate game from Jeopardy Archive database

### `generate-labs-game`
- **Method**: POST
- **Auth**: Bearer token (JWT)
- **Input**: `{ keywords[], gameName }`
- **Output**: `{ success: true, id }` or `{ error }`
- **Purpose**: Keyword-based game generation

### `generate-ai-game`
- **Method**: POST
- **Auth**: Bearer token (JWT)
- **Input**: `{ rounds, categoriesPerRound, difficulty, dailyDoublesPerRound, specialRequests, gameName }`
- **Output**: `{ success: true, id }` or `{ error }` or `{ error, retryAfterSeconds }`
- **Purpose**: AI-powered game generation via Google GenAI
- **Rate limited**: Returns `retryAfterSeconds` when limit hit

### `delete-user`
- **Method**: POST
- **Auth**: Bearer token (JWT)
- **Input**: (none — uses authenticated user context)
- **Output**: Success/failure
- **Purpose**: Complete account deletion (player row, games, storage, auth record)

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL (used for API calls, storage, realtime) |
| `VITE_SUPABASE_ANON_KEY` | Public anonymous key (client-side, RLS-gated) |

These are defined in `.env.local` (not committed to git).

## Supabase Clients

| File | Type | Usage |
|------|------|-------|
| `src/utils/supabase.ts` | Standard browser client | Used throughout for DB/storage/auth/realtime |
| `lib/client.ts` | SSR browser client | For SSR scenarios (using `@supabase/ssr`) |
| `lib/server.ts` | Server-side client | For server-side operations |

## Row-Level Security (RLS)

The database uses RLS policies to protect data:
- `game_ratings` and `game_favorites` require an active auth session to read/write
- `players` table: readable by authenticated users, writable by row owner
- `game_sessions`: readable/writable by session participants
- `games`: readable by all authenticated users, writable by creator

(Exact policies depend on Supabase dashboard configuration)

## Session Cleanup Strategy

| What | When | Action |
|------|------|--------|
| Stale sessions | `updated_at` > 30 min old | Phase set to `'ended'` |
| Ended sessions | `updated_at` > 24 hours old | Row deleted |
| Trigger | When `createSession()` is called | Best-effort, non-blocking |

## Dependencies

| Package | Usage |
|---------|-------|
| `@supabase/supabase-js` | Core client for all Supabase interactions |
| `@supabase/ssr` | Server-side rendering helpers |
| `@supabase/auth-ui-react` | Pre-built auth UI components |
| `supabase` (CLI, devDep) | Local development, migrations, edge function deployment |

## Key Implementation Patterns

- **Optimistic updates**: UI updates immediately, DB write happens async
- **Graceful degradation**: All API calls handle errors without crashing; return error objects
- **Null coalescing**: All numeric fields from DB are defaulted to 0 (`?? 0`)
- **Case-insensitive matching**: Player names use `.ilike()` for lookups
- **Upsert pattern**: Ratings use `upsert` with conflict resolution on unique constraint
- **AbortSignal support**: Long-running queries accept optional AbortSignal for cancellation
