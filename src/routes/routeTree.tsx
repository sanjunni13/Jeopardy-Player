import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { IndexRedirect, ProtectedShell } from './routeComponents'
import { NotFoundPage } from './pages/NotFoundPage'

// ─── Lazy-loaded page components ─────────────────────────────────────────────

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })))
const UnauthorizedPage = lazy(() => import('./pages/UnauthorizedPage').then(m => ({ default: m.UnauthorizedPage })))
const UploadPage = lazy(() => import('./pages/UploadPage').then(m => ({ default: m.UploadPage })))
const GamePage = lazy(() => import('./pages/GamePage').then(m => ({ default: m.GamePage })))
const GameLibraryPage = lazy(() => import('./pages/GameLibraryPage').then(m => ({ default: m.GameLibraryPage })))
const GenerateGamePage = lazy(() => import('./pages/GenerateGamePage').then(m => ({ default: m.GenerateGamePage })))
const CreateGamePage = lazy(() => import('./pages/CreateGamePage').then(m => ({ default: m.CreateGamePage })))

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
  component: () => <Outlet />,
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
  protectedRoute.addChildren([
    homeIndexRoute,
    uploadRoute,
    createGameRoute,
    gameRoute,
    libraryRoute,
    generateRoute,
  ]),
  unauthorizedRoute,
  catchAllRoute,
])

// ─── Router ──────────────────────────────────────────────────────────────────

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundPage,
})
