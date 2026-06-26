import { useState, useContext } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../utils/supabase'
import { PlayerProfileContext } from '../../contexts/PlayerProfileContext'
import {
  validatePlayerName,
  checkPlayerNameAvailable,
  buildPlayerInsertPayload,
} from '../../utils/playerProfile'
import { BackgroundGradient } from '../../components/ui/background-gradient'
import './ProfileSetupPage.css'

export function ProfileSetupPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const profileContext = useContext(PlayerProfileContext)

  const [playerName, setPlayerName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [hasError, setHasError] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setHasError(false)

    // Client-side validation
    const validation = validatePlayerName(playerName)
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid player name')
      setHasError(true)
      return
    }

    if (!session?.user?.id) {
      setError('Something went wrong, please try again')
      setHasError(true)
      return
    }

    setSubmitting(true)

    try {
      // Check if name is available (case-insensitive)
      const isAvailable = await checkPlayerNameAvailable(playerName, supabase)
      if (!isAvailable) {
        setError('This name is already taken')
        setHasError(true)
        setSubmitting(false)
        return
      }

      // Build and insert the player record
      const payload = buildPlayerInsertPayload(playerName, session.user.id)
      const { error: insertError } = await supabase
        .from('players')
        .insert(payload)

      if (insertError) {
        // Handle unique constraint violation (race condition on duplicate name)
        if (insertError.code === '23505') {
          setError('This name is already taken')
        } else {
          setError('Something went wrong, please try again')
        }
        setHasError(true)
        setSubmitting(false)
        return
      }

      // Refresh the profile context so the app knows we have a profile now
      if (profileContext?.refreshProfile) {
        await profileContext.refreshProfile()
      }

      // Navigate to home on success
      navigate({ to: '/home', replace: true })
    } catch {
      setError('Something went wrong, please try again')
      setHasError(true)
      setSubmitting(false)
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPlayerName(e.target.value)
    if (hasError) {
      setError(null)
      setHasError(false)
    }
  }

  return (
    <main className="profile-setup-page">
      <BackgroundGradient containerClassName="profile-setup-gradient-container" className="profile-setup-card">
        <h1 className="profile-setup-title">Choose your player name</h1>
        <p className="profile-setup-subtitle">
          Pick a name that other players will see. You can use letters, numbers, spaces, hyphens, and underscores.
        </p>

        <form onSubmit={handleSubmit} className="profile-setup-form">
          <div className="profile-setup-field">
            <label htmlFor="player-name" className="profile-setup-label">Player Name</label>
            <input
              id="player-name"
              type="text"
              autoComplete="off"
              value={playerName}
              onChange={handleInputChange}
              placeholder="Enter your player name"
              maxLength={50}
              className={`profile-setup-input ${hasError ? 'profile-setup-input-error' : ''}`}
            />
          </div>

          {error && <p role="alert" className="profile-setup-error">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="profile-setup-submit-btn"
          >
            {submitting ? 'Creating profile…' : 'Continue'}
          </button>
        </form>
      </BackgroundGradient>
    </main>
  )
}
