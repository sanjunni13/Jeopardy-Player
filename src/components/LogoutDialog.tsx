import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '../utils/supabase'
import './LogoutDialog.css'

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
      className="logout-backdrop"
      onClick={!loggingOut ? onClose : undefined}
    >
      {/* Panel */}
      <div
        className="logout-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {loggingOut ? (
          /* ── Logging-out state ── */
          <div className="logout-loading">
            <Spinner />
            <p className="logout-loading-text">Logging out now...</p>
          </div>
        ) : (
          /* ── Confirmation state ── */
          <>
            <h2
              id="logout-title"
              className="logout-title"
            >
              Log Out
            </h2>
            <p className="logout-message">
              Are you sure you want to log out of your account?
            </p>
            <div className="logout-actions">
              <button
                type="button"
                onClick={onClose}
                className="logout-btn-cancel"
              >
                No, stay
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="logout-btn-confirm"
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
      className="logout-spinner"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="logout-spinner-bg"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="logout-spinner-fg"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}
