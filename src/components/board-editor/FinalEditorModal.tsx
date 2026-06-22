import { useState, useRef, useEffect, useCallback } from 'react'
import type { FinalRoundFormState, MediaAttachment } from '../../utils/builderFormStructure'
import { validateYouTubeUrl } from '../../utils/builderValidation'
import '../LogoutDialog.css'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FinalEditorModalProps {
  finalRound: FinalRoundFormState
  mediaAttachments: MediaAttachment[]
  onSave: (finalRound: FinalRoundFormState, media: MediaAttachment[]) => void
  onCancel: () => void
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DIALOG_TITLE_ID = 'final-editor-title'
const ACCEPTED_IMAGE_TYPES = '.jpg,.jpeg,.png,.gif,.webp'
const ACCEPTED_AUDIO_TYPES = '.mp3'

// ─── Component ─────────────────────────────────────────────────────────────────

export function FinalEditorModal({
  finalRound,
  mediaAttachments,
  onSave,
  onCancel,
}: FinalEditorModalProps) {
  // ─── Local form state ────────────────────────────────────────────────────
  const [category, setCategory] = useState(finalRound.category)
  const [clue, setClue] = useState(finalRound.clue)
  const [solution, setSolution] = useState(finalRound.solution)
  const [media, setMedia] = useState<MediaAttachment[]>([...mediaAttachments])

  // ─── YouTube URL state ───────────────────────────────────────────────────
  const [youtubeUrl, setYoutubeUrl] = useState(
    mediaAttachments.find((m) => m.type === 'youtube')?.url ?? ''
  )
  const [youtubeError, setYoutubeError] = useState<string | null>(null)

  // ─── Upload state ────────────────────────────────────────────────────────
  const [uploadError, setUploadError] = useState<string | null>(null)

  // ─── Refs ────────────────────────────────────────────────────────────────
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)

  // ─── Focus management: capture the triggering element and restore on close ─
  useEffect(() => {
    triggerRef.current = document.activeElement
    return () => {
      // Restore focus on unmount
      if (triggerRef.current && triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus()
      }
    }
  }, [])

  // ─── Focus trap + initial focus ──────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const dialog = dialogRef.current
      if (!dialog) return

      if (e.key === 'Escape') {
        onCancel()
        return
      }

      if (e.key === 'Tab') {
        const focusableElements = dialog.querySelectorAll<HTMLElement>(
          'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
    [onCancel]
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    // Focus first focusable element
    const focusableElements = dialog.querySelectorAll<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    focusableElements[0]?.focus()

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleSave = () => {
    const updatedFinalRound: FinalRoundFormState = {
      category,
      clue,
      solution,
      media: media.length > 0 ? media : undefined,
    }
    onSave(updatedFinalRound, media)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Unsupported format. Please upload a JPEG, PNG, GIF, or WebP file.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File exceeds the 5MB size limit.')
      return
    }

    // Remove existing image attachment and add new one
    const withoutImage = media.filter((m) => m.type !== 'image')
    const newAttachment: MediaAttachment = {
      type: 'image',
      url: URL.createObjectURL(file),
      filename: file.name,
    }
    setMedia([...withoutImage, newAttachment])
  }

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'audio/mpeg') {
      setUploadError('Unsupported format. Please upload an MP3 file.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File exceeds the 10MB size limit.')
      return
    }

    // Remove existing audio attachment and add new one
    const withoutAudio = media.filter((m) => m.type !== 'audio')
    const newAttachment: MediaAttachment = {
      type: 'audio',
      url: URL.createObjectURL(file),
      filename: file.name,
    }
    setMedia([...withoutAudio, newAttachment])
  }

  const handleYouTubeUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value
    setYoutubeUrl(url)
    setYoutubeError(null)

    if (url.trim() === '') {
      // Remove YouTube attachment if URL is cleared
      setMedia(media.filter((m) => m.type !== 'youtube'))
      return
    }

    if (!validateYouTubeUrl(url)) {
      setYoutubeError('Please enter a valid YouTube URL (e.g., youtube.com/watch?v=... or youtu.be/...)')
      return
    }

    // Remove existing YouTube attachment and add new one
    const withoutYoutube = media.filter((m) => m.type !== 'youtube')
    const newAttachment: MediaAttachment = {
      type: 'youtube',
      url,
    }
    setMedia([...withoutYoutube, newAttachment])
  }

  const handleRemoveMedia = (type: 'image' | 'audio' | 'youtube') => {
    setMedia(media.filter((m) => m.type !== type))
    if (type === 'youtube') {
      setYoutubeUrl('')
      setYoutubeError(null)
    }
  }

  // ─── Derived state ──────────────────────────────────────────────────────
  const imageAttachment = media.find((m) => m.type === 'image')
  const audioAttachment = media.find((m) => m.type === 'audio')

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="logout-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={DIALOG_TITLE_ID}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="logout-panel"
        style={{ maxWidth: '36rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={DIALOG_TITLE_ID} className="logout-title">
          Edit Final Jeopardy
        </h2>

        {/* Category Name */}
        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="final-category"
            style={{ display: 'block', color: 'rgb(203 213 225)', fontSize: '0.875rem', marginBottom: '0.375rem', fontWeight: 500 }}
          >
            Category
          </label>
          <input
            id="final-category"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Enter category name"
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid rgb(51 65 85)',
              background: 'rgb(30 41 59)',
              color: 'rgb(241 245 249)',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Clue Text */}
        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="final-clue"
            style={{ display: 'block', color: 'rgb(203 213 225)', fontSize: '0.875rem', marginBottom: '0.375rem', fontWeight: 500 }}
          >
            Clue
          </label>
          <textarea
            id="final-clue"
            value={clue}
            onChange={(e) => setClue(e.target.value)}
            placeholder="Enter the clue (question)"
            rows={3}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid rgb(51 65 85)',
              background: 'rgb(30 41 59)',
              color: 'rgb(241 245 249)',
              fontSize: '0.875rem',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Solution Text */}
        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="final-solution"
            style={{ display: 'block', color: 'rgb(203 213 225)', fontSize: '0.875rem', marginBottom: '0.375rem', fontWeight: 500 }}
          >
            Solution
          </label>
          <textarea
            id="final-solution"
            value={solution}
            onChange={(e) => setSolution(e.target.value)}
            placeholder="Enter the solution (answer)"
            rows={2}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid rgb(51 65 85)',
              background: 'rgb(30 41 59)',
              color: 'rgb(241 245 249)',
              fontSize: '0.875rem',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* ─── Media Section ─────────────────────────────────────────────── */}
        <div style={{ marginBottom: '1rem', borderTop: '1px solid rgb(51 65 85)', paddingTop: '1rem' }}>
          <p style={{ color: 'rgb(203 213 225)', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.75rem' }}>
            Media Attachments
          </p>

          {/* Image Upload */}
          <div style={{ marginBottom: '0.75rem' }}>
            <label
              htmlFor="final-image-upload"
              style={{ display: 'block', color: 'rgb(148 163 184)', fontSize: '0.8125rem', marginBottom: '0.25rem' }}
            >
              Image (JPEG, PNG, GIF, WebP — max 5MB)
            </label>
            {imageAttachment ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'rgb(203 213 225)', fontSize: '0.8125rem' }}>
                  {imageAttachment.filename ?? 'Image attached'}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveMedia('image')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgb(244 63 94)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    padding: '0.25rem 0.5rem',
                  }}
                  aria-label="Remove image"
                >
                  Remove
                </button>
              </div>
            ) : (
              <input
                id="final-image-upload"
                type="file"
                accept={ACCEPTED_IMAGE_TYPES}
                onChange={handleImageUpload}
                style={{ color: 'rgb(148 163 184)', fontSize: '0.8125rem' }}
              />
            )}
          </div>

          {/* Audio Upload */}
          <div style={{ marginBottom: '0.75rem' }}>
            <label
              htmlFor="final-audio-upload"
              style={{ display: 'block', color: 'rgb(148 163 184)', fontSize: '0.8125rem', marginBottom: '0.25rem' }}
            >
              Audio (MP3 — max 10MB)
            </label>
            {audioAttachment ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'rgb(203 213 225)', fontSize: '0.8125rem' }}>
                  {audioAttachment.filename ?? 'Audio attached'}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveMedia('audio')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgb(244 63 94)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    padding: '0.25rem 0.5rem',
                  }}
                  aria-label="Remove audio"
                >
                  Remove
                </button>
              </div>
            ) : (
              <input
                id="final-audio-upload"
                type="file"
                accept={ACCEPTED_AUDIO_TYPES}
                onChange={handleAudioUpload}
                style={{ color: 'rgb(148 163 184)', fontSize: '0.8125rem' }}
              />
            )}
          </div>

          {/* YouTube URL */}
          <div style={{ marginBottom: '0.5rem' }}>
            <label
              htmlFor="final-youtube-url"
              style={{ display: 'block', color: 'rgb(148 163 184)', fontSize: '0.8125rem', marginBottom: '0.25rem' }}
            >
              YouTube Video URL
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                id="final-youtube-url"
                type="url"
                value={youtubeUrl}
                onChange={handleYouTubeUrlChange}
                placeholder="https://youtube.com/watch?v=..."
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: `1px solid ${youtubeError ? 'rgb(244 63 94)' : 'rgb(51 65 85)'}`,
                  background: 'rgb(30 41 59)',
                  color: 'rgb(241 245 249)',
                  fontSize: '0.8125rem',
                  outline: 'none',
                }}
              />
              {youtubeUrl && (
                <button
                  type="button"
                  onClick={() => handleRemoveMedia('youtube')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgb(244 63 94)',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    padding: '0.25rem 0.5rem',
                  }}
                  aria-label="Remove YouTube link"
                >
                  Remove
                </button>
              )}
            </div>
            {youtubeError && (
              <p
                role="alert"
                style={{ color: 'rgb(244 63 94)', fontSize: '0.75rem', marginTop: '0.25rem' }}
              >
                {youtubeError}
              </p>
            )}
          </div>

          {/* Upload error */}
          {uploadError && (
            <p
              role="alert"
              style={{ color: 'rgb(244 63 94)', fontSize: '0.75rem', marginTop: '0.5rem' }}
            >
              {uploadError}
            </p>
          )}
        </div>

        {/* ─── Actions ───────────────────────────────────────────────────── */}
        <div className="logout-actions">
          <button
            type="button"
            onClick={onCancel}
            className="logout-btn-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="logout-btn-confirm"
            style={{ backgroundColor: 'rgb(99 102 241)' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default FinalEditorModal
