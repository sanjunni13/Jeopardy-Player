import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { listDrafts, deleteDraft } from '../../utils/draftApi'
import type { DraftMetadata } from '../../utils/draftApi'
import { usePlayerProfileContext } from '../../hooks/usePlayerProfileContext'
import { BackgroundGradient } from '../ui/background-gradient'
import './UnfinishedGamesLibrary.css'
import '../DeleteButton.css'
import '../LogoutDialog.css'

function getDisplayName(gameName: string): { text: string; isUntitled: boolean } {
  if (gameName !== '') {
    return { text: gameName, isUntitled: false }
  }
  return { text: 'Untitled', isUntitled: true }
}

export function UnfinishedGamesLibrary() {
  const { profile } = usePlayerProfileContext()
  const navigate = useNavigate()

  const [drafts, setDrafts] = useState<DraftMetadata[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteDraft, setConfirmDeleteDraft] = useState<DraftMetadata | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ─── Fetch drafts ──────────────────────────────────────────────────────────
  const fetchDrafts = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const result = await listDrafts()
    if (result.success) {
      setDrafts(result.drafts)
    } else {
      setError(result.error)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      const result = await listDrafts()
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
  }, [])

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

    const result = await deleteDraft(confirmDeleteDraft.id)

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
  const sectionTitle = profile ? `${profile.playerName}'s Unfinished Games` : 'Your Unfinished Games'

  if (isLoading) {
    return (
      <section className="unfinished-library" aria-label={sectionTitle}>
        <BackgroundGradient containerClassName="unfinished-library-gradient" className="unfinished-library-card">
          <h2 className="unfinished-library-title">{sectionTitle}</h2>
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
      <section className="unfinished-library" aria-label={sectionTitle}>
        <BackgroundGradient containerClassName="unfinished-library-gradient" className="unfinished-library-card">
          <h2 className="unfinished-library-title">{sectionTitle}</h2>
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
      <section className="unfinished-library" aria-label={sectionTitle}>
        <BackgroundGradient containerClassName="unfinished-library-gradient" className="unfinished-library-card">
          <h2 className="unfinished-library-title">{sectionTitle}</h2>
          <div className="unfinished-library-empty">
            <p>You have no unfinished games in the database. Start one now!</p>
          </div>
        </BackgroundGradient>
      </section>
    )
  }

  // ─── Draft list ────────────────────────────────────────────────────────────
  return (
    <section className="unfinished-library" aria-label={sectionTitle}>
      <BackgroundGradient containerClassName="unfinished-library-gradient" className="unfinished-library-card">
        <h2 className="unfinished-library-title">{sectionTitle}</h2>
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
                  className="delete-button"
                  onClick={(e) => handleDeleteClick(e, draft)}
                  disabled={deletingId === draft.id}
                  aria-label={`Delete draft ${displayName}`}
                >
                  {deletingId === draft.id ? (
                    <span className="unfinished-library-delete-spinner" aria-hidden="true" />
                  ) : (
                    <svg
                      className="trash-svg"
                      viewBox="0 -10 64 74"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <g id="trash-can">
                        <rect x="16" y="24" width="32" height="30" rx="3" ry="3" fill="#e74c3c" />
                        <g style={{ transformOrigin: '12px 18px' }} id="lid-group">
                          <rect x="12" y="12" width="40" height="6" rx="2" ry="2" fill="#c0392b" />
                          <rect x="26" y="8" width="12" height="4" rx="2" ry="2" fill="#c0392b" />
                        </g>
                      </g>
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
          className="logout-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          onClick={deletingId !== confirmDeleteDraft.id ? handleCancelDelete : undefined}
        >
          <div
            className="logout-panel"
            onClick={(e) => e.stopPropagation()}
          >
            {deletingId === confirmDeleteDraft.id ? (
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
                <h2 id="delete-modal-title" className="logout-title">
                  Delete Draft
                </h2>
                <p className="logout-message">
                  Are you sure you want to delete{' '}
                  <strong>{confirmDeleteDraft.game_name || 'Untitled'}</strong>?
                  This action cannot be undone.
                </p>
                {deleteError && (
                  <p className="unfinished-library-modal-error" role="alert">
                    {deleteError}
                  </p>
                )}
                <div className="logout-actions">
                  <button
                    type="button"
                    onClick={handleCancelDelete}
                    className="logout-btn-cancel"
                  >
                    No, keep it
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    className="logout-btn-confirm"
                  >
                    Yes, delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
