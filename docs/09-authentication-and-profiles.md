# Authentication & Player Profile System

## Purpose

The Authentication & Player Profile system manages user identity, access control, and player data throughout the application. It ensures only authenticated users can access protected features (creating games, playing, viewing the leaderboard), associates a persistent player profile with each account, and provides account management capabilities including profile updates and deletion.

## Architecture Overview

```
Supabase Auth
    │
    ├── AuthProvider (listens to auth state changes)
    │       │
    │       └── AuthContext → useAuth() hook
    │
    ├── ProtectedShell (auth guard for /home/* routes)
    │       │
    │       └── ProfileGuard (ensures player row exists)
    │               │
    │               └── PlayerProfileProvider
    │                       │
    │                       └── PlayerProfileContext → usePlayerProfileContext()
    │
    └── Public routes (login, play session, 401, profile-setup)
```

### Two-Layer Identity

1. **Auth User** (Supabase Auth) — UUID, email, session token
2. **Player Profile** (`players` table) — Numeric ID, player name, stats, linked via `auth_uuid`

A user must complete profile setup (choosing a player name) before accessing protected features.

## Key Files

| File | Responsibility |
|------|---------------|
| `src/routes/auth.tsx` | `AuthProvider` — wraps app in auth state listener |
| `src/contexts/AuthContext.ts` | Auth context definition |
| `src/hooks/useAuth.ts` | Simple context consumer hook |
| `src/routes/routeComponents.tsx` | `IndexRedirect`, `ProtectedShell` — navigation guards |
| `src/components/ProfileGuard.tsx` | Redirects to profile-setup if no player record |
| `src/contexts/PlayerProfileContext.ts` | Player profile context definition |
| `src/contexts/PlayerProfileProvider.tsx` | Fetches and provides player profile |
| `src/hooks/usePlayerProfile.ts` | Fetches player row from `players` table |
| `src/hooks/usePlayerProfileContext.ts` | Context consumer hook |
| `src/utils/playerProfile.ts` | Player profile API utilities |
| `src/utils/playerNameValidation.ts` | Name validation rules |
| `src/utils/settingsApi.ts` | `updatePlayerName()`, `deleteAccount()` |
| `src/routes/pages/LoginPage.tsx` | Login UI (Supabase Auth UI) |
| `src/routes/pages/ProfileSetupPage.tsx` | First-time player name registration |

## Auth State Model

```typescript
// From AuthContext
interface AuthContextValue {
  session: Session | null      // Supabase auth session (includes access_token)
  loading: boolean             // True while checking initial auth state
  signedOut: boolean           // True if user explicitly signed out
}
```

### State Change Handling

The `AuthProvider` listens to `supabase.auth.onAuthStateChange` events:
- On `SIGNED_OUT`: Sets `signedOut = true` (used by ProtectedShell for redirect logic)
- On any change: Updates `session` state

## Route Protection

### `ProtectedShell` Component

Wraps all routes under `/home/*`:
- **No session + was signed out** → redirects to `/login`
- **No session + never signed in** → redirects to `/401` (Unauthorized)
- **Has session** → renders `AuthenticatedLayout` (which includes `ProfileGuard`)

### `IndexRedirect` Component

Root `/` route handler:
- **Has session** → redirects to `/home`
- **No session** → redirects to `/login`

### `ProfileGuard` Component

Inside the authenticated shell:
- Checks if a `players` table row exists for the authenticated user
- If not → redirects to `/profile-setup`
- If yes → renders children and provides `PlayerProfileContext`

## Player Profile

```typescript
interface PlayerProfile {
  playerId: number      // Numeric ID from players table
  playerName: string    // Display name chosen by user
  authUuid: string      // Links to Supabase Auth user.id
}
```

### Profile Setup Flow

1. User authenticates (login page)
2. `ProfileGuard` detects no player record
3. Redirect to `/profile-setup`
4. User chooses a player name (validated)
5. Player row created in `players` table
6. Redirect to `/home`

## Player Name Validation (`playerNameValidation.ts`)

Rules for valid player names:
- Non-empty after trimming
- Length constraints (likely 1-50 characters)
- No special characters that could break display
- Uniqueness enforced server-side (case-insensitive)

## Account Management

### Update Player Name (`settingsApi.ts`)
- Validates new name
- Updates `player_name` in `players` table
- Case-insensitive uniqueness check

### Delete Account (`settingsApi.ts`)
- Calls Supabase Edge Function: `delete-user`
- Removes all user data: player row, games, storage files, auth record
- Irreversible operation (requires confirmation dialog)

## Supabase Client Setup

Three client variants exist for different contexts:

| File | Client Type | Usage |
|------|-------------|-------|
| `src/utils/supabase.ts` | Standard browser client | Used throughout the app for DB/storage/auth |
| `lib/client.ts` | SSR browser client | For SSR/SSG scenarios (if applicable) |
| `lib/server.ts` | Server-side client | For server-side operations |

## Dependencies

| Package | Usage |
|---------|-------|
| `@supabase/supabase-js` | Auth, database, storage operations |
| `@supabase/auth-ui-react` | Pre-built login UI components |
| `@supabase/ssr` | Server-side rendering auth helpers |

## Related UI Components

- `src/routes/pages/LoginPage.tsx` — Supabase Auth UI (social login, email/password)
- `src/routes/pages/ProfileSetupPage.tsx` — Player name input + creation
- `src/routes/pages/UnauthorizedPage.tsx` — 401 page for unauthenticated access attempts
- `src/components/ProfileGuard.tsx` — Invisible guard component (redirects if no profile)
- `src/components/AuthenticatedLayout.tsx` — Shell layout for all authenticated pages
- `src/components/DeleteAccountDialog.tsx` — Confirmation dialog for account deletion
- `src/routes/pages/SettingsPage.tsx` — Profile section with name change

## UX Interactions

- **Login**: Pre-built Supabase Auth UI handles email/password, social providers
- **Profile setup**: Simple form with player name input, validation feedback, submit button
- **Protected redirect**: Attempting to access `/home/*` without auth silently redirects
- **Signed out redirect**: After explicit sign-out, redirects to login (not 401)
- **Name change**: In Settings page, with inline validation and success toast
- **Account deletion**: Settings page → Delete Account → confirmation dialog → irreversible deletion
- **Session persistence**: Auth session persists via Supabase's built-in cookie/localStorage management
