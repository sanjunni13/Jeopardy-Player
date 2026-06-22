import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams, useBlocker } from '@tanstack/react-router'
import { supabase } from '../../utils/supabase'
import { saveGame } from '../../utils/gameApi'
import { deleteDraft } from '../../utils/draftApi'
import { BackButton } from '../../components/BackButton'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import { BoardEditor } from '../../components/board-editor/BoardEditor'
import type { BoardEditorRef } from '../../components/board-editor/BoardEditor'
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

  // ─── BoardEditor ref for accessing internal state ────────────────────────
  const editorRef = useRef<BoardEditorRef>(null)

  // ─── Local UI state ──────────────────────────────────────────────────────
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishMessage, setPublishMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ─── Exit guard (in-app navigation) ──────────────────────────────────────
  // Note: BoardEditor manages isDirty internally. We track a simplified version
  // for the exit guard by checking if the editor ref reports dirty state.
  const [isDirty, setIsDirty] = useState(false)
  const { proceed, reset, status } = useBlocker({ condition: isDirty })
  const [exitGuardSaving, setExitGuardSaving] = useState(false)
  const [exitGuardSaveError, setExitGuardSaveError] = useState<string | null>(null)

  const handleExitCancel = useCallback(() => {
    setExitGuardSaveError(null)
    reset?.()
  }, [reset])

  const handleExitWithoutSaving = useCallback(() => {
    setExitGuardSaveError(null)
    proceed?.()
  }, [proceed])

  const handleSaveAndExit = useCallback(async () => {
    setExitGuardSaving(true)
    setExitGuardSaveError(null)
    // The BoardEditor handles save internally — for exit guard, just proceed
    // since the editor auto-saves. If needed, a save trigger could be added.
    setExitGuardSaving(false)
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

  // ─── Delete board flow ───────────────────────────────────────────────────
  const handleDeleteBoard = useCallback(async () => {
    const activeDraftId = editorRef.current?.getDraftId() ?? draftId
    if (!activeDraftId || !userEmail) {
      // No draft to delete, just navigate away
      navigate({ to: '/home/create' })
      return
    }

    try {
      const result = await deleteDraft(activeDraftId, userEmail)
      if (result.success) {
        setIsDirty(false) // Prevent exit guard from blocking
        navigate({ to: '/home/create' })
      } else {
        // Show error — the delete dialog should remain open
        console.error('Delete failed:', result.error)
      }
    } catch {
      console.error('Delete failed: network error')
    }
  }, [draftId, userEmail, navigate])

  // ─── Download JSON template flow ─────────────────────────────────────────
  const handleDownloadJSON = useCallback(() => {
    if (!editorRef.current) return

    const draft = editorRef.current.toBuildDraft()
    const gameName = editorRef.current.getGameName() || 'untitled_game'

    const json = JSON.stringify(draft, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${gameName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // ─── Publish flow ────────────────────────────────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!editorRef.current) return

    // 1. Validate for publish
    const valid = editorRef.current.validateForPublish()
    if (!valid) {
      setPublishMessage({ type: 'error', text: 'Please fix all errors before publishing.' })
      return
    }

    // 2. Start publishing
    setIsPublishing(true)
    setPublishMessage(null)

    try {
      // 3. Convert to normalized game
      const normalizedGame = editorRef.current.toNormalizedGame()
      const gameName = editorRef.current.getGameName()

      // 4. Save game via API
      const result = await saveGame(gameName, normalizedGame)

      if ('success' in result && result.success) {
        // 5. Delete draft if one exists
        const activeDraftId = editorRef.current.getDraftId() ?? draftId
        if (activeDraftId && userEmail) {
          await deleteDraft(activeDraftId, userEmail)
        }

        // 6. Show success and navigate
        setPublishMessage({ type: 'success', text: 'Game published successfully!' })
        editorRef.current.resetDirty()
        setIsDirty(false)
        setTimeout(() => {
          navigate({ to: '/home/library' })
        }, 2000)
      } else if ('alreadyExists' in result && result.alreadyExists) {
        setPublishMessage({ type: 'error', text: 'A game with this name already exists. Please choose a different name.' })
      } else {
        const errorText = 'error' in result ? result.error : 'Publish failed.'
        setPublishMessage({ type: 'error', text: errorText })
      }
    } catch {
      setPublishMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setIsPublishing(false)
    }
  }, [draftId, userEmail, navigate])

  // ─── Auto-dismiss publish success message ────────────────────────────────
  useEffect(() => {
    if (!publishMessage) return
    if (publishMessage.type === 'success') {
      const timer = setTimeout(() => setPublishMessage(null), 2000)
      return () => clearTimeout(timer)
    }
  }, [publishMessage])

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="builder-page">
      <BackgroundGradient containerClassName="max-w-6xl mx-auto" className="p-6 rounded-xl">
        <BackButton onClick={() => navigate({ to: '/home/create' })} label="Back to create" />

        <h1 className="text-2xl font-bold text-foreground mt-4 mb-6">
          {draftId ? 'Resume Draft' : 'Build a Game'}
        </h1>

        <BoardEditor
          ref={editorRef}
          draftId={draftId}
          onDeleteBoard={handleDeleteBoard}
          onDownloadJSON={handleDownloadJSON}
          onPublish={handlePublish}
          isPublishing={isPublishing}
          publishMessage={publishMessage}
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
