import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useBuilderState } from '../../hooks/useBuilderState'
import { useDraftPersistence } from '../../hooks/useDraftPersistence'
import { supabase } from '../../utils/supabase'
import { PointValueDialog } from './PointValueDialog'
import './BoardEditor.css'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface BoardEditorProps {
  draftId?: string
  /** Called when the user confirms board deletion via the delete confirmation dialog */
  onDeleteBoard?: () => void | Promise<void>
  /** Called when the user requests a JSON template download */
  onDownloadJSON?: () => void
  /** Called when the user clicks Publish — receives validation + conversion helpers */
  onPublish?: () => void | Promise<void>
  /** Whether a publish operation is currently in progress */
  isPublishing?: boolean
  /** Publish result message to display in the toolbar */
  publishMessage?: { type: 'success' | 'error'; text: string } | null
  /** Callback to dismiss the publish message */
  onDismissPublishMessage?: () => void
}

/** Methods exposed to parent component via ref */
export interface BoardEditorRef {
  /** Validates the form state for publish and returns true if valid */
  validateForPublish: () => boolean
  /** Converts current form state to a NormalizedGame */
  toNormalizedGame: () => ReturnType<ReturnType<typeof useBuilderState>['toNormalizedGame']>
  /** Converts current form state to a BuilderDraft for export */
  toBuildDraft: () => ReturnType<ReturnType<typeof useBuilderState>['toBuildDraft']>
  /** Current game name */
  getGameName: () => string
  /** Current draft ID from persistence layer */
  getDraftId: () => string | null
  /** Resets dirty state (e.g. after successful publish) */
  resetDirty: () => void
}

/** Identifies which clue cell the clue editor modal is targeting */
interface ClueEditorTarget {
  roundIdx: number
  catIdx: number
  clueIdx: number
}

/** Identifies which row the point value dialog is targeting */
interface PointValueDialogTarget {
  roundIdx: number
  rowIdx: number
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const BoardEditor = forwardRef<BoardEditorRef, BoardEditorProps>(function BoardEditor({
  draftId,
  onDeleteBoard,
  onDownloadJSON,
  onPublish,
  isPublishing,
  publishMessage,
  onDismissPublishMessage,
}, ref) {
  // ─── User email for persistence ──────────────────────────────────────────
  const [userEmail, setUserEmail] = useState<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? '')
    })
  }, [])

  // ─── Builder state hook ──────────────────────────────────────────────────
  const builderState = useBuilderState()
  const {
    formState,
    errors: _errors,
    isDirty,
    resetDirty,
    loadFromDraft,
    toBuildDraft,
  } = builderState

  // ─── Draft persistence hook ──────────────────────────────────────────────
  const persistence = useDraftPersistence(
    isDirty,
    toBuildDraft,
    resetDirty,
    loadFromDraft,
    userEmail
  )
  const { isSaving, lastSavedAt, autoSaveStatus, save, loadDraft } = persistence

  // ─── Expose methods to parent via ref ────────────────────────────────────
  useImperativeHandle(ref, () => ({
    validateForPublish: () => builderState.validateForPublish(),
    toNormalizedGame: () => builderState.toNormalizedGame(),
    toBuildDraft: () => builderState.toBuildDraft(),
    getGameName: () => formState.gameName,
    getDraftId: () => persistence.draftId,
    resetDirty,
  }), [builderState, formState.gameName, persistence.draftId, resetDirty])

  // ─── Load existing draft if draftId is provided ──────────────────────────
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null)
  const [isDraftLoading, setIsDraftLoading] = useState(!!draftId)

  useEffect(() => {
    if (!draftId || !userEmail) return
    let cancelled = false
    loadDraft(draftId).then((result) => {
      if (cancelled) return
      if (!result.success) {
        setDraftLoadError(result.error ?? 'Failed to load draft.')
      }
      setIsDraftLoading(false)
    })
    return () => { cancelled = true }
  }, [draftId, userEmail, loadDraft])

  // ─── UI State: active round tab ─────────────────────────────────────────
  const [activeRound, setActiveRound] = useState<number>(0)

  // ─── UI State: modal/dialog open states ──────────────────────────────────
  const [clueEditorOpen, setClueEditorOpen] = useState<ClueEditorTarget | null>(null)
  const [finalEditorOpen, setFinalEditorOpen] = useState<boolean>(false)
  const [pointValueDialogOpen, setPointValueDialogOpen] = useState<PointValueDialogTarget | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false)

  // ─── Modal handlers ──────────────────────────────────────────────────────
  const _handleCellClick = useCallback((catIdx: number, clueIdx: number) => {
    setClueEditorOpen({ roundIdx: activeRound, catIdx, clueIdx })
  }, [activeRound])

  const handleClueEditorClose = useCallback(() => {
    setClueEditorOpen(null)
  }, [])

  const handleFinalClick = useCallback(() => {
    setFinalEditorOpen(true)
  }, [])

  const handleFinalEditorClose = useCallback(() => {
    setFinalEditorOpen(false)
  }, [])

  const _handlePointValueClick = useCallback((rowIdx: number) => {
    setPointValueDialogOpen({ roundIdx: activeRound, rowIdx })
  }, [activeRound])

  const handlePointValueDialogClose = useCallback(() => {
    setPointValueDialogOpen(null)
  }, [])

  const handleDeleteConfirmOpen = useCallback(() => {
    setDeleteConfirmOpen(true)
  }, [])

  const handleDeleteConfirmClose = useCallback(() => {
    setDeleteConfirmOpen(false)
  }, [])

  // ─── Draft loading state ─────────────────────────────────────────────────
  if (isDraftLoading) {
    return (
      <div className="board-editor board-editor--loading" role="status" aria-label="Loading draft">
        <p>Loading draft...</p>
      </div>
    )
  }

  if (draftLoadError) {
    return (
      <div className="board-editor board-editor--error" role="alert">
        <p>Error: {draftLoadError}</p>
        <button
          type="button"
          onClick={() => {
            setDraftLoadError(null)
            if (draftId && userEmail) {
              setIsDraftLoading(true)
              loadDraft(draftId).then((result) => {
                if (!result.success) {
                  setDraftLoadError(result.error ?? 'Failed to load draft.')
                }
                setIsDraftLoading(false)
              })
            }
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  // ─── Current round data ──────────────────────────────────────────────────
  const currentRound = formState.rounds[activeRound]

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="board-editor">
      {/* BoardToolbar — game name, save, publish, auto-save indicator */}
      <div className="board-editor__toolbar" data-placeholder="BoardToolbar">
        {/* TODO: Replace with <BoardToolbar /> component */}
        <span>Game: {formState.gameName}</span>
        <button type="button" onClick={save} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        {onPublish && (
          <button type="button" onClick={onPublish} disabled={isPublishing}>
            {isPublishing ? 'Publishing...' : 'Publish'}
          </button>
        )}
        {lastSavedAt && (
          <span className="board-editor__autosave-status">
            Last saved: {lastSavedAt.toLocaleTimeString()}
          </span>
        )}
        {autoSaveStatus === 'failed' && (
          <span className="board-editor__autosave-warning" role="alert">
            Auto-save failed. Save manually.
          </span>
        )}
        {publishMessage && (
          <span
            className={`board-editor__publish-message board-editor__publish-message--${publishMessage.type}`}
            role={publishMessage.type === 'error' ? 'alert' : 'status'}
          >
            {publishMessage.text}
            {onDismissPublishMessage && (
              <button type="button" onClick={onDismissPublishMessage} aria-label="Dismiss message">
                ×
              </button>
            )}
          </span>
        )}
      </div>

      {/* RoundTabs — round navigation */}
      <div className="board-editor__round-tabs" data-placeholder="RoundTabs">
        {/* TODO: Replace with <RoundTabs /> component */}
        {formState.rounds.map((_, idx) => (
          <button
            key={idx}
            type="button"
            className={idx === activeRound ? 'round-tab round-tab--active' : 'round-tab'}
            onClick={() => setActiveRound(idx)}
            aria-pressed={idx === activeRound}
          >
            Round {idx + 1}
          </button>
        ))}
      </div>

      {/* BoardGrid — the main grid display */}
      <div className="board-editor__grid" data-placeholder="BoardGrid">
        {/* TODO: Replace with <BoardGrid /> component */}
        {currentRound && (
          <div
            className="board-grid-placeholder"
            role="grid"
            aria-label={`Round ${activeRound + 1} game board`}
          >
            <p>
              Board Grid: {currentRound.categories.length} categories ×{' '}
              {currentRound.pointValues.length} rows
            </p>
          </div>
        )}
      </div>

      {/* FinalSection — Final Jeopardy card */}
      <div className="board-editor__final" data-placeholder="FinalSection">
        {/* TODO: Replace with <FinalSection /> component */}
        <button type="button" onClick={handleFinalClick}>
          Final Jeopardy: {formState.finalRound.category || '(no category)'}
        </button>
        <div className="board-editor__board-settings">
          {onDownloadJSON && (
            <button type="button" onClick={onDownloadJSON} aria-label="Download JSON template">
              Download JSON
            </button>
          )}
          <button type="button" onClick={handleDeleteConfirmOpen} aria-label="Delete board">
            Delete Board
          </button>
        </div>
      </div>

      {/* ─── Modals/Dialogs (rendered conditionally) ─────────────────────── */}

      {/* ClueEditorModal */}
      {clueEditorOpen && (
        <div className="board-editor__modal" data-placeholder="ClueEditorModal" role="dialog" aria-modal="true" aria-label="Edit clue">
          {/* TODO: Replace with <ClueEditorModal /> component */}
          <p>
            Editing clue: Round {clueEditorOpen.roundIdx + 1}, Category{' '}
            {clueEditorOpen.catIdx + 1}, Row {clueEditorOpen.clueIdx + 1}
          </p>
          <button type="button" onClick={handleClueEditorClose}>
            Close
          </button>
        </div>
      )}

      {/* FinalEditorModal */}
      {finalEditorOpen && (
        <div className="board-editor__modal" data-placeholder="FinalEditorModal" role="dialog" aria-modal="true" aria-label="Edit Final Jeopardy">
          {/* TODO: Replace with <FinalEditorModal /> component */}
          <p>Editing Final Jeopardy</p>
          <button type="button" onClick={handleFinalEditorClose}>
            Close
          </button>
        </div>
      )}

      {/* PointValueDialog */}
      {pointValueDialogOpen && (
        <PointValueDialog
          currentValue={formState.rounds[pointValueDialogOpen.roundIdx].pointValues[pointValueDialogOpen.rowIdx]}
          rowIndex={pointValueDialogOpen.rowIdx}
          onConfirm={(newValue) => {
            builderState.updatePointValue(
              pointValueDialogOpen.roundIdx,
              pointValueDialogOpen.rowIdx,
              newValue
            )
            handlePointValueDialogClose()
          }}
          onCancel={handlePointValueDialogClose}
        />
      )}

      {/* DeleteConfirmationDialog */}
      {deleteConfirmOpen && (
        <div className="board-editor__modal board-editor__delete-dialog" data-placeholder="DeleteConfirmationDialog" role="dialog" aria-modal="true" aria-label="Confirm deletion">
          <p>Are you sure you want to delete this board? This action cannot be undone.</p>
          <div className="board-editor__delete-dialog-actions">
            <button type="button" onClick={handleDeleteConfirmClose}>
              Cancel
            </button>
            {onDeleteBoard && (
              <button
                type="button"
                className="board-editor__delete-confirm-btn"
                onClick={() => {
                  handleDeleteConfirmClose()
                  onDeleteBoard()
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

export default BoardEditor
