import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { validateGameFile } from '../../utils/gameValidator'
import { normalizeGame } from '../../utils/gameNormalizer'
import { saveGame } from '../../utils/gameApi'
import { BackButton } from '../../components/BackButton'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import { FAQCard } from '../../components/ui/FAQCard'
import { uploadGameFAQ } from '../../data/faqData'
import './UploadPage.css'

type Status = 'idle' | 'validating' | 'uploading' | 'error'

export function UploadPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('validating')
    setErrorMessage(null)

    const validationResult = await validateGameFile(file)
    if (!validationResult.valid) {
      setStatus('error')
      setErrorMessage(validationResult.error)
      resetFileInput()
      return
    }

    const normalizeResult = normalizeGame(validationResult.raw)
    if (!normalizeResult.ok) {
      setStatus('error')
      setErrorMessage(normalizeResult.error)
      resetFileInput()
      return
    }

    setStatus('uploading')
    const gameName = file.name.replace(/\.json$/i, '')
    const response = await saveGame(gameName, normalizeResult.game)

    if ('error' in response) {
      if ('alreadyExists' in response) {
        setStatus('error')
        setErrorMessage('A game with this name already exists in the library. Please check there if you would like to play it.')
        resetFileInput()
        return
      }
      setStatus('error')
      setErrorMessage(response.error)
      resetFileInput()
      return
    }

    navigate({ to: '/home/game/$gameId', params: { gameId: response.id } })
  }

  function resetFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  const isLoading = status === 'validating' || status === 'uploading'

  return (
    <div className="upload-page">
      <BackgroundGradient containerClassName="upload-gradient-container" className="upload-card">
        <BackButton onClick={() => window.history.back()} label="Go back" />

        <h1 className="upload-title">Upload a Game</h1>
        <p className="upload-description">
        Please provide a .json file. The file will be validated and saved to the game library upon upload.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="upload-file-input"
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={handleUploadClick}
          disabled={isLoading}
          className="upload-action-btn"
        >
          {status === 'validating' && (
            <span className="upload-btn-content">
              <Spinner /> Validating…
            </span>
          )}
          {status === 'uploading' && (
            <span className="upload-btn-content">
              <Spinner /> Uploading…
            </span>
          )}
          {(status === 'idle' || status === 'error') && 'Choose .json File'}
        </button>

        {errorMessage && (
          <p className="upload-error">{errorMessage}</p>
        )}
      </BackgroundGradient>

      <FAQCard items={uploadGameFAQ} />
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="upload-spinner"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
