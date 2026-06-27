interface BuilderToolbarProps {
  onSave: () => void
  onPublish: () => void
  isSaving: boolean
  isPublishing: boolean
  lastSavedAt: Date | null
  autoSaveStatus: 'idle' | 'pending' | 'saving' | 'failed'
}

function formatLastSaved(lastSavedAt: Date): string {
  const DAY_MS = 24 * 60 * 60 * 1000
  const isOlderThanDay = lastSavedAt.getTime() < Date.now() - DAY_MS
  return isOlderThanDay
    ? `${lastSavedAt.toLocaleDateString()} ${lastSavedAt.toLocaleTimeString()}`
    : lastSavedAt.toLocaleTimeString()
}

export function BuilderToolbar({
  onSave,
  onPublish,
  isSaving,
  isPublishing,
  lastSavedAt,
  autoSaveStatus,
}: BuilderToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-4">
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        aria-label={isSaving ? 'Saving draft...' : 'Save draft'}
        className="flex items-center gap-2 rounded-full border border-slate-500 px-6 py-3 text-sm font-bold text-slate-200 bg-slate-700 cursor-pointer transition-all duration-500 hover:bg-slate-600 hover:shadow-[0_0_20px_rgba(100,116,139,0.3)] hover:scale-105 active:bg-slate-800 active:shadow-none active:scale-[0.98] active:transition-all active:duration-[250ms] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
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
        {isSaving ? 'Saving...' : 'Save Draft'}
      </button>

      <button
        type="button"
        onClick={onPublish}
        disabled={isPublishing}
        aria-label={isPublishing ? 'Publishing game...' : 'Publish game'}
        className="flex items-center gap-2 rounded-full border-0 px-6 py-3 text-sm font-bold text-white bg-emerald-600 cursor-pointer transition-all duration-500 hover:bg-emerald-500 hover:shadow-[0_0_20px_rgba(52,211,153,0.3)] hover:scale-105 active:bg-emerald-700 active:shadow-none active:scale-[0.98] active:transition-all active:duration-[250ms] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
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
      </button>

      {/* Auto-save status indicator */}
      {autoSaveStatus === 'saving' && (
        <span className="text-sm text-muted-foreground" role="status">
          Auto-saving...
        </span>
      )}
      {autoSaveStatus === 'failed' && (
        <span className="text-sm text-red-500" role="status">
          Auto-save failed. Save manually.
        </span>
      )}

      {/* Last saved label */}
      {autoSaveStatus === 'idle' && lastSavedAt && (
        <span className="text-sm text-muted-foreground" role="status">
          Last saved at {formatLastSaved(lastSavedAt)}
        </span>
      )}
    </div>
  )
}
