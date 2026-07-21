# Preferences & Settings System

## Purpose

The Preferences & Settings system manages user-configurable application state — theme, animation preferences, default game options — persisted in localStorage with per-field validation and graceful fallbacks. It also provides the Settings page where users can update their profile name, configure defaults, and manage their account.

## Architecture Overview

```
localStorage (jeopardy-player-preferences)
    │
    ├── readPreferences() → AppPreferences (validated, fallback to defaults)
    └── writePreferences() → boolean (success/fail)
              │
              └── PreferencesProvider
                      │
                      ├── Applies theme via data-theme attribute on <html>
                      ├── Applies reduced-motion class on <html>
                      ├── Listens to OS prefers-reduced-motion media query
                      │
                      └── PreferencesContext → usePreferences() hook
                              │
                              ├── preferences: AppPreferences
                              ├── setTheme(mode)
                              ├── setReducedAnimations(enabled)
                              ├── setDefaultRounds(rounds)
                              └── setDefaultTimerDuration(duration)
```

## Key Files

| File | Responsibility |
|------|---------------|
| `src/utils/preferencesStore.ts` | localStorage read/write with validation |
| `src/contexts/PreferencesProvider.tsx` | Provider component: applies theme + reduced motion |
| `src/contexts/PreferencesContext.ts` | Context definition |
| `src/hooks/usePreferences.ts` | Context consumer hook |
| `src/utils/settingsApi.ts` | `updatePlayerName()`, `deleteGame()`, `deleteAccount()` |
| `src/routes/pages/SettingsPage.tsx` | Settings page with sections |

## Data Model

```typescript
type ThemeMode = 'light' | 'dark'

interface AppPreferences {
  theme: ThemeMode              // Default: 'dark'
  reducedAnimations: boolean    // Default: false
  defaultRounds: number         // 1-5, Default: 2
  defaultTimerDuration?: number // 5-120 (optional, omitted if never set)
}

const PREFERENCES_KEY = 'jeopardy-player-preferences'
```

## Storage & Validation

### Reading Preferences (`readPreferences`)

Performs per-field validation with graceful fallbacks:
- Handles malformed JSON → returns defaults
- Handles partial objects → fills missing fields with defaults
- Handles empty strings and null → returns defaults
- Per-field range checking:
  - `theme`: must be `'light'` or `'dark'`
  - `reducedAnimations`: must be boolean
  - `defaultRounds`: must be integer 1-5
  - `defaultTimerDuration`: must be integer 5-120 (optional)

### Writing Preferences (`writePreferences`)

- Atomically overwrites the entire preference object
- Returns `true` on success, `false` if localStorage is unavailable or write fails
- Never throws — failures are handled gracefully

### Validation Guard (`isValidPreferences`)

Type guard that checks whether an unknown value conforms to `AppPreferences` — used for runtime validation of parsed data.

## Theme System

### Application
- Theme is applied via `data-theme` attribute on `<html>` element
- CSS variables respond to the attribute to switch color schemes
- Applied immediately during initial render (no flash)
- Re-applied on change via `applyTheme(mode)`

### Available Themes
- `'dark'` (default): Dark background, light text
- `'light'`: Light background, dark text

## Reduced Motion

### Logic

```typescript
function shouldDisableAnimations(userPref: boolean, osReducedMotion: boolean): boolean {
  return userPref || osReducedMotion
}
```

Animations are disabled if EITHER:
- The user toggled "Reduce Animations" ON in settings
- The OS `prefers-reduced-motion: reduce` media query is active

### Application
- Adds/removes `reduced-motion` class on `<html>` element
- CSS and framer-motion animations check this class/media query
- Listens to OS media query changes via `matchMedia` event listener
- Updates automatically if the user changes their OS accessibility settings

## Provider Implementation

The `PreferencesProvider`:
1. Reads preferences from localStorage on mount (applies theme immediately)
2. Tracks OS `prefers-reduced-motion` via `matchMedia` listener
3. Applies `reduced-motion` class whenever user pref or OS pref changes
4. Exposes setter functions that update state + persist atomically
5. Warns (console) but doesn't throw if persistence fails

### Memoization
- Context value is memoized via `useMemo` to prevent unnecessary re-renders
- Setter functions are memoized via `useCallback`

## Settings Page

The Settings page has three sections:

### Preferences Section
- Theme toggle (dark/light)
- Reduced animations toggle
- Default rounds selector (1-5)
- Default timer duration (optional)

### Profile Section
- Current player name display
- Change player name (with validation)

### Support Section
- Delete account (with confirmation dialog)

## Settings API (`settingsApi.ts`)

| Function | Purpose |
|----------|---------|
| `updatePlayerName(newName)` | Updates `player_name` in players table |
| `deleteGame(gameId)` | Deletes a game from storage + DB |
| `deleteAccount()` | Calls `delete-user` edge function |

## Dependencies

| Package | Usage |
|---------|-------|
| (none external) | Pure browser APIs (localStorage, matchMedia, document manipulation) |

## Related UI Components

- `src/routes/pages/SettingsPage.tsx` — Full settings page
- `src/components/ToggleSwitch.tsx` — Reusable toggle for boolean preferences
- `src/components/RoundsSelector.tsx` — Round count selector
- `src/components/DeleteAccountDialog.tsx` — Account deletion confirmation
- `src/components/LogoutDialog.tsx` — Sign-out confirmation
- `src/components/SettingsIcon.tsx` — Settings gear icon in navigation

## UX Interactions

- **Theme toggle**: Instant visual switch between dark/light modes
- **Reduced animations**: Immediately simplifies all animations throughout the app
- **Default rounds**: Pre-selects round count when creating new games
- **Default timer**: Pre-fills timer duration when enabling Timed Clues toggle
- **Persistence feedback**: Silently persists on change; warns only on failure
- **Profile update**: Inline validation, success toast on save
- **Account deletion**: Multi-step confirmation dialog explaining irreversibility
