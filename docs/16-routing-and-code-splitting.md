# Routing & Code-Splitting Architecture

## Purpose

The routing system defines the application's page structure, access control, and navigation patterns. It uses TanStack Router for type-safe routing with lazy-loaded page components, ensuring fast initial page loads through code splitting while enforcing authentication boundaries between public and protected areas.

## Architecture Overview

```
Root Route (/)
│   └── PreferencesProvider wraps all routes
│
├── Public Routes (no auth required)
│   ├── /             → IndexRedirect (→ /home or /login)
│   ├── /login        → LoginPage
│   ├── /profile-setup → ProfileSetupPage
│   ├── /play/$sessionId → PlaySessionPage (remote buzzer)
│   ├── /401          → UnauthorizedPage
│   └── *             → NotFoundPage (404)
│
└── Protected Routes (/home/*)
    └── ProtectedShell (auth guard)
        └── AuthenticatedLayout
            └── ProfileGuard
                ├── /home           → HomePage
                ├── /home/upload    → UploadPage
                ├── /home/game/$gameId → GamePage
                ├── /home/library   → GameLibraryPage
                ├── /home/generate  → GenerateGamePage
                ├── /home/create    → CreateGamePage
                ├── /home/create/builder → BuilderPage (new)
                ├── /home/create/builder/$draftId → BuilderPage (resume)
                └── /home/settings  → SettingsPage
```

## Key Files

| File | Responsibility |
|------|---------------|
| `src/routes/routeTree.tsx` | All route definitions, router instance |
| `src/routes/routeComponents.tsx` | `IndexRedirect`, `ProtectedShell` |
| `src/routes/pages/` | All page components (lazy-loaded) |
| `src/components/AuthenticatedLayout.tsx` | Shell layout for protected pages |
| `src/components/ProfileGuard.tsx` | Ensures player profile exists |

## Route Definition Pattern

Routes are defined using TanStack Router's `createRoute` API:

```typescript
const gameRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/game/$gameId',
  component: withSuspense(GamePage),
})
```

### Route Hierarchy

```typescript
const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  profileSetupRoute,
  playSessionRoute,
  protectedRoute.addChildren([
    homeIndexRoute,
    uploadRoute,
    createGameRoute,
    builderNewRoute,
    builderResumeRoute,
    gameRoute,
    libraryRoute,
    generateRoute,
    settingsRoute,
  ]),
  unauthorizedRoute,
  catchAllRoute,
])
```

## Code Splitting

### Lazy Loading Strategy

Every page component is lazy-loaded using `React.lazy`:

```typescript
const GamePage = lazy(() => import('./pages/GamePage').then(m => ({ default: m.GamePage })))
```

### Suspense Wrapper

A `withSuspense` higher-order function wraps each lazy component with a Suspense boundary:

```typescript
function withSuspense(Component: React.LazyExoticComponent<React.ComponentType>) {
  return function SuspenseWrapper() {
    return (
      <Suspense fallback={<LazyFallback />}>
        <Component />
      </Suspense>
    )
  }
}
```

### Fallback UI

While chunks load, users see:
```tsx
function LazyFallback() {
  return <p className="p-6 text-slate-300">Loading…</p>
}
```

### Build Output

Vite's build process produces separate chunks for each page, loaded on-demand when the user navigates to that route. This keeps the initial bundle small and speeds up first-load performance.

## Authentication Guards

### `IndexRedirect`

Handles the root `/` path:
- Has session → redirect to `/home`
- No session → redirect to `/login`

### `ProtectedShell`

Guards all `/home/*` routes:
- Loading → shows "Checking authentication…"
- No session + `signedOut` flag → redirect to `/login`
- No session + never signed in → redirect to `/401`
- Has session → renders `AuthenticatedLayout`

### `ProfileGuard`

Inside `AuthenticatedLayout`:
- Checks if a `players` table row exists for the user
- If missing → redirect to `/profile-setup`
- If exists → provides `PlayerProfileContext` and renders children

## Route Parameters

| Parameter | Route | Usage |
|-----------|-------|-------|
| `$gameId` | `/home/game/$gameId` | Identifies which game to play |
| `$sessionId` | `/play/$sessionId` | Identifies which multiplayer session to join |
| `$draftId` | `/home/create/builder/$draftId` | Identifies which draft to resume editing |

Parameters are accessed via TanStack Router's typed `useParams()` hook.

## Public vs. Protected Routes

### Public Routes (no auth)
- `/login` — Auth UI
- `/profile-setup` — First-time name setup
- `/play/$sessionId` — Remote buzzer (players don't need accounts)
- `/401` — Unauthorized page
- `*` — 404 catch-all

### Protected Routes (require auth + profile)
- `/home` — Dashboard/home page
- `/home/upload` — Upload game JSON
- `/home/game/$gameId` — Play a game (host view)
- `/home/library` — Browse game library
- `/home/generate` — AI game generation
- `/home/create` — Game creation method selection
- `/home/create/builder` — Board-style editor
- `/home/settings` — User settings

### Special Case: `/play/$sessionId`

The player buzzer route is intentionally public — players join games via QR code without needing an account. This lowers the friction for game participants who only need to buzz in.

## Context Providers

The route tree establishes the provider hierarchy:

```
RootRoute → PreferencesProvider
    └── ProtectedShell → (auth check)
        └── AuthenticatedLayout
            └── ProfileGuard → PlayerProfileProvider
                └── Page Components
```

Note: `AuthProvider` wraps the entire `RouterProvider` (defined in `router.tsx`), so auth state is available to all routes including public ones.

## Navigation Patterns

### Programmatic Navigation

```typescript
const navigate = useNavigate()
navigate({ to: '/home/game/$gameId', params: { gameId } })
navigate({ to: '/login', replace: true })
```

### Link Components

TanStack Router provides typed `<Link>` components for declarative navigation with automatic active state detection.

## Dependencies

| Package | Usage |
|---------|-------|
| `@tanstack/react-router` | Type-safe router with nested routes |
| `@tanstack/router-plugin` | Vite plugin for route generation/optimization |
| `react` (Suspense, lazy) | Code splitting primitives |

## Related UI Components

- `src/components/AuthenticatedLayout.tsx` — Shell with navigation header for protected pages
- `src/components/ProfileGuard.tsx` — Invisible redirect guard
- `src/routes/routeComponents.tsx` — `IndexRedirect`, `ProtectedShell`
- `src/routes/pages/NotFoundPage.tsx` — 404 page
- `src/routes/pages/UnauthorizedPage.tsx` — 401 page

## UX Interactions

- **First visit**: User hits `/` → redirected to `/login` (if unauthenticated)
- **After login**: Redirected to `/home` (dashboard)
- **First-time user**: `ProfileGuard` catches missing profile → redirects to `/profile-setup`
- **Deep linking**: Users can bookmark protected pages; they'll redirect through login if needed
- **Player join**: Players scan QR → land on `/play/$sessionId` directly (no auth wall)
- **Loading states**: Brief "Loading…" text while page chunks download
- **404 handling**: Any unmatched route shows the custom `NotFoundPage`
- **Sign out**: Clears session, redirects to `/login` (not `/401`)
