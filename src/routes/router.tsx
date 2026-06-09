import { useEffect } from 'react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  useNavigate,
} from '@tanstack/react-router'
import { AuthProvider, useAuth } from './auth'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import { NotFoundPage } from './pages/NotFoundPage'

// ─── Route Components ────────────────────────────────────────────────────────

/** Redirects to /home or /login depending on auth state. */
function IndexRedirect() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading) {
      navigate({ to: session ? '/home' : '/login', replace: true })
    }
  }, [loading, session, navigate])

  return <p className="p-6 text-slate-300">Redirecting…</p>
}

/**
 * Shell wrapping all protected routes under /home.
 * Any unauthenticated request gets bounced to /401.
 */
function ProtectedShell() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: '/401', replace: true })
    }
  }, [loading, session, navigate])

  if (loading) {
    return <p className="p-6 text-slate-300">Checking authentication…</p>
  }

  return session ? <Outlet /> : null
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
  component: LoginPage,
})

// Protected parent — add any authenticated route as a child of this
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

// ── Example: add more protected routes here ──────────────────────────────────
// const gameRoute = createRoute({
//   getParentRoute: () => protectedRoute,
//   path: '/game',
//   component: GamePage,
// })

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
    // gameRoute,  ← uncomment when you add more protected routes
  ]),
  unauthorizedRoute,
  catchAllRoute,
])

// ─── Router ──────────────────────────────────────────────────────────────────

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundPage,
})

// ─── App Entry ───────────────────────────────────────────────────────────────

export function AppRouter() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
