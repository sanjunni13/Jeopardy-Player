import { useEffect, useRef, useCallback } from 'react'
import '../LogoutDialog.css'

interface ExitGuardDialogProps {
  isOpen: boolean
  onCancel: () => void
  onSaveAndExit: () => void
  onExitWithoutSaving: () => void
  isSaving?: boolean
  saveError?: string | null
}

const DIALOG_TITLE_ID = 'exit-guard-dialog-title'

export function ExitGuardDialog({
  isOpen,
  onCancel,
  onSaveAndExit,
  onExitWithoutSaving,
  isSaving = false,
  saveError = null,
}: ExitGuardDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return

      if (e.key === 'Escape') {
        onCancel()
        return
      }

      if (e.key === 'Tab') {
        const focusableElements = dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        if (focusableElements.length === 0) return

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    },
    [onCancel]
  )

  useEffect(() => {
    if (!isOpen) return

    const dialog = dialogRef.current
    if (!dialog) return

    const focusableElements = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    const firstElement = focusableElements[0]
    firstElement?.focus()

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  return (
    <div
      className="logout-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={DIALOG_TITLE_ID}
      onClick={!isSaving ? onCancel : undefined}
    >
      <div
        ref={dialogRef}
        className="logout-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {isSaving ? (
          <div className="logout-loading">
            <svg
              className="logout-spinner"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="logout-spinner-bg" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="logout-spinner-fg" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="logout-loading-text">Saving your changes...</p>
          </div>
        ) : (
          <>
            <h2 id={DIALOG_TITLE_ID} className="logout-title">
              Unsaved Changes
            </h2>
            <p className="logout-message">
              You have unsaved changes. What would you like to do?
            </p>

            {saveError && (
              <p className="unfinished-library-modal-error" role="alert">
                {saveError}
              </p>
            )}

            <div className="logout-actions">
              <button
                type="button"
                onClick={onCancel}
                className="logout-btn-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSaveAndExit}
                className="logout-btn-confirm"
                style={{ backgroundColor: 'rgb(99 102 241)' }}
              >
                Save and Exit
              </button>
            </div>
            <div className="logout-actions" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                onClick={onExitWithoutSaving}
                className="logout-btn-confirm"
                style={{ flex: 'none', width: '100%' }}
              >
                Exit Without Saving
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
