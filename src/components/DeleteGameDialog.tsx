import { useRef, useCallback } from 'react'
import { FrostedGlassModal } from './ui/framer-motion-animations'
import './DeleteGameDialog.css'

interface DeleteGameDialogProps {
  isOpen: boolean
  gameName: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteGameDialog({ isOpen, gameName, onConfirm, onCancel }: DeleteGameDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus trap: Tab cycles between cancel and confirm buttons
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return

    const focusableElements = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[]
    if (focusableElements.length === 0) return

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
  }, [])

  return (
    <FrostedGlassModal open={isOpen} onClose={onCancel} ariaLabelledBy="delete-game-dialog-title">
      <div
        ref={dialogRef}
        className="delete-game-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="delete-game-dialog-title" className="delete-game-dialog__title">
          Delete Game
        </h2>
        <p className="delete-game-dialog__message">
          Are you sure you want to delete &ldquo;<span className="delete-game-dialog__game-name">{gameName}</span>&rdquo;? This action cannot be undone.
        </p>
        <div className="delete-game-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="delete-game-dialog__cancel"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="delete-game-dialog__confirm"
          >
            Delete
          </button>
        </div>
      </div>
    </FrostedGlassModal>
  )
}
