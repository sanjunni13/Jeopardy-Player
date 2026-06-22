import { useState, useEffect, useRef, useCallback } from 'react'
import type { ClueFormState, MediaAttachment } from '../../utils/builderFormStructure'
import { validateYouTubeUrl } from '../../utils/builderValidation'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ClueEditorModalProps {
  clue: ClueFormState
  pointValue: number
  mediaAttachments: MediaAttachment[]
  onSave: (clue: ClueFormState, media: MediaAttachment[]) => void
  onCancel: () => void
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ACCEPTED_IMAGE_TYPES = '.jpg,.jpeg,.png,.gif,.webp'
const ACCEPTED_AUDIO_TYPES = '.mp3'
const DIALOG_TITLE_ID = 'clue-editor-modal-title'

// ─── Component ─────────────────────────────────────────────────────────────────

export function ClueEditorModal({
  clue,
  pointValue,
  mediaAttachments,
  onSave,
  onCancel,
}: ClueEditorModalProps) {
  // ─── Local form state (edits are local until Save) ───────────────────────
  const [clueText, setClueText] = useState(clue.clue)
  const [solutionText, setSolutionText] = useState(clue.solution)
  const [dailyDouble, setDailyDouble] = useState(clue.dailyDouble)
  const [media, setMedia] = useState<MediaAttachment[]>([...mediaAttachments])
  const [youtubeUrl, setYoutubeUrl] = useState(() => {
    const existing = mediaAttachments.find((m) => m.type === 'youtube')
    return existing?.url ?? ''
  })

  // ─── Validation errors ───────────────────────────────────────────────────
  const [youtubeError, setYoutubeError] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)

  // ─── Focus trap refs ─────────────────────────────────────────────────────
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  // Store the element that had focus before the dialog opened
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement
  }, [])

  // Focus first focusable element on mount
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'textarea, input, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    focusable[0]?.focus()
  }, [])

  // Focus trap: constrain Tab navigation within the dialog
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return

      if (e.key === 'Escape') {
        handleCancel()
        return
      }

      if (e.key === 'Tab') {
        const focusableElements = dialog.querySelectorAll<HTMLElement>(
          'textarea, input, button:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
        )
        if (focusableElements.length === 0) return

        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ─── Handlers ────────────────────────────────────────────────────────────

  function handleCancel() {
    // Restore focus to the triggering element
    triggerRef.current?.focus()
    onCancel()
  }

  function handleSave() {
    // Validate YouTube URL if provided
    if (youtubeUrl.trim() !== '') {
      if (!validateYouTubeUrl(youtubeUrl.trim())) {
        setYoutubeError('Please enter a valid YouTube URL (youtube.com/watch?v=ID, youtu.be/ID, or youtube.com/embed/ID)')
        return
      }
    }

    // Build updated media array
    const updatedMedia: MediaAttachment[] = media.filter((m) => m.type !== 'youtube')
    if (youtubeUrl.trim() !== '') {
      updatedMedia.push({ type: 'youtube', url: youtubeUrl.trim() })
    }

    // Build updated clue state
    const updatedClue: ClueFormState = {
      ...clue,
      clue: clueText,
      solution: solutionText,
      dailyDouble,
    }

    // Restore focus to the triggering element
    triggerRef.current?.focus()
    onSave(updatedClue, updatedMedia)
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setImageError(null)
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setImageError('Unsupported format. Please upload a JPEG, PNG, GIF, or WebP file.')
      e.target.value = ''
      return
    }

    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      setImageError('File exceeds the 5MB size limit.')
      e.target.value = ''
      return
    }

    // Add local media reference (actual upload handled by parent/hook integration)
    const attachment: MediaAttachment = {
      type: 'image',
      url: URL.createObjectURL(file),
      filename: file.name,
    }
    setMedia((prev) => [...prev.filter((m) => m.type !== 'image'), attachment])
  }

  function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setAudioError(null)
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'audio/mpeg') {
      setAudioError('Unsupported format. Please upload an MP3 file.')
      e.target.value = ''
      return
    }

    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      setAudioError('File exceeds the 10MB size limit.')
      e.target.value = ''
      return
    }

    const attachment: MediaAttachment = {
      type: 'audio',
      url: URL.createObjectURL(file),
      filename: file.name,
    }
    setMedia((prev) => [...prev.filter((m) => m.type !== 'audio'), attachment])
  }

  function handleYoutubeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setYoutubeUrl(value)

    // Clear error while typing
    if (youtubeError) {
      setYoutubeError(null)
    }

    // Inline validation on non-empty values
    if (value.trim() !== '' && !validateYouTubeUrl(value.trim())) {
      setYoutubeError('Please enter a valid YouTube URL (youtube.com/watch?v=ID, youtu.be/ID, or youtube.com/embed/ID)')
    }
  }

  // ─── Current media state for display ─────────────────────────────────────
  const currentImage = media.find((m) => m.type === 'image')
  const currentAudio = media.find((m) => m.type === 'audio')

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="logout-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={DIALOG_TITLE_ID}
      onClick={handleCancel}
    >
      <div
        ref={dialogRef}
        className="logout-panel"
        style={{ maxWidth: '540px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h2 id={DIALOG_TITLE_ID} className="logout-title">
          Edit Clue
        </h2>

        {/* Read-only point value */}
        <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
          Point Value: <strong>${pointValue}</strong>
        </p>

        {/* Clue text */}
        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="clue-editor-clue"
            style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
          >
            Clue
          </label>
          <textarea
            id="clue-editor-clue"
            value={clueText}
            onChange={(e) => setClueText(e.target.value)}
            rows={3}
            style={{ width: '100%', resize: 'vertical', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
          />
        </div>

        {/* Solution text */}
        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="clue-editor-solution"
            style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
          >
            Solution
          </label>
          <textarea
            id="clue-editor-solution"
            value={solutionText}
            onChange={(e) => setSolutionText(e.target.value)}
            rows={2}
            style={{ width: '100%', resize: 'vertical', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
          />
        </div>

        {/* Daily Double toggle */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            id="clue-editor-daily-double"
            type="checkbox"
            checked={dailyDouble}
            onChange={(e) => setDailyDouble(e.target.checked)}
            style={{ width: '18px', height: '18px' }}
          />
          <label htmlFor="clue-editor-daily-double" style={{ fontWeight: 500 }}>
            Daily Double
          </label>
        </div>

        {/* ─── Media Upload Section ──────────────────────────────────────── */}
        <fieldset style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '1rem', marginBottom: '1.5rem' }}>
          <legend style={{ fontWeight: 600, padding: '0 0.5rem' }}>Media Attachments</legend>

          {/* Image upload */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="clue-editor-image"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.875rem' }}
            >
              Image (JPEG, PNG, GIF, WebP — max 5MB)
            </label>
            <input
              id="clue-editor-image"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              onChange={handleImageUpload}
              style={{ fontSize: '0.875rem' }}
            />
            {currentImage && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#059669' }}>
                ✓ {currentImage.filename || 'Image attached'}
              </p>
            )}
            {imageError && (
              <p role="alert" style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#dc2626' }}>
                {imageError}
              </p>
            )}
          </div>

          {/* Audio upload */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="clue-editor-audio"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.875rem' }}
            >
              Audio (MP3 — max 10MB)
            </label>
            <input
              id="clue-editor-audio"
              type="file"
              accept={ACCEPTED_AUDIO_TYPES}
              onChange={handleAudioUpload}
              style={{ fontSize: '0.875rem' }}
            />
            {currentAudio && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#059669' }}>
                ✓ {currentAudio.filename || 'Audio attached'}
              </p>
            )}
            {audioError && (
              <p role="alert" style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#dc2626' }}>
                {audioError}
              </p>
            )}
          </div>

          {/* YouTube URL input */}
          <div>
            <label
              htmlFor="clue-editor-youtube"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500, fontSize: '0.875rem' }}
            >
              YouTube URL
            </label>
            <input
              id="clue-editor-youtube"
              type="url"
              value={youtubeUrl}
              onChange={handleYoutubeChange}
              placeholder="https://youtube.com/watch?v=..."
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: `1px solid ${youtubeError ? '#dc2626' : '#d1d5db'}`,
                fontSize: '0.875rem',
              }}
              aria-invalid={!!youtubeError}
              aria-describedby={youtubeError ? 'clue-editor-youtube-error' : undefined}
            />
            {youtubeError && (
              <p
                id="clue-editor-youtube-error"
                role="alert"
                style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#dc2626' }}
              >
                {youtubeError}
              </p>
            )}
          </div>
        </fieldset>

        {/* ─── Actions ───────────────────────────────────────────────────── */}
        <div className="logout-actions">
          <button
            type="button"
            onClick={handleCancel}
            className="logout-btn-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="logout-btn-confirm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
