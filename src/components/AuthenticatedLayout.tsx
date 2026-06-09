import { useState } from 'react'
import { Outlet } from '@tanstack/react-router'
import { LogoutDialog } from './LogoutDialog'
import { Toast } from './Toast'

export function AuthenticatedLayout() {
  const [showLogout, setShowLogout] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm px-6 py-3">
        <span className="text-lg font-semibold tracking-tight text-slate-100">
          Jeopardy Player
        </span>
        <button
          type="button"
          onClick={() => setShowLogout(true)}
          className="rounded-full border border-slate-700 px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:border-rose-500/60 hover:text-rose-400"
        >
          Log out
        </button>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── Logout dialog ── */}
      {showLogout && (
        <LogoutDialog
          onClose={() => setShowLogout(false)}
          onError={(msg) => setToastMessage(msg)}
        />
      )}

      {/* ── Error toast ── */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </div>
  )
}
