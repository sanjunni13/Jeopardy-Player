import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  generateArchiveGame,
  updateArchiveData,
  generateLabsGame,
  getArchiveLastUpdated,
} from '../../utils/generateApi'

type ActiveTab = 'archive' | 'labs'

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

  const [mountTime] = useState(() => Date.now())

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

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="bg-slate-950 min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-8">
        {/* Back button */}
        <button
          type="button"
          onClick={() => navigate({ to: '/home' })}
          className="text-slate-400 hover:text-slate-200 mb-4 text-sm flex items-center gap-1"
        >
          ← Back
        </button>

        {/* Title */}
        <h1 className="text-2xl font-bold text-slate-100 mb-6">Generate a Game</h1>

        {/* Tab bar */}
        <div className="flex border-b border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('archive')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'archive'
                ? 'text-slate-100 border-b-2 border-[#6A1B9A]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            J! Archive
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('labs')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'labs'
                ? 'text-slate-100 border-b-2 border-[#6A1B9A]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            JeopardyLabs
          </button>
        </div>

        {/* Archive Tab */}
        {activeTab === 'archive' && (
          <div className="space-y-5">
            {/* Number of Rounds */}
            <div>
              <label className="block text-slate-300 text-sm mb-1">Number of Rounds</label>
              <select
                value={archiveState.rounds}
                onChange={(e) =>
                  setArchiveState((prev) => ({ ...prev, rounds: Number(e.target.value) }))
                }
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-[#6A1B9A]"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Categories per Round */}
            <div>
              <label className="block text-slate-300 text-sm mb-1">Categories per Round</label>
              <select
                value={archiveState.categoriesPerRound}
                onChange={(e) =>
                  setArchiveState((prev) => ({ ...prev, categoriesPerRound: Number(e.target.value) }))
                }
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-[#6A1B9A]"
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
              className="w-full rounded-full bg-[#6A1B9A] text-white py-3 px-6 font-medium hover:bg-[#7B1FA2] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {archiveState.loading && <Spinner />}
              {archiveState.loading ? 'Generating…' : 'Generate Game'}
            </button>

            {/* Error display */}
            {archiveState.error && (
              <p className="text-rose-400 text-sm">{archiveState.error}</p>
            )}

            {/* Divider */}
            <hr className="border-slate-800" />

            {/* Update Archive Data button */}
            <button
              type="button"
              onClick={handleUpdateArchive}
              disabled={archiveState.updateLoading || isRecentlyUpdated}
              className="w-full rounded-full border border-slate-700 text-slate-300 py-3 px-6 font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
              <p
                className={`text-sm ${
                  archiveState.updateMessage.toLowerCase().includes('error') ||
                  archiveState.updateMessage.toLowerCase().includes('fail')
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}
              >
                {archiveState.updateMessage}
              </p>
            )}

            {/* Last updated timestamp */}
            <p className="text-slate-400 text-sm">
              {archiveState.lastUpdated
                ? `Last updated: ${formatDate(archiveState.lastUpdated)}`
                : 'No archive data available'}
            </p>
          </div>
        )}

        {/* Labs Tab */}
        {activeTab === 'labs' && (
          <div className="space-y-5">
            {/* Keywords textarea */}
            <div>
              <textarea
                value={labsState.keywords}
                onChange={(e) =>
                  setLabsState((prev) => ({ ...prev, keywords: e.target.value }))
                }
                disabled={labsState.loading}
                placeholder="science, history, movies…"
                rows={4}
                className="w-full border border-slate-700 bg-slate-950 text-slate-100 rounded-2xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#6A1B9A] placeholder:text-slate-500 disabled:opacity-50"
              />
              <p className="text-slate-400 text-sm mt-1">
                Enter keywords separated by commas, spaces, or newlines (max 10)
              </p>
            </div>

            {/* Generate Game button */}
            <button
              type="button"
              onClick={handleGenerateLabs}
              disabled={labsState.keywords.trim() === '' || labsState.loading}
              className="w-full rounded-full bg-[#6A1B9A] text-white py-3 px-6 font-medium hover:bg-[#7B1FA2] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {labsState.loading && <Spinner />}
              {labsState.loading ? 'Generating game… this may take a moment.' : 'Generate Game'}
            </button>

            {/* Error display */}
            {labsState.error && (
              <p className="text-rose-400 text-sm">{labsState.error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
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
