import { Button } from '../ui/button'

interface BuilderToolbarProps {
  onSave: () => void
  onPublish: () => void
  isSaving: boolean
  isPublishing: boolean
  lastSavedAt: Date | null
  autoSaveStatus: 'idle' | 'pending' | 'saving' | 'failed'
  saveMessage?: { type: 'success' | 'error'; text: string } | null
  publishMessage?: { type: 'success' | 'error'; text: string } | null
  onDismissSaveMessage?: () => void
  onDismissPublishMessage?: () => void
}

export function BuilderToolbar({
  onSave,
  onPublish,
  isSaving,
  isPublishing,
  lastSavedAt,
  autoSaveStatus,
  saveMessage,
  publishMessage,
  onDismissSaveMessage,
  onDismissPublishMessage,
}: BuilderToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-4">
      <Button
        variant="default"
        className="min-h-11"
        onClick={onSave}
        disabled={isSaving}
        aria-label={isSaving ? 'Saving draft...' : 'Save draft'}
      >
        {isSaving && (
          <svg
            className="size-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {isSaving ? 'Saving...' : 'Save'}
      </Button>

      <Button
        variant="secondary"
        className="min-h-11"
        onClick={onPublish}
        disabled={isPublishing}
        aria-label={isPublishing ? 'Publishing game...' : 'Publish game'}
      >
        {isPublishing && (
          <svg
            className="size-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {isPublishing ? 'Publishing...' : 'Publish'}
      </Button>

      {/* Auto-save status indicator */}
      {autoSaveStatus === 'idle' && lastSavedAt && (
        <span className="text-sm text-muted-foreground" role="status">
          Draft saved at {lastSavedAt.toLocaleTimeString()}
        </span>
      )}
      {autoSaveStatus === 'saving' && (
        <span className="text-sm text-muted-foreground" role="status">
          Auto-saving...
        </span>
      )}
      {autoSaveStatus === 'failed' && (
        <span className="text-sm text-amber-500" role="status">
          Auto-save failed. Save manually.
        </span>
      )}

      {/* Save message */}
      {saveMessage && (
        <span
          className={`text-sm ${saveMessage.type === 'success' ? 'text-green-500' : 'text-destructive'}`}
          role="status"
        >
          {saveMessage.text}
          {onDismissSaveMessage && (
            <button
              type="button"
              onClick={onDismissSaveMessage}
              className="ml-2 text-xs underline"
              aria-label="Dismiss save message"
            >
              ×
            </button>
          )}
        </span>
      )}

      {/* Publish message */}
      {publishMessage && (
        <span
          className={`text-sm ${publishMessage.type === 'success' ? 'text-green-500' : 'text-destructive'}`}
          role="status"
        >
          {publishMessage.text}
          {onDismissPublishMessage && (
            <button
              type="button"
              onClick={onDismissPublishMessage}
              className="ml-2 text-xs underline"
              aria-label="Dismiss publish message"
            >
              ×
            </button>
          )}
        </span>
      )}
    </div>
  )
}
