import { useState, useEffect, useRef, useCallback } from 'react'
import { FrostedGlassModal } from './ui/framer-motion-animations'
import './DeleteAccountDialog.css'

interface DeleteAccountDialogProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

const CONFIRMATION_PHRASE = 'DELETE'

export function DeleteAccountDialog({
  isOpen,
  onConfirm,
  onCancel,
  isLoading = false,
}: DeleteAccountDialogProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const isConfirmEnabled = inputValue === CONFIRMATION_PHRASE

  // Focus the input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setInputValue('')
      inputRef.current.focus()
    }
  }, [isOpen])

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isLoading) {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isLoading, onCancel])

  // Focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return

      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    },
    []
  )

  if (!isOpen) return null

  return (
    <FrostedGlassModal open={isOpen} onClose={!isLoading ? onCancel : () => {}} ariaLabelledBy="delete-account-title">
      <div
        ref={dialogRef}
        className="delete-account-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {isLoading ? (
          <div className="delete-account-dialog__loading">
            <Spinner />
            <p className="delete-account-dialog__loading-text">
              Deleting your account...
            </p>
          </div>
        ) : (
          <>
            <h2 id="delete-account-title" className="delete-account-dialog__title">
              Delete Account
            </h2>

            <p className="delete-account-dialog__warning">
              Account deletion is permanent and cannot be undone. All your games,
              drafts, and stored files will be removed.
            </p>

            <label
              htmlFor="delete-account-confirm-input"
              className="delete-account-dialog__label"
            >
              Type <strong>{CONFIRMATION_PHRASE}</strong> to confirm:
            </label>
            <input
              ref={inputRef}
              id="delete-account-confirm-input"
              type="text"
              className="delete-account-dialog__input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="delete-account-warning"
            />

            <div className="delete-account-dialog__actions">
              <button
                type="button"
                onClick={onCancel}
                className="delete-account-dialog__cancel"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`delete-account-dialog__confirm${!isConfirmEnabled ? ' delete-account-dialog__confirm--disabled' : ''}`}
                disabled={!isConfirmEnabled || isLoading}
              >
                Delete My Account
              </button>
            </div>
          </>
        )}
      </div>
    </FrostedGlassModal>
  )
}

function Spinner() {
  return (
    <svg
      className="delete-account-dialog__spinner"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="delete-account-dialog__spinner-bg"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="delete-account-dialog__spinner-fg"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}
