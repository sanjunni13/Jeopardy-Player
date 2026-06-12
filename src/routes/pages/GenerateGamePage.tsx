import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useBlocker } from '@tanstack/react-router'
import {
  generateArchiveGame,
  updateArchiveData,
  generateLabsGame,
  getArchiveLastUpdated,
  generateAiGame,
} from '../../utils/generateApi'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import './GenerateGamePage.css'

type ActiveTab = 'archive' | 'labs' | 'ai'

interface ArchiveState {
  rounds: number
  categoriesPerRound: number
  loading: boolean
  error: string | null
  updateLoading: boolean
  updateMessage: string | null
  lastUpdated: string | null
}

interface LabsState {
  keywords: string
  loading: boolean
  error: string | null
}

interface AiState {
  rounds: string
  categoriesPerRound: string
  difficulty: string
  dailyDoublesPerRound: number
  specialRequests: string
  loading: boolean
  error: string | null
}

export function GenerateGamePage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ActiveTab>('archive')
  const [archiveState, setArchiveState] = useState<ArchiveState>({
    rounds: 2,
    categoriesPerRound: 6,
    loading: false,
    error: null,
    updateLoading: false,
    updateMessage: null,
    lastUpdated: null,
  })
  const [labsState, setLabsState] = useState<LabsState>({
    keywords: '',
    loading: false,
    error: null,
  })
  const [aiState, setAiState] = useState<AiState>({
    rounds: '',
    categoriesPerRound: '',
    difficulty: '',
    dailyDoublesPerRound: 0,
    specialRequests: '',
    loading: false,
    error: null,
  })

  const [mountTime] = useState(() => Date.now())
  const [toast, setToast] = useState<string | null>(null)

  useBlocker({
    shouldBlockFn: () => !window.confirm('Game generation is in progress. Are you sure you want to leave?'),
    enableBeforeUnload: () => aiState.loading,
    disabled: !aiState.loading,
  })

  useEffect(() => {
    let cancelled = false
    getArchiveLastUpdated().then((result) => {
      if (!cancelled) {
        setArchiveState((prev) => ({ ...prev, lastUpdated: result.lastUpdated }))
      }
    })
    return () => { cancelled = true }
  }, [])

  const isRecentlyUpdated = useMemo(() => {
    if (!archiveState.lastUpdated) return false
    const lastDate = new Date(archiveState.lastUpdated)
    const fourteenDaysAgo = new Date(mountTime - 14 * 24 * 60 * 60 * 1000)
    return lastDate > fourteenDaysAgo
  }, [archiveState.lastUpdated, mountTime])

  const isAiGenerateDisabled = aiState.rounds === '' || aiState.categoriesPerRound === '' || aiState.difficulty === '' || aiState.loading

  async function handleGenerateArchive() {
    setArchiveState((prev) => ({ ...prev, loading: true, error: null }))
    const response = await generateArchiveGame(archiveState.rounds, archiveState.categoriesPerRound)
    if ('success' in response) {
      navigate({ to: '/home/game/$gameId', params: { gameId: response.id } })
    } else {
      setArchiveState((prev) => ({ ...prev, error: response.error, loading: false }))
    }
  }

  async function handleUpdateArchive() {
    setArchiveState((prev) => ({ ...prev, updateLoading: true, updateMessage: null }))
    const response = await updateArchiveData()
    if ('success' in response) {
      setArchiveState((prev) => ({
        ...prev,
        updateLoading: false,
        updateMessage: response.message,
        lastUpdated: response.lastUpdated,
      }))
    } else {
      setArchiveState((prev) => ({
        ...prev,
        updateLoading: false,
        updateMessage: response.error,
      }))
    }
  }

  async function handleGenerateLabs() {
    const parsedKeywords = labsState.keywords
      .split(/[,\s\n]+/)
      .map((k) => k.trim())
      .filter(Boolean)

    if (parsedKeywords.length > 10) {
      setLabsState((prev) => ({ ...prev, error: 'Maximum of 10 keywords allowed.' }))
      return
    }

    setLabsState((prev) => ({ ...prev, loading: true, error: null }))
    const response = await generateLabsGame(parsedKeywords)
    if ('success' in response) {
      navigate({ to: '/home/game/$gameId', params: { gameId: response.id } })
    } else {
      setLabsState((prev) => ({ ...prev, error: response.error, loading: false }))
    }
  }

  async function handleGenerateAi() {
    setAiState((prev) => ({ ...prev, loading: true, error: null }))

    const params = {
      rounds: Number(aiState.rounds),
      categoriesPerRound: Number(aiState.categoriesPerRound),
      difficulty: aiState.difficulty as 'easy' | 'medium' | 'hard',
      dailyDoublesPerRound: aiState.dailyDoublesPerRound,
      specialRequests: aiState.specialRequests,
    }

    // First attempt
    const response = await generateAiGame(params)

    if ('success' in response) {
      setAiState((prev) => ({ ...prev, loading: false }))
      navigate({ to: '/home/game/$gameId', params: { gameId: response.id } })
      return
    }

    // Handle 429 rate limit
    if ('retryAfterSeconds' in response) {
      const minutes = Math.ceil(response.retryAfterSeconds / 60)
      setAiState((prev) => ({
        ...prev,
        loading: false,
        error: `Rate limit exceeded. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
      }))
      return
    }

    // First failure - show toast and retry
    setToast('An error occurred, retrying...')
    setTimeout(() => setToast(null), 3000)

    // Retry with same params
    const retryResponse = await generateAiGame(params)

    if ('success' in retryResponse) {
      setAiState((prev) => ({ ...prev, loading: false }))
      navigate({ to: '/home/game/$gameId', params: { gameId: retryResponse.id } })
      return
    }

    // Handle 429 on retry
    if ('retryAfterSeconds' in retryResponse) {
      const minutes = Math.ceil(retryResponse.retryAfterSeconds / 60)
      setAiState((prev) => ({
        ...prev,
        loading: false,
        error: `Rate limit exceeded. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
      }))
      return
    }

    // Retry also failed
    setAiState((prev) => ({
      ...prev,
      loading: false,
      error: retryResponse.error || 'An unexpected error occurred.',
    }))
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getUpdateMessageClass(): string {
    if (!archiveState.updateMessage) return ''
    const msg = archiveState.updateMessage.toLowerCase()
    if (msg.includes('error') || msg.includes('fail')) {
      return 'generate-error-message'
    }
    return 'generate-success-message'
  }

  return (
    <div className="generate-page">
      {/* Toast notification */}
      {toast && (
        <div className="generate-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
      <BackgroundGradient containerClassName="generate-gradient-container" className="generate-card">
        {/* Back button */}
        <button
          type="button"
          onClick={() => navigate({ to: '/home' })}
          className="generate-back-btn"
        >
          ← Back
        </button>

        {/* Title */}
        <h1 className="generate-title">Generate a Game</h1>

        {/* Tab bar */}
        <div className="generate-tab-bar">
          <button
            type="button"
            onClick={() => setActiveTab('archive')}
            className={`generate-tab ${activeTab === 'archive' ? 'active' : ''}`}
          >
            J! Archive
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('labs')}
            className={`generate-tab ${activeTab === 'labs' ? 'active' : ''}`}
          >
            JeopardyLabs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`generate-tab ${activeTab === 'ai' ? 'active' : ''}`}
          >
            AI Generation
          </button>
        </div>

        {/* Archive Tab */}
        {activeTab === 'archive' && (
          <div className="generate-tab-content">
            {/* Number of Rounds */}
            <div>
              <label className="generate-field-label">Number of Rounds</label>
              <select
                value={archiveState.rounds}
                onChange={(e) =>
                  setArchiveState((prev) => ({ ...prev, rounds: Number(e.target.value) }))
                }
                className="generate-select"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Categories per Round */}
            <div>
              <label className="generate-field-label">Categories per Round</label>
              <select
                value={archiveState.categoriesPerRound}
                onChange={(e) =>
                  setArchiveState((prev) => ({ ...prev, categoriesPerRound: Number(e.target.value) }))
                }
                className="generate-select"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Generate Game button */}
            <button
              type="button"
              onClick={handleGenerateArchive}
              disabled={archiveState.loading}
              className="generate-primary-btn"
            >
              {archiveState.loading && <Spinner />}
              {archiveState.loading ? 'Generating…' : 'Generate Game'}
            </button>

            {/* Error display */}
            {archiveState.error && (
              <p className="generate-error">{archiveState.error}</p>
            )}

            {/* Divider */}
            <hr className="generate-divider" />

            {/* Update Archive Data button */}
            <button
              type="button"
              onClick={handleUpdateArchive}
              disabled={archiveState.updateLoading || isRecentlyUpdated}
              className="generate-secondary-btn"
            >
              {archiveState.updateLoading && <Spinner />}
              {archiveState.updateLoading
                ? 'Updating archive data…'
                : isRecentlyUpdated
                  ? 'Data was recently updated'
                  : 'Update Archive Data'}
            </button>

            {/* Update message */}
            {archiveState.updateMessage && (
              <p className={getUpdateMessageClass()}>
                {archiveState.updateMessage}
              </p>
            )}

            {/* Last updated timestamp */}
            <p className="generate-timestamp">
              {archiveState.lastUpdated
                ? `Last updated: ${formatDate(archiveState.lastUpdated)}`
                : 'No archive data available'}
            </p>
          </div>
        )}

        {/* Labs Tab */}
        {activeTab === 'labs' && (
          <div className="generate-tab-content">
            {/* Keywords textarea */}
            <div>
              <textarea
                value={labsState.keywords}
                onChange={(e) =>
                  setLabsState((prev) => ({ ...prev, keywords: e.target.value }))
                }
                disabled={labsState.loading}
                placeholder="Science, history, movies…"
                rows={4}
                className="generate-textarea"
              />
              <p className="generate-helper-text">
                Enter keywords separated by commas, spaces, or newlines (max 10)
              </p>
            </div>

            {/* Generate Game button */}
            <button
              type="button"
              onClick={handleGenerateLabs}
              disabled={labsState.keywords.trim() === '' || labsState.loading}
              className="generate-primary-btn"
            >
              {labsState.loading && <Spinner />}
              {labsState.loading ? 'Generating game… this may take a moment.' : 'Generate Game'}
            </button>

            {/* Error display */}
            {labsState.error && (
              <p className="generate-error">{labsState.error}</p>
            )}
          </div>
        )}

        {/* AI Generation Tab */}
        {activeTab === 'ai' && (
          <div className="generate-tab-content">
            {/* Number of Rounds */}
            <div>
              <label className="generate-field-label">Number of Rounds</label>
              <select
                value={aiState.rounds}
                onChange={(e) => setAiState((prev) => ({ ...prev, rounds: e.target.value }))}
                disabled={aiState.loading}
                className="generate-select"
              >
                <option value="" disabled>Select rounds…</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={String(n)}>{n}</option>
                ))}
              </select>
            </div>

            {/* Categories per Round */}
            <div>
              <label className="generate-field-label">Categories per Round</label>
              <select
                value={aiState.categoriesPerRound}
                onChange={(e) => setAiState((prev) => ({ ...prev, categoriesPerRound: e.target.value }))}
                disabled={aiState.loading}
                className="generate-select"
              >
                <option value="" disabled>Select categories…</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={String(n)}>{n}</option>
                ))}
              </select>
            </div>

            {/* Difficulty */}
            <div>
              <label className="generate-field-label">Difficulty</label>
              <select
                value={aiState.difficulty}
                onChange={(e) => setAiState((prev) => ({ ...prev, difficulty: e.target.value }))}
                disabled={aiState.loading}
                className="generate-select"
              >
                <option value="" disabled>Select difficulty…</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            {/* Daily Doubles per Round */}
            <div>
              <label className="generate-field-label">Daily Doubles per Round</label>
              <input
                type="number"
                value={aiState.dailyDoublesPerRound}
                onChange={(e) => setAiState((prev) => ({ ...prev, dailyDoublesPerRound: Math.max(0, Math.min(Number(prev.categoriesPerRound) || 0, Number(e.target.value))) }))}
                disabled={aiState.loading || aiState.rounds === '' || aiState.categoriesPerRound === '' || aiState.difficulty === ''}
                min={0}
                max={Number(aiState.categoriesPerRound) || 0}
                className="generate-select"
              />
            </div>

            {/* Special Requests */}
            <div>
              <label className="generate-field-label">Special Requests</label>
              <textarea
                value={aiState.specialRequests}
                onChange={(e) => setAiState((prev) => ({ ...prev, specialRequests: e.target.value }))}
                disabled={aiState.loading}
                placeholder="Add keywords, themes, or custom instructions…"
                maxLength={500}
                rows={3}
                className="generate-textarea"
              />
              <p className="generate-helper-text">
                {aiState.specialRequests.length}/500 characters
              </p>
            </div>

            {/* Generate Game button */}
            <button
              type="button"
              onClick={handleGenerateAi}
              disabled={isAiGenerateDisabled}
              className="generate-primary-btn"
            >
              {aiState.loading && <Spinner />}
              {aiState.loading ? 'Generating…' : 'Generate Game'}
            </button>

            {/* Error display */}
            {aiState.error && (
              <p className="generate-error">{aiState.error}</p>
            )}
          </div>
        )}
      </BackgroundGradient>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="generate-spinner"
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
