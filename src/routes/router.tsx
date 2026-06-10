import { RouterProvider } from '@tanstack/react-router'
import { AuthProvider } from './auth'
import { router } from './routeTree'

export function AppRouter() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
