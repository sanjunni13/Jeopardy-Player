import { useState, useRef, useEffect, useCallback } from 'react'
import type { MediaData } from '../../utils/builderFormStructure'
import { validateMediaFile, validateYouTubeUrl } from '../../utils/mediaApi'

interface MediaAttachmentProps {
  media: MediaData | null
  onAttach: (file: File | string) => void
  onRemove: () => void
  isUploading: boolean
  error: string | null
}

const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.gif,.webp'
const AUDIO_ACCEPT = '.mp3'

export function MediaAttachment({
  media,
  onAttach,
  onRemove,
  isUploading,
  error,
}: MediaAttachmentProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [youtubeInput, setYoutubeInput] = useState('')
  const [showYoutubeInput, setShowYoutubeInput] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const imageInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Display whichever error is active: parent-provided or local validation
  const displayError = error || localError

  // Auto-dismiss error after 8 seconds
  useEffect(() => {
    if (displayError) {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      errorTimerRef.current = setTimeout(() => {
        setLocalError(null)
      }, 8000)
    }
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    }
  }, [displayError])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isDropdownOpen])

  const clearError = useCallback(() => {
    setLocalError(null)
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
  }, [])

  const handleImageSelect = () => {
    clearError()
    setIsDropdownOpen(false)
    imageInputRef.current?.click()
  }

  const handleAudioSelect = () => {
    clearError()
    setIsDropdownOpen(false)
    audioInputRef.current?.click()
  }

  const handleYoutubeSelect = () => {
    clearError()
    setIsDropdownOpen(false)
    setShowYoutubeInput(true)
    setYoutubeInput('')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateMediaFile(file)
    if (!validation.valid) {
      setLocalError(validation.error)
      // Reset file input
      e.target.value = ''
      return
    }

    clearError()
    onAttach(file)
    // Reset file input so the same file can be re-selected
    e.target.value = ''
  }

  const handleYoutubeBlur = () => {
    if (!youtubeInput.trim()) {
      setShowYoutubeInput(false)
      return
    }

    if (!validateYouTubeUrl(youtubeInput.trim())) {
      setLocalError('Please enter a valid YouTube URL')
      return
    }

    clearError()
    onAttach(youtubeInput.trim())
    setShowYoutubeInput(false)
    setYoutubeInput('')
  }

  const handleYoutubeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleYoutubeBlur()
    }
    if (e.key === 'Escape') {
      setShowYoutubeInput(false)
      setYoutubeInput('')
    }
  }

  const handleRemove = () => {
    clearError()
    setShowYoutubeInput(false)
    onRemove()
  }

  // ─── Render: Media Preview ────────────────────────────────────────────────────

  if (media) {
    return (
      <div className="flex items-center gap-2 mt-1">
        {media.type === 'image' && (
          <img
            src={media.url}
            alt="Clue media"
            className="max-w-[150px] max-h-[150px] object-contain rounded border border-border"
          />
        )}

        {media.type === 'audio' && (
          <audio controls className="h-8 max-w-[200px]">
            <source src={media.url} />
          </audio>
        )}

        {media.type === 'youtube' && (
          <a
            href={media.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-primary/80 underline truncate max-w-[200px]"
          >
            {media.url}
          </a>
        )}

        <button
          type="button"
          onClick={handleRemove}
          className="ml-1 p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-destructive/10 transition-colors"
          aria-label="Remove media attachment"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {displayError && (
          <p className="text-xs text-red-500 ml-2">{displayError}</p>
        )}
      </div>
    )
  }

  // ─── Render: Attach Controls ──────────────────────────────────────────────────

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {/* YouTube URL input mode */}
        {showYoutubeInput ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="https://youtube.com/watch?v=..."
              value={youtubeInput}
              onChange={(e) => setYoutubeInput(e.target.value)}
              onBlur={handleYoutubeBlur}
              onKeyDown={handleYoutubeKeyDown}
              autoFocus
              className="w-56 px-2 py-1 text-xs rounded border border-border bg-input/30 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => {
                setShowYoutubeInput(false)
                setYoutubeInput('')
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div ref={dropdownRef} className="relative">
            {/* Attach button - compact icon for inside input */}
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              disabled={isUploading}
              className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Attach media"
            >
              {isUploading ? (
                <svg
                  className="animate-spin h-3.5 w-3.5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
              )}
            </button>

            {/* Dropdown menu */}
            {isDropdownOpen && (
              <div className="absolute z-10 right-0 top-full mt-1 w-32 rounded-md border border-border bg-slate-800 shadow-lg py-1">
                <button
                  type="button"
                  onClick={handleImageSelect}
                  className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-slate-700 transition-colors"
                >
                  Image
                </button>
                <button
                  type="button"
                  onClick={handleAudioSelect}
                  className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-slate-700 transition-colors"
                >
                  Audio
                </button>
                <button
                  type="button"
                  onClick={handleYoutubeSelect}
                  className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-slate-700 transition-colors"
                >
                  YouTube
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Error message */}
      {displayError && (
        <p className="text-xs text-red-500 mt-1">{displayError}</p>
      )}
    </div>
  )
}
