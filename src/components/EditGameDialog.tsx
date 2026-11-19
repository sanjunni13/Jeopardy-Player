import { useRef, useCallback } from 'react'
import { FrostedGlassModal } from './ui/framer-motion-animations'
import './EditGameDialog.css'

interface EditGameDialogProps {
  isOpen: boolean
  gameName: string
  isLoading: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function EditGameDialog({
  isOpen,
  gameName,
  isLoading,
  onConfirm,
  onCancel,
}: EditGameDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Focus trap: Tab cycles between cancel and confirm buttons
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusable = [cancelRef.current, confirmRef.current].filter(
        Boolean,
      ) as HTMLElement[]
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [],
  )

  return (
    <FrostedGlassModal
      open={isOpen}
      onClose={isLoading ? undefined : onCancel}
      ariaLabelledBy="edit-game-dialog-title"
    >
      <div
        className="edit-game-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="edit-game-dialog-title" className="edit-game-dialog__title">
          Edit Published Game
        </h2>

        <p className="edit-game-dialog__message">
          You are about to edit{' '}
          <span className="edit-game-dialog__game-name">&ldquo;{gameName}&rdquo;</span>.
        </p>

        <div className="edit-game-dialog__warning" role="alert">
          <svg
            className="edit-game-dialog__warning-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="edit-game-dialog__warning-text">
            <strong>This will permanently delete the published game and all its data</strong>{' '}
            (play history, ratings, and favorites). A copy will be opened as a draft in the
            builder so you can make changes and republish.
          </p>
        </div>

        <div className="edit-game-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="edit-game-dialog__cancel"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="edit-game-dialog__confirm"
          >
            {isLoading ? 'Preparing…' : 'Edit Game'}
          </button>
        </div>
      </div>
    </FrostedGlassModal>
  )
}
