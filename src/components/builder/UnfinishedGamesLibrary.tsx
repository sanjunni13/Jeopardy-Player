import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { listDrafts, deleteDraft } from '../../utils/draftApi'
import type { DraftMetadata } from '../../utils/draftApi'
import { Button } from '../ui/button'
import { BackgroundGradient } from '../ui/background-gradient'
import './UnfinishedGamesLibrary.css'

interface UnfinishedGamesLibraryProps {
  userEmail: string
}

function getDisplayName(gameName: string): { text: string; isUntitled: boolean } {
  if (gameName !== '') {
    return { text: gameName, isUntitled: false }
  }
  return { text: 'Untitled', isUntitled: true }
}

export function UnfinishedGamesLibrary({ userEmail }: UnfinishedGamesLibraryProps) {
  const navigate = useNavigate()

  const [drafts, setDrafts] = useState<DraftMetadata[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState<DraftMetadata | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ─── Fetch drafts ──────────────────────────────────────────────────────────
  const fetchDrafts = useCallback(async () => {
    if (!userEmail) return
    setIsLoading(true)
    setError(null)

    const result = await listDrafts(userEmail)
    if (result.success) {
      setDrafts(result.drafts)
    } else {
      setError(result.error)
    }
    setIsLoading(false)
  }, [userEmail])

  useEffect(() => {
    if (!userEmail) return
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      const result = await listDrafts(userEmail)
      if (cancelled) return
      if (result.success) {
        setDrafts(result.drafts)
      } else {
        setError(result.error)
      }
      setIsLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [userEmail])

  // ─── Delete handlers ───────────────────────────────────────────────────────
  const handleDeleteClick = (e: React.MouseEvent, draft: DraftMetadata) => {
    e.stopPropagation()
    setDeleteError(null)
    setConfirmDeleteDraft(draft)
  }

  const handleCancelDelete = () => {
    setConfirmDeleteDraft(null)
    setDeleteError(null)
  }

  const handleConfirmDelete = async () => {
    if (!confirmDeleteDraft) return

    setDeletingId(confirmDeleteDraft.id)
    setDeleteError(null)

    const result = await deleteDraft(confirmDeleteDraft.id, userEmail)

    if (result.success) {
      setDrafts((prev) => prev.filter((d) => d.id !== confirmDeleteDraft.id))
      setConfirmDeleteDraft(null)
    } else {
      setDeleteError(result.error)
    }
    setDeletingId(null)
  }

  const handleDraftClick = (draftId: string) => {
    navigate({ to: '/home/create/builder/$draftId', params: { draftId } })
  }

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <section className="unfinished-library" aria-label="Your Unfinished Games">
        <BackgroundGradient containerClassName="unfinished-library-gradient" className="unfinished-library-card">
          <h2 className="unfinished-library-title">Your Unfinished Games</h2>
          <div className="unfinished-library-loading">
            <div
              className="unfinished-library-spinner"
              aria-label="Loading drafts"
              role="status"
            />
            <p>Loading your drafts…</p>
          </div>
        </BackgroundGradient>
      </section>
    )
  }

  // ─── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <section className="unfinished-library" aria-label="Your Unfinished Games">
        <BackgroundGradient containerClassName="unfinished-library-gradient" className="unfinished-library-card">
          <h2 className="unfinished-library-title">Your Unfinished Games</h2>
          <div className="unfinished-library-error">
            <p>Something went wrong loading your drafts. Please try again.</p>
            <button
              type="button"
              onClick={fetchDrafts}
              className="unfinished-library-retry-btn"
            >
              Retry
            </button>
          </div>
        </BackgroundGradient>
      </section>
    )
  }

  // ─── Empty state ───────────────────────────────────────────────────────────
  if (drafts.length === 0) {
    return (
      <section className="unfinished-library" aria-label="Your Unfinished Games">
        <BackgroundGradient containerClassName="unfinished-library-gradient" className="unfinished-library-card">
          <h2 className="unfinished-library-title">Your Unfinished Games</h2>
          <div className="unfinished-library-empty">
            <p>You have no unfinished games in the database. Start one now!</p>
          </div>
        </BackgroundGradient>
      </section>
    )
  }

  // ─── Draft list ────────────────────────────────────────────────────────────
  return (
    <section className="unfinished-library" aria-label="Your Unfinished Games">
      <BackgroundGradient containerClassName="unfinished-library-gradient" className="unfinished-library-card">
        <h2 className="unfinished-library-title">Your Unfinished Games</h2>
        <ul className="unfinished-library-list" role="list">
          {drafts.map((draft) => {
            const { text: displayName, isUntitled } = getDisplayName(draft.game_name)
            return (
              <li key={draft.id} className="unfinished-library-row">
                <button
                  type="button"
                  className="unfinished-library-row-content"
                  onClick={() => handleDraftClick(draft.id)}
                  aria-label={`Resume editing ${displayName}`}
                >
                  <span
                    className={`unfinished-library-name ${isUntitled ? 'unfinished-library-name--untitled' : ''}`}
                  >
                    {displayName}
                  </span>
                  <span className="unfinished-library-date">
                    {new Date(draft.updated_at).toLocaleString()}
                  </span>
                </button>
                <button
                  type="button"
                  className="unfinished-library-delete-btn"
                  onClick={(e) => handleDeleteClick(e, draft)}
                  disabled={deletingId === draft.id}
                  aria-label={`Delete draft ${displayName}`}
                >
                  {deletingId === draft.id ? (
                    <span className="unfinished-library-delete-spinner" aria-hidden="true" />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="unfinished-library-delete-icon"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </BackgroundGradient>

      {/* Delete confirmation modal */}
      {confirmDeleteDraft && (
        <div
          className="unfinished-library-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="unfinished-library-modal">
            <h3 id="delete-modal-title" className="unfinished-library-modal-title">
              Delete Draft
            </h3>
            <p className="unfinished-library-modal-text">
              Are you sure you want to delete{' '}
              <strong>
                {confirmDeleteDraft.game_name || 'Untitled'}
              </strong>
              ? This action cannot be undone.
            </p>
            {deleteError && (
              <p className="unfinished-library-modal-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="unfinished-library-modal-actions">
              <Button
                variant="outline"
                onClick={handleCancelDelete}
                disabled={deletingId === confirmDeleteDraft.id}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={deletingId === confirmDeleteDraft.id}
              >
                {deletingId === confirmDeleteDraft.id ? (
                  <>
                    <span className="unfinished-library-delete-spinner" aria-hidden="true" />
                    Deleting…
                  </>
                ) : (
                  'Delete'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
