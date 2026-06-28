import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams, useBlocker } from '@tanstack/react-router'
import { toast } from 'react-toastify'
import { supabase } from '../../utils/supabase'
import { useBuilderState } from '../../hooks/useBuilderState'
import { useDraftPersistence } from '../../hooks/useDraftPersistence'
import { saveGame } from '../../utils/gameApi'
import { deleteDraft } from '../../utils/draftApi'
import { uploadClueMedia, deleteClueMedia, refreshMediaUrl } from '../../utils/mediaApi'
import { validateDraftForPublish } from '../../utils/draftValidation'
import { usePlayerProfileContext } from '../../hooks/usePlayerProfileContext'
import { BackButton } from '../../components/BackButton'
import { DeleteButton } from '../../components/DeleteButton'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import { BuilderForm } from '../../components/builder/BuilderForm'
import { ExitGuardDialog } from '../../components/builder/ExitGuardDialog'
import { DeleteConfirmationDialog } from '../../components/builder/DeleteConfirmationDialog'
import type { MediaData } from '../../utils/builderFormStructure'
import './BuilderPage.css'

// ─── Media upload state types ──────────────────────────────────────────────────

export interface MediaUploadState {
  isUploading: boolean
  error: string | null
}

export type MediaUploadStates = Record<string, MediaUploadState>

export function BuilderPage() {
  const navigate = useNavigate()
  const { draftId } = useParams({ strict: false }) as { draftId?: string }
  const { profile } = usePlayerProfileContext()

  // ─── Auth state ──────────────────────────────────────────────────────────
  const [userEmail, setUserEmail] = useState<string>('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? '')
    })
  }, [])

  // ─── Builder state ───────────────────────────────────────────────────────
  const {
    formState,
    errors,
    isDirty,
    setGameName,
    setTotalRounds,
    setCategoriesPerRound,
    setCategoryName,
    setClueField,
    setFinalField,
    validateField,
    validateForPublish,
    resetDirty,
    loadFromDraft,
    toBuildDraft,
    toNormalizedGame,
  } = useBuilderState()

  // ─── Draft persistence ───────────────────────────────────────────────────
  const {
    draftId: currentDraftId,
    isSaving,
    lastSavedAt,
    autoSaveStatus,
    save,
    loadDraft,
  } = useDraftPersistence(isDirty, toBuildDraft, resetDirty, loadFromDraft, userEmail)

  // ─── Local UI state ──────────────────────────────────────────────────────
  const [isPublishing, setIsPublishing] = useState(false)

  // Loading state for draft resume
  const [isLoadingDraft, setIsLoadingDraft] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // ─── Delete state ────────────────────────────────────────────────────────
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // ─── Media upload state ──────────────────────────────────────────────────
  const [mediaUploadStates, setMediaUploadStates] = useState<MediaUploadStates>({})

  const getMediaKey = (roundIdx: number, catIdx: number, clueIdx: number) =>
    `${roundIdx}-${catIdx}-${clueIdx}`

  const handleMediaAttach = useCallback(async (
    roundIdx: number,
    catIdx: number,
    clueIdx: number,
    fileOrUrl: File | string
  ) => {
    const key = getMediaKey(roundIdx, catIdx, clueIdx)
    const isFinalJeopardy = roundIdx >= formState.totalRounds

    // If it's a YouTube URL string, just set the media field directly
    if (typeof fileOrUrl === 'string') {
      // If existing media is an uploaded file, delete it first
      const existingMedia = isFinalJeopardy
        ? formState.finalRound.media
        : formState.rounds[roundIdx]?.[catIdx]?.clues[clueIdx]?.media
      if (existingMedia && (existingMedia.type === 'image' || existingMedia.type === 'audio')) {
        deleteClueMedia(existingMedia.url, existingMedia.storagePath) // fire and forget for replacement
      }

      const mediaData: MediaData = { type: 'youtube', url: fileOrUrl }
      if (isFinalJeopardy) {
        setFinalField('media', mediaData)
      } else {
        setClueField(roundIdx, catIdx, clueIdx, 'media', mediaData)
      }
      // Clear any previous error for this clue
      setMediaUploadStates(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      return
    }

    // File upload path
    const activeDraftId = currentDraftId ?? draftId
    if (!activeDraftId) {
      // Need to save draft first to get a draftId
      const saveResult = await save()
      if (!saveResult.success) {
        setMediaUploadStates(prev => ({
          ...prev,
          [key]: { isUploading: false, error: 'Save the draft first to attach media.' },
        }))
        return
      }
    }

    const uploadDraftId = currentDraftId ?? draftId
    if (!uploadDraftId) {
      setMediaUploadStates(prev => ({
        ...prev,
        [key]: { isUploading: false, error: 'Could not determine draft ID.' },
      }))
      return
    }

    // If existing media is an uploaded file, delete it first
    const existingMedia = isFinalJeopardy
      ? formState.finalRound.media
      : formState.rounds[roundIdx]?.[catIdx]?.clues[clueIdx]?.media
    if (existingMedia && (existingMedia.type === 'image' || existingMedia.type === 'audio')) {
      await deleteClueMedia(existingMedia.url, existingMedia.storagePath)
    }

    // Set uploading state
    setMediaUploadStates(prev => ({
      ...prev,
      [key]: { isUploading: true, error: null },
    }))

    const result = await uploadClueMedia(fileOrUrl, uploadDraftId, roundIdx, catIdx, clueIdx)

    if (result.success) {
      // Determine media type from file extension
      const ext = fileOrUrl.name.toLowerCase().split('.').pop() ?? ''
      const isAudio = ext === 'mp3'
      const mediaData: MediaData = isAudio
        ? { type: 'audio', url: result.url, fileName: fileOrUrl.name, storagePath: result.storagePath }
        : { type: 'image', url: result.url, fileName: fileOrUrl.name, storagePath: result.storagePath }

      if (isFinalJeopardy) {
        setFinalField('media', mediaData)
      } else {
        setClueField(roundIdx, catIdx, clueIdx, 'media', mediaData)
      }
      setMediaUploadStates(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    } else {
      setMediaUploadStates(prev => ({
        ...prev,
        [key]: { isUploading: false, error: result.error },
      }))
    }
  }, [formState, currentDraftId, draftId, save, setClueField, setFinalField])

  const handleMediaRemove = useCallback(async (
    roundIdx: number,
    catIdx: number,
    clueIdx: number
  ) => {
    const isFinalJeopardy = roundIdx >= formState.totalRounds
    const media = isFinalJeopardy
      ? formState.finalRound.media
      : formState.rounds[roundIdx]?.[catIdx]?.clues[clueIdx]?.media
    if (!media) return

    // If it's an uploaded file (image/audio), delete from storage
    if (media.type === 'image' || media.type === 'audio') {
      const result = await deleteClueMedia(media.url, media.storagePath)
      if (!result.success) {
        const key = getMediaKey(roundIdx, catIdx, clueIdx)
        setMediaUploadStates(prev => ({
          ...prev,
          [key]: { isUploading: false, error: result.error },
        }))
        return
      }
    }

    // Clear the media field
    if (isFinalJeopardy) {
      setFinalField('media', null)
    } else {
      setClueField(roundIdx, catIdx, clueIdx, 'media', null)
    }
    // Clear any error state
    const key = getMediaKey(roundIdx, catIdx, clueIdx)
    setMediaUploadStates(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [formState, setClueField, setFinalField])

  // ─── Exit guard (in-app navigation) ──────────────────────────────────────
  const { proceed, reset, status } = useBlocker({ condition: isDirty })
  const [exitGuardSaving, setExitGuardSaving] = useState(false)
  const [exitGuardSaveError, setExitGuardSaveError] = useState<string | null>(null)

  const handleExitCancel = useCallback(() => {
    setExitGuardSaveError(null)
    reset?.()
  }, [reset])

  const handleSaveAndExit = useCallback(async () => {
    setExitGuardSaving(true)
    setExitGuardSaveError(null)

    const result = await save()
    setExitGuardSaving(false)

    if (result.success) {
      proceed?.()
    } else {
      setExitGuardSaveError(result.error ?? 'Save failed. Please try again.')
    }
  }, [save, proceed])

  const handleExitWithoutSaving = useCallback(() => {
    setExitGuardSaveError(null)
    proceed?.()
  }, [proceed])

  // ─── Browser close/refresh guard ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // ─── Load draft on mount (if draftId param present) ──────────────────────
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!draftId || !userEmail || hasLoadedRef.current) return
    hasLoadedRef.current = true

    setIsLoadingDraft(true)
    setLoadError(null)

    loadDraft(draftId).then((result) => {
      setIsLoadingDraft(false)
      if (!result.success) {
        setLoadError(result.error ?? 'Failed to load draft.')
      }
    })
  }, [draftId, userEmail, loadDraft])

  // ─── Refresh expired media URLs after draft loads ─────────────────────────
  const hasRefreshedMediaRef = useRef(false)
  useEffect(() => {
    if (isLoadingDraft || hasRefreshedMediaRef.current) return
    if (!formState.rounds.length) return
    hasRefreshedMediaRef.current = true

    // Walk all clues and refresh any media with a storagePath
    const refreshAll = async () => {
      for (let rIdx = 0; rIdx < formState.rounds.length; rIdx++) {
        for (let cIdx = 0; cIdx < formState.rounds[rIdx].length; cIdx++) {
          for (let qIdx = 0; qIdx < formState.rounds[rIdx][cIdx].clues.length; qIdx++) {
            const media = formState.rounds[rIdx][cIdx].clues[qIdx].media
            if (media && (media.type === 'image' || media.type === 'audio') && media.storagePath) {
              const freshUrl = await refreshMediaUrl(media.storagePath)
              if (freshUrl) {
                setClueField(rIdx, cIdx, qIdx, 'media', { ...media, url: freshUrl })
              }
            }
          }
        }
      }
      // Also refresh Final Jeopardy media
      const finalMedia = formState.finalRound.media
      if (finalMedia && (finalMedia.type === 'image' || finalMedia.type === 'audio') && finalMedia.storagePath) {
        const freshUrl = await refreshMediaUrl(finalMedia.storagePath)
        if (freshUrl) {
          setFinalField('media', { ...finalMedia, url: freshUrl })
        }
      }
    }
    refreshAll()
  }, [isLoadingDraft, formState.rounds, formState.finalRound.media, setClueField, setFinalField])

  // ─── Retry draft load ────────────────────────────────────────────────────
  const handleRetryLoad = useCallback(() => {
    if (!draftId || !userEmail) return
    setIsLoadingDraft(true)
    setLoadError(null)

    loadDraft(draftId).then((result) => {
      setIsLoadingDraft(false)
      if (!result.success) {
        setLoadError(result.error ?? 'Failed to load draft.')
      }
    })
  }, [draftId, userEmail, loadDraft])

  // ─── Save handler (no validation — saves draft as-is) ─────────────────────
  const handleSave = useCallback(async () => {
    const result = await save()
    if (result.success) {
      toast.success('Draft saved successfully.')
    } else {
      const errorText = result.error ?? 'Save failed.'
      const isAuthError = errorText.toLowerCase().includes('auth') || errorText.toLowerCase().includes('not authenticated')
      toast.error(
        isAuthError
          ? 'Session expired. Please log in again.'
          : errorText,
      )
    }
  }, [save])

  // ─── Delete handlers ─────────────────────────────────────────────────────
  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true)
  }, [])

  const handleDeleteCancel = useCallback(() => {
    setIsDeleteDialogOpen(false)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    const activeDraftId = currentDraftId ?? draftId
    if (!activeDraftId || !userEmail) return

    setIsDeleting(true)

    try {
      await deleteDraft(activeDraftId, userEmail)
      setIsDeleteDialogOpen(false)
      setIsDeleting(false)
      resetDirty()
      toast.success('Draft deleted successfully.')
      navigate({ to: '/home/create' })
    } catch {
      setIsDeleting(false)
      setIsDeleteDialogOpen(false)
      toast.error('Could not delete draft. Please try again.')
    }
  }, [currentDraftId, draftId, userEmail, resetDirty, navigate])

  // ─── Publish handler ─────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    // 1. Run form-level validation (sets inline errors on each invalid field)
    const formValid = validateForPublish()

    // 2. Also validate the draft object using draftValidation.ts
    const draft = toBuildDraft()
    const draftValidation = validateDraftForPublish(draft)

    if (!formValid || !draftValidation.valid) {
      toast.error('Please fix all errors before publishing.')
      return
    }

    // 2. Start publishing
    setIsPublishing(true)

    try {
      // 3. Convert to normalized game
      const normalizedGame = toNormalizedGame()

      // 4. Save game
      const result = await saveGame(formState.gameName, normalizedGame, profile?.playerId)

      if ('success' in result && result.success) {
        // 5. Delete draft if one exists
        const activeDraftId = currentDraftId ?? draftId
        if (activeDraftId && userEmail) {
          await deleteDraft(activeDraftId, userEmail)
        }

        // 6. Show success and navigate
        toast.success('Game published successfully!')
        resetDirty() // Clear dirty state so navigation isn't blocked
        setTimeout(() => {
          navigate({ to: '/home/library' })
        }, 2000)
      } else if ('alreadyExists' in result && result.alreadyExists) {
        toast.error('A game with this name already exists. Please choose a different name.')
        // Focus the game name field
        const gameNameInput = document.getElementById('builder-game-name')
        gameNameInput?.focus()
      } else {
        const errorText = 'error' in result ? result.error : 'Publish failed.'
        toast.error(errorText)
      }
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setIsPublishing(false)
    }
  }, [validateForPublish, toBuildDraft, toNormalizedGame, formState.gameName, profile, currentDraftId, draftId, userEmail, resetDirty, navigate])

  // ─── Render: Loading state ───────────────────────────────────────────────
  if (isLoadingDraft) {
    return (
      <div className="builder-page flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full mx-auto" aria-label="Loading draft" />
          <p className="text-muted-foreground">Loading draft…</p>
        </div>
      </div>
    )
  }

  // ─── Render: Load error state ────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="builder-page flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-destructive" role="alert">{loadError}</p>
          <button
            type="button"
            onClick={handleRetryLoad}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-11"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: '/home' })}
            className="ml-3 px-4 py-2 rounded-lg border border-border text-foreground hover:bg-accent transition-colors min-h-11"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  // ─── Render: Main builder ────────────────────────────────────────────────
  return (
    <div className="builder-page">
      <BackgroundGradient containerClassName="max-w-4xl mx-auto" className="p-6 rounded-lg bg-slate-900/95 border border-slate-800">
        <div className="relative">
          <BackButton onClick={() => navigate({ to: '/home/create' })} label="Back to create" />
          {(currentDraftId ?? draftId) && (
            <div className="absolute top-0 right-0">
              <DeleteButton
                onClick={handleDeleteClick}
                label="Delete draft"
              />
            </div>
          )}
        </div>

        <h1 className="text-2xl font-bold text-foreground mt-4 mb-6">
          {draftId ? 'Resume Draft' : 'Build a Game'}
        </h1>

        <BuilderForm
          formState={formState}
          errors={errors}
          isDirty={isDirty}
          isSaving={isSaving}
          isPublishing={isPublishing}
          lastSavedAt={lastSavedAt}
          autoSaveStatus={autoSaveStatus}
          onSetGameName={setGameName}
          onSetTotalRounds={setTotalRounds}
          onSetCategoriesPerRound={setCategoriesPerRound}
          onSetCategoryName={setCategoryName}
          onSetClueField={setClueField}
          onSetFinalField={setFinalField}
          onValidateField={validateField}
          onSave={handleSave}
          onPublish={handlePublish}
          onMediaAttach={handleMediaAttach}
          onMediaRemove={handleMediaRemove}
          mediaUploadingState={
            Object.fromEntries(
              Object.entries(mediaUploadStates).map(([key, state]) => [key, state.isUploading])
            )
          }
          mediaErrors={
            Object.fromEntries(
              Object.entries(mediaUploadStates).map(([key, state]) => [key, state.error])
            )
          }
        />
      </BackgroundGradient>

      {/* Exit Guard Dialog */}
      <ExitGuardDialog
        isOpen={status === 'blocked'}
        onCancel={handleExitCancel}
        onSaveAndExit={handleSaveAndExit}
        onExitWithoutSaving={handleExitWithoutSaving}
        isSaving={exitGuardSaving}
        saveError={exitGuardSaveError}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        gameName={formState.gameName || 'Untitled Game'}
        isDeleting={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  )
}
