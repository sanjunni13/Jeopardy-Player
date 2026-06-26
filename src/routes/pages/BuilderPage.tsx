import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams, useBlocker } from '@tanstack/react-router'
import { supabase } from '../../utils/supabase'
import { useBuilderState } from '../../hooks/useBuilderState'
import { useDraftPersistence } from '../../hooks/useDraftPersistence'
import { saveGame } from '../../utils/gameApi'
import { deleteDraft } from '../../utils/draftApi'
import { validateDraftForPublish } from '../../utils/draftValidation'
import { BackButton } from '../../components/BackButton'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import { BuilderForm } from '../../components/builder/BuilderForm'
import { ExitGuardDialog } from '../../components/builder/ExitGuardDialog'
import './BuilderPage.css'

export function BuilderPage() {
  const navigate = useNavigate()
  const { draftId } = useParams({ strict: false }) as { draftId?: string }

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
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [publishMessage, setPublishMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Loading state for draft resume
  const [isLoadingDraft, setIsLoadingDraft] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

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
      setSaveMessage({ type: 'success', text: 'Draft saved successfully.' })
    } else {
      const errorText = result.error ?? 'Save failed.'
      const isAuthError = errorText.toLowerCase().includes('auth') || errorText.toLowerCase().includes('not authenticated')
      setSaveMessage({
        type: 'error',
        text: isAuthError
          ? 'Session expired. Please log in again.'
          : errorText,
      })
    }
  }, [save])

  // ─── Auto-dismiss save messages ──────────────────────────────────────────
  useEffect(() => {
    if (!saveMessage) return
    if (saveMessage.type === 'success') {
      const timer = setTimeout(() => setSaveMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [saveMessage])

  // ─── Publish handler ─────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    // 1. Run form-level validation (sets inline errors on each invalid field)
    const formValid = validateForPublish()

    // 2. Also validate the draft object using draftValidation.ts
    const draft = toBuildDraft()
    const draftValidation = validateDraftForPublish(draft)

    if (!formValid || !draftValidation.valid) {
      setPublishMessage({ type: 'error', text: 'Please fix all errors before publishing.' })
      return
    }

    // 2. Start publishing
    setIsPublishing(true)
    setPublishMessage(null)

    try {
      // 3. Convert to normalized game
      const normalizedGame = toNormalizedGame()

      // 4. Save game
      const result = await saveGame(formState.gameName, normalizedGame)

      if ('success' in result && result.success) {
        // 5. Delete draft if one exists
        const activeDraftId = currentDraftId ?? draftId
        if (activeDraftId && userEmail) {
          await deleteDraft(activeDraftId, userEmail)
        }

        // 6. Show success and navigate
        setPublishMessage({ type: 'success', text: 'Game published successfully!' })
        resetDirty() // Clear dirty state so navigation isn't blocked
        setTimeout(() => {
          navigate({ to: '/home/library' })
        }, 2000)
      } else if ('alreadyExists' in result && result.alreadyExists) {
        setPublishMessage({ type: 'error', text: 'A game with this name already exists. Please choose a different name.' })
        // Focus the game name field
        const gameNameInput = document.getElementById('builder-game-name')
        gameNameInput?.focus()
      } else {
        const errorText = 'error' in result ? result.error : 'Publish failed.'
        setPublishMessage({ type: 'error', text: errorText })
      }
    } catch {
      setPublishMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setIsPublishing(false)
    }
  }, [validateForPublish, toBuildDraft, toNormalizedGame, formState.gameName, currentDraftId, draftId, userEmail, resetDirty, navigate])

  // ─── Auto-dismiss publish success message ────────────────────────────────
  useEffect(() => {
    if (!publishMessage) return
    if (publishMessage.type === 'success') {
      const timer = setTimeout(() => setPublishMessage(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [publishMessage])

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
      <BackgroundGradient containerClassName="max-w-4xl mx-auto" className="p-6 rounded-xl">
        <BackButton onClick={() => navigate({ to: '/home/create' })} label="Back to create" />

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
          saveMessage={saveMessage}
          publishMessage={publishMessage}
          onSetGameName={setGameName}
          onSetTotalRounds={setTotalRounds}
          onSetCategoriesPerRound={setCategoriesPerRound}
          onSetCategoryName={setCategoryName}
          onSetClueField={setClueField}
          onSetFinalField={setFinalField}
          onValidateField={validateField}
          onSave={handleSave}
          onPublish={handlePublish}
          onDismissSaveMessage={() => setSaveMessage(null)}
          onDismissPublishMessage={() => setPublishMessage(null)}
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
    </div>
  )
}
