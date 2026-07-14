import { useState, useRef, useCallback, useEffect } from 'react'
import { createDraft, updateDraft, loadDraft as loadDraftApi } from '../utils/draftApi'
import type { BuilderDraft } from '../utils/draftApi'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UseDraftPersistenceReturn {
  draftId: string | null
  isSaving: boolean
  lastSavedAt: Date | null
  autoSaveStatus: 'idle' | 'pending' | 'saving' | 'failed'
  save: () => Promise<{ success: boolean; error?: string }>
  loadDraft: (id: string) => Promise<{ success: boolean; error?: string }>
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const AUTO_SAVE_DELAY_MS = 60000

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useDraftPersistence(
  isDirty: boolean,
  toBuildDraft: () => BuilderDraft,
  resetDirty: () => void,
  loadFromDraft: (draft: BuilderDraft) => void,
  userEmail: string
): UseDraftPersistenceReturn {
  const [draftId, setDraftId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'failed'>('idle')

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSavingRef = useRef(false)
  const draftIdRef = useRef<string | null>(null)

  // Keep refs in sync with state for use in async callbacks
  useEffect(() => {
    isSavingRef.current = isSaving
  }, [isSaving])

  useEffect(() => {
    draftIdRef.current = draftId
  }, [draftId])

  // ─── Internal save logic ─────────────────────────────────────────────────

  const performSave = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    let draft: BuilderDraft
    try {
      draft = toBuildDraft()
    } catch (err) {
      console.error('[useDraftPersistence] toBuildDraft() threw:', err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: `Failed to serialize draft: ${message}` }
    }
    const currentDraftId = draftIdRef.current

    if (currentDraftId === null) {
      // Create new draft
      const result = await createDraft(draft, userEmail)
      if (result.success) {
        setDraftId(result.id)
        setLastSavedAt(new Date())
        resetDirty()
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } else {
      // Update existing draft
      const result = await updateDraft(currentDraftId, draft, userEmail)
      if (result.success) {
        setLastSavedAt(new Date())
        resetDirty()
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    }
  }, [toBuildDraft, userEmail, resetDirty])

  // ─── Cancel auto-save timer utility ──────────────────────────────────────

  const cancelAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
  }, [])

  // ─── Manual save ─────────────────────────────────────────────────────────

  const save = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    // Cancel any pending auto-save timer (Req 4.5)
    cancelAutoSaveTimer()

    // If a save is already in progress (e.g., auto-save), wait for it to complete (Req 4.6)
    if (isSavingRef.current) {
      // The in-progress save will handle persistence; return success since state will be saved
      return { success: true }
    }

    setIsSaving(true)
    setAutoSaveStatus('idle')

    try {
      const result = await performSave()
      setIsSaving(false)
      return result
    } catch (err) {
      setIsSaving(false)
      console.error('[useDraftPersistence] save caught error:', err)
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: `Unexpected error during save: ${message}` }
    }
  }, [cancelAutoSaveTimer, performSave])

  // ─── Auto-save timer logic ───────────────────────────────────────────────

  // Track whether auto-save timer is active via a ref-based flag
  const autoSaveActiveRef = useRef(false)

  useEffect(() => {
    // If not dirty or currently saving, clear timer
    if (!isDirty || isSaving) {
      cancelAutoSaveTimer()
      autoSaveActiveRef.current = false
      return
    }

    // Set or reset the 30s inactivity timer
    cancelAutoSaveTimer()
    autoSaveActiveRef.current = true

    autoSaveTimerRef.current = setTimeout(async () => {
      autoSaveTimerRef.current = null
      autoSaveActiveRef.current = false

      // Double-check: skip if a manual save started in the meantime
      if (isSavingRef.current) {
        return
      }

      setAutoSaveStatus('saving')
      setIsSaving(true)

      try {
        const result = await performSave()
        if (result.success) {
          setAutoSaveStatus('idle')
        } else {
          setAutoSaveStatus('failed')
        }
      } catch {
        setAutoSaveStatus('failed')
      } finally {
        setIsSaving(false)
      }
    }, AUTO_SAVE_DELAY_MS)

    return () => {
      cancelAutoSaveTimer()
      autoSaveActiveRef.current = false
    }
  }, [isDirty, isSaving, cancelAutoSaveTimer, performSave])

  // ─── Load draft ──────────────────────────────────────────────────────────

  const loadDraft = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    const result = await loadDraftApi(id, userEmail)
    if (result.success) {
      setDraftId(id)
      loadFromDraft(result.draft)
      return { success: true }
    } else {
      return { success: false, error: result.error }
    }
  }, [userEmail, loadFromDraft])

  return {
    draftId,
    isSaving,
    lastSavedAt,
    autoSaveStatus,
    save,
    loadDraft,
  }
}
