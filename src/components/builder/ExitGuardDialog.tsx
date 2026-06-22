import { useEffect, useRef, useCallback } from 'react'
import { Button } from '../ui/button'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={DIALOG_TITLE_ID}
        className="bg-card rounded-xl p-6 max-w-md w-full mx-4 shadow-lg border border-border"
      >
        <h2
          id={DIALOG_TITLE_ID}
          className="text-lg font-semibold text-foreground mb-2"
        >
          Unsaved Changes
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          You have unsaved changes. What would you like to do?
        </p>

        {saveError && (
          <p className="text-sm text-destructive mt-2 mb-4" role="alert">
            {saveError}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={onCancel}
            className="min-h-11"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={onSaveAndExit}
            disabled={isSaving}
            className="min-h-11"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin size-4"
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
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Saving…
              </span>
            ) : (
              'Save and Exit'
            )}
          </Button>
          <Button
            variant="destructive"
            onClick={onExitWithoutSaving}
            className="min-h-11"
          >
            Exit Without Saving
          </Button>
        </div>
      </div>
    </div>
  )
}
