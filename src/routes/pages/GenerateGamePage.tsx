import { useState, useRef } from 'react'
import { useNavigate, useBlocker } from '@tanstack/react-router'
import {
  generateArchiveGame,
  generateLabsGame,
  generateAiGame,
} from '../../utils/generateApi'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import { CloudSpinner } from '../../components/ui/CloudSpinner'
import './GenerateGamePage.css'

type ActiveTab = 'archive' | 'labs' | 'ai'

interface ArchiveState {
  rounds: number
  categoriesPerRound: number
  loading: boolean
  error: string | null
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

  const [toast, setToast] = useState<string | null>(null)
  const navigatingAfterSuccess = useRef(false)

  useBlocker({
    shouldBlockFn: () => {
      if (navigatingAfterSuccess.current) return false
      return !window.confirm('An operation is in progress. Are you sure you want to leave?')
    },
    enableBeforeUnload: () => {
      if (navigatingAfterSuccess.current) return false
      return aiState.loading || archiveState.loading || labsState.loading
    },
    disabled: !aiState.loading && !archiveState.loading && !labsState.loading,
  })

  const isAiGenerateDisabled = aiState.rounds === '' || aiState.categoriesPerRound === '' || aiState.difficulty === '' || aiState.loading

  const isGenerating = archiveState.loading || labsState.loading || aiState.loading

  async function handleGenerateArchive() {
    setArchiveState((prev) => ({ ...prev, loading: true, error: null }))
    const response = await generateArchiveGame(archiveState.rounds, archiveState.categoriesPerRound)
    if ('success' in response) {
      navigatingAfterSuccess.current = true
      navigate({ to: '/home/game/$gameId', params: { gameId: response.id } })
    } else {
      setArchiveState((prev) => ({ ...prev, error: response.error, loading: false }))
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
      navigatingAfterSuccess.current = true
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
      navigatingAfterSuccess.current = true
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
      navigatingAfterSuccess.current = true
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
          disabled={isGenerating}
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
            disabled={isGenerating}
          >
            J! Archive
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('labs')}
            className={`generate-tab ${activeTab === 'labs' ? 'active' : ''}`}
            disabled={isGenerating}
          >
            JeopardyLabs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`generate-tab ${activeTab === 'ai' ? 'active' : ''}`}
            disabled={isGenerating}
          >
            AI Generation
          </button>
        </div>

        {/* Cloud Spinner Overlay */}
        {isGenerating && (
          <div className="generate-loading-overlay">
            <CloudSpinner />
            <p className="generate-loading-text">Generating your game…</p>
          </div>
        )}

        {/* Archive Tab */}
        {activeTab === 'archive' && !isGenerating && (
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
              {archiveState.loading ? 'Generating…' : 'Generate Game'}
            </button>

            {/* Error display */}
            {archiveState.error && (
              <p className="generate-error">{archiveState.error}</p>
            )}

          </div>
        )}

        {/* Labs Tab */}
        {activeTab === 'labs' && !isGenerating && (
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
              {labsState.loading ? 'Generating…' : 'Generate Game'}
            </button>

            {/* Error display */}
            {labsState.error && (
              <p className="generate-error">{labsState.error}</p>
            )}
          </div>
        )}

        {/* AI Generation Tab */}
        {activeTab === 'ai' && !isGenerating && (
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

