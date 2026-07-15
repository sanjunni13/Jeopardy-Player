import { FrostedGlassModal } from '../ui/framer-motion-animations'
import '../LogoutDialog.css'

interface DeleteConfirmationDialogProps {
  isOpen: boolean
  gameName: string
  isDeleting: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmationDialog({
  isOpen,
  gameName,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteConfirmationDialogProps) {
  return (
    <FrostedGlassModal open={isOpen} onClose={!isDeleting ? onCancel : () => {}} ariaLabelledBy="delete-draft-title">
      <div className="logout-panel" onClick={(e) => e.stopPropagation()}>
        {isDeleting ? (
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
            <p className="logout-loading-text">Deleting draft...</p>
          </div>
        ) : (
          <>
            <h2 id="delete-draft-title" className="logout-title">
              Delete Draft
            </h2>
            <p className="logout-message">
              Are you sure you want to delete "<strong>{gameName}</strong>"? This action cannot be undone.
            </p>

            <div className="logout-actions">
              <button
                type="button"
                className="logout-btn-cancel"
                disabled={isDeleting}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="logout-btn-confirm"
                disabled={isDeleting}
                onClick={onConfirm}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </FrostedGlassModal>
  )
}
