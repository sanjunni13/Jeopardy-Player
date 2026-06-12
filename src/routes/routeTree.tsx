import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router'
import { IndexRedirect, ProtectedShell } from './routeComponents'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { UploadPage } from './pages/UploadPage'
import { GamePage } from './pages/GamePage'
import { GameLibraryPage } from './pages/GameLibraryPage'
import { GenerateGamePage } from './pages/GenerateGamePage'

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
  component: LoginPage,
})

const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/home',
  component: ProtectedShell,
})

const homeIndexRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/',
  component: HomePage,
})

const uploadRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/upload',
  component: UploadPage,
})

const gameRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/game/$gameId',
  component: GamePage,
})

const libraryRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/library',
  component: GameLibraryPage,
})

const generateRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/generate',
  component: GenerateGamePage,
})

const unauthorizedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/401',
  component: UnauthorizedPage,
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
