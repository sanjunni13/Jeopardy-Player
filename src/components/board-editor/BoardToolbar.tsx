import { Button } from '../ui/button'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BoardToolbarProps {
  gameName: string
  onGameNameChange: (name: string) => void
  onSave: () => void
  onPublish: () => void
  isSaving: boolean
  isPublishing: boolean
  lastSavedAt: Date | null
  autoSaveStatus: 'idle' | 'pending' | 'saving' | 'failed'
  saveMessage: { type: 'success' | 'error'; text: string } | null
  publishMessage: { type: 'success' | 'error'; text: string } | null
  onDismissSaveMessage: () => void
  onDismissPublishMessage: () => void
  gameNameError?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// ─── Spinner SVG ───────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
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
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function BoardToolbar({
  gameName,
  onGameNameChange,
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
  gameNameError,
}: BoardToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-4" role="toolbar" aria-label="Board editor toolbar">
      {/* Game name input */}
      <div className="flex flex-col gap-1">
        <label htmlFor="board-toolbar-game-name" className="sr-only">
          Game name
        </label>
        <input
          id="board-toolbar-game-name"
          type="text"
          value={gameName}
          onChange={(e) => onGameNameChange(e.target.value)}
          placeholder="Enter game name..."
          aria-invalid={!!gameNameError}
          aria-describedby={gameNameError ? 'board-toolbar-game-name-error' : undefined}
          className={`min-w-[200px] rounded-lg border px-3 py-2 text-sm font-medium outline-none transition-colors
            ${gameNameError
              ? 'border-rose-500 bg-slate-950 text-slate-100 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/25'
              : 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:border-purple-700 focus:ring-2 focus:ring-purple-700/25'
            }`}
        />
        {gameNameError && (
          <p
            id="board-toolbar-game-name-error"
            className="text-xs text-rose-400"
            role="alert"
          >
            {gameNameError}
          </p>
        )}
      </div>

      {/* Save button */}
      <Button
        variant="default"
        className="min-h-11"
        onClick={onSave}
        disabled={isSaving}
        aria-label={isSaving ? 'Saving draft...' : 'Save draft'}
      >
        {isSaving && <Spinner />}
        {isSaving ? 'Saving...' : 'Save'}
      </Button>

      {/* Publish button */}
      <Button
        variant="secondary"
        className="min-h-11"
        onClick={onPublish}
        disabled={isPublishing}
        aria-label={isPublishing ? 'Publishing game...' : 'Publish game'}
      >
        {isPublishing && <Spinner />}
        {isPublishing ? 'Publishing...' : 'Publish'}
      </Button>

      {/* Auto-save status indicator */}
      {autoSaveStatus === 'idle' && lastSavedAt && (
        <span className="text-sm text-muted-foreground" role="status">
          Auto-saved at {formatTime(lastSavedAt)}
        </span>
      )}
      {autoSaveStatus === 'saving' && (
        <span className="text-sm text-muted-foreground" role="status">
          Auto-saving...
        </span>
      )}
      {autoSaveStatus === 'failed' && (
        <span className="text-sm text-amber-500" role="alert">
          Auto-save failed. Save manually.
        </span>
      )}

      {/* Save message (success/error inline alert) */}
      {saveMessage && (
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm ${
            saveMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-rose-500/10 text-rose-400'
          }`}
          role="alert"
        >
          {saveMessage.text}
          <button
            type="button"
            onClick={onDismissSaveMessage}
            className="ml-1 rounded p-0.5 text-current opacity-70 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Dismiss save message"
          >
            ×
          </button>
        </span>
      )}

      {/* Publish message (success/error inline alert) */}
      {publishMessage && (
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm ${
            publishMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'bg-rose-500/10 text-rose-400'
          }`}
          role="alert"
        >
          {publishMessage.text}
          <button
            type="button"
            onClick={onDismissPublishMessage}
            className="ml-1 rounded p-0.5 text-current opacity-70 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Dismiss publish message"
          >
            ×
          </button>
        </span>
      )}
    </div>
  )
}
