import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '../utils/supabase'

interface LogoutDialogProps {
  onClose: () => void
  onError: (message: string) => void
}

export function LogoutDialog({ onClose, onError }: LogoutDialogProps) {
  const [loggingOut, setLoggingOut] = useState(false)
  const navigate = useNavigate()

  async function handleConfirm() {
    setLoggingOut(true)
    const { error } = await supabase.auth.signOut()
    if (error) {
      onClose()
      onError('An error occurred while trying to log you out. Please try again.')
      return
    }
    navigate({ to: '/login', replace: true })
  }

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={!loggingOut ? onClose : undefined}
    >
      {/* Panel */}
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {loggingOut ? (
          /* ── Logging-out state ── */
          <div className="flex flex-col items-center gap-4 py-2">
            <Spinner />
            <p className="text-slate-300 font-medium">Logging out now...</p>
          </div>
        ) : (
          /* ── Confirmation state ── */
          <>
            <h2
              id="logout-title"
              className="text-xl font-semibold text-slate-100 mb-2"
            >
              Log Out
            </h2>
            <p className="text-slate-400 text-sm mb-12 pb-4 pt-2">
              Are you sure you want to log out of your account?
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-slate-700 px-5 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
              >
                No, stay
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-400"
              >
                Yes, log out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-10 w-10 animate-spin text-emerald-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}
