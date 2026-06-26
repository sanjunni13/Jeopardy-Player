import { AlertDialog } from 'radix-ui'
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
    <AlertDialog.Root open={isOpen} onOpenChange={(open) => { if (!open && !isDeleting) onCancel() }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="logout-backdrop" />
        <AlertDialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center"
          onEscapeKeyDown={isDeleting ? (e) => e.preventDefault() : undefined}
        >
          <div className="logout-panel">
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
                <AlertDialog.Title className="logout-title">
                  Delete Draft
                </AlertDialog.Title>
                <AlertDialog.Description className="logout-message">
                  Are you sure you want to delete "<strong>{gameName}</strong>"? This action cannot be undone.
                </AlertDialog.Description>

                <div className="logout-actions">
                  <AlertDialog.Cancel asChild>
                    <button
                      type="button"
                      className="logout-btn-cancel"
                      disabled={isDeleting}
                      onClick={onCancel}
                    >
                      Cancel
                    </button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <button
                      type="button"
                      className="logout-btn-confirm"
                      disabled={isDeleting}
                      onClick={onConfirm}
                    >
                      Delete
                    </button>
                  </AlertDialog.Action>
                </div>
              </>
            )}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
