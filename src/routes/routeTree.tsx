import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { IndexRedirect, ProtectedShell } from './routeComponents'
import { NotFoundPage } from './pages/NotFoundPage'
import { PreferencesProvider } from '../contexts/PreferencesProvider'

// ─── Lazy-loaded page components ─────────────────────────────────────────────

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })))
const ProfileSetupPage = lazy(() => import('./pages/ProfileSetupPage').then(m => ({ default: m.ProfileSetupPage })))
const UnauthorizedPage = lazy(() => import('./pages/UnauthorizedPage').then(m => ({ default: m.UnauthorizedPage })))
const UploadPage = lazy(() => import('./pages/UploadPage').then(m => ({ default: m.UploadPage })))
const GamePage = lazy(() => import('./pages/GamePage').then(m => ({ default: m.GamePage })))
const GameLibraryPage = lazy(() => import('./pages/GameLibraryPage').then(m => ({ default: m.GameLibraryPage })))
const GenerateGamePage = lazy(() => import('./pages/GenerateGamePage').then(m => ({ default: m.GenerateGamePage })))
const CreateGamePage = lazy(() => import('./pages/CreateGamePage').then(m => ({ default: m.CreateGamePage })))
const BuilderPage = lazy(() => import('./pages/BuilderPage').then(m => ({ default: m.BuilderPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const PlaySessionPage = lazy(() => import('./pages/PlaySessionPage').then(m => ({ default: m.PlaySessionPage })))

function LazyFallback() {
  return <p className="p-6 text-slate-300">Loading…</p>
}

function withSuspense(Component: React.LazyExoticComponent<React.ComponentType>) {
  return function SuspenseWrapper() {
    return (
      <Suspense fallback={<LazyFallback />}>
        <Component />
      </Suspense>
    )
  }
}

// ─── Route Tree ──────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({
  component: () => (
    <PreferencesProvider>
      <Outlet />
    </PreferencesProvider>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexRedirect,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: withSuspense(LoginPage),
})

const profileSetupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile-setup',
  component: withSuspense(ProfileSetupPage),
})

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/home',
  component: ProtectedShell,
})

const homeIndexRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/',
  component: withSuspense(HomePage),
})

const uploadRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/upload',
  component: withSuspense(UploadPage),
})

const gameRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/game/$gameId',
  component: withSuspense(GamePage),
})

const libraryRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/library',
  component: withSuspense(GameLibraryPage),
})

const generateRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/generate',
  component: withSuspense(GenerateGamePage),
})

const createGameRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/create',
  component: withSuspense(CreateGamePage),
})

const builderNewRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/create/builder',
  component: withSuspense(BuilderPage),
})

const builderResumeRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/create/builder/$draftId',
  component: withSuspense(BuilderPage),
})

const settingsRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/settings',
  component: withSuspense(SettingsPage),
})

const playSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/$sessionId',
  component: withSuspense(PlaySessionPage),
})

const unauthorizedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/401',
  component: withSuspense(UnauthorizedPage),
})

const catchAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '*',
  component: NotFoundPage,
})

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

// ─── Router ──────────────────────────────────────────────────────────────────

export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
  defaultNotFoundComponent: NotFoundPage,
})
