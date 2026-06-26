import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '../../../hooks/useAuth'
import { usePlayerProfileContext } from '../../../hooks/usePlayerProfileContext'
import { supabase } from '../../../utils/supabase'
import { updatePlayerName, deleteGame, deleteAccount } from '../../../utils/settingsApi'
import { DeleteAccountDialog } from '../../../components/DeleteAccountDialog'
import { DeleteGameDialog } from '../../../components/DeleteGameDialog'
import './ProfileSection.css'

interface Game {
  id: number
  game_name: string
}

const SUCCESS_MESSAGE_DURATION = 10000 // 10 seconds

// Track deleted game IDs across component re-mounts within the same session
const deletedGameIds = new Set<number>()

export function ProfileSection() {
  const { session } = useAuth()
  const { profile } = usePlayerProfileContext()
  const navigate = useNavigate()

  // Player name state
  const [playerName, setPlayerName] = useState('')
  const [nameOverride, setNameOverride] = useState<string | null>(null)
  const [nameMessage, setNameMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [nameSubmitting, setNameSubmitting] = useState(false)
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Email state
  const [currentEmail, setCurrentEmail] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [emailSubmitting, setEmailSubmitting] = useState(false)
  const emailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Password state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const passwordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Account creation date
  const [createdAt, setCreatedAt] = useState<string>('Unavailable')

  // Games state
  const [games, setGames] = useState<Game[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [gamesError, setGamesError] = useState<string | null>(null)
  const [gamesSuccessMessage, setGamesSuccessMessage] = useState<string | null>(null)
  const gamesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Delete game dialog state
  const [deleteGameDialogOpen, setDeleteGameDialogOpen] = useState(false)
  const [gameToDelete, setGameToDelete] = useState<Game | null>(null)

  // Delete account dialog state
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false)
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null)

  // Initialize player name from profile
  const displayedPlayerName = nameOverride ?? profile?.playerName ?? ''

  // Fetch current user info (email + created_at)
  useEffect(() => {
    async function fetchUserInfo() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        setCurrentEmail(user.email)
      }
      if (user?.created_at) {
        const formatted = new Date(user.created_at).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        setCreatedAt(formatted)
      } else {
        setCreatedAt('Unavailable')
      }
    }
    fetchUserInfo()
  }, [])

  // Fetch games list
  const fetchGames = useCallback(async () => {
    if (!profile?.playerId) return
    setGamesLoading(true)
    setGamesError(null)

    const { data, error } = await supabase
      .from('games')
      .select('id, game_name')
      .eq('created_by', profile.playerId)
      .order('game_name', { ascending: true })

    if (error) {
      setGamesError('Failed to load games')
      setGames([])
    } else {
      // Filter out any games that were deleted in this session
      const filtered = (data ?? []).filter(g => !deletedGameIds.has(g.id))
      setGames(filtered)
    }
    setGamesLoading(false)
  }, [profile])

  // Fetch games on mount and when profile changes
  const playerId = profile?.playerId
  useEffect(() => {
    if (!playerId) return
    let cancelled = false

    async function load() {
      setGamesLoading(true)
      setGamesError(null)

      const { data, error } = await supabase
        .from('games')
        .select('id, game_name')
        .eq('created_by', playerId)
        .order('game_name', { ascending: true })

      if (cancelled) return

      if (error) {
        setGamesError('Failed to load games')
        setGames([])
      } else {
        const filtered = (data ?? []).filter(g => !deletedGameIds.has(g.id))
        setGames(filtered)
      }
      setGamesLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [playerId])

  // Re-fetch games when returning to the page (window focus)
  useEffect(() => {
    function handleFocus() {
      if (profile?.playerId) {
        void fetchGames()
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchGames, profile?.playerId])

  // Cleanup timers on unmount
  useEffect(() => {
    const nameTimer = nameTimerRef
    const emailTimer = emailTimerRef
    const passwordTimer = passwordTimerRef
    const gamesTimer = gamesTimerRef
    return () => {
      if (nameTimer.current) clearTimeout(nameTimer.current)
      if (emailTimer.current) clearTimeout(emailTimer.current)
      if (passwordTimer.current) clearTimeout(passwordTimer.current)
      if (gamesTimer.current) clearTimeout(gamesTimer.current)
    }
  }, [])

  // Auto-dismiss success messages helper
  function setSuccessWithTimeout(
    setter: (msg: { type: 'success' | 'error'; text: string } | null) => void,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    text: string
  ) {
    setter({ type: 'success', text })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setter(null), SUCCESS_MESSAGE_DURATION)
  }

  // --- Handlers ---

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return

    // If same name (case-insensitive), do nothing
    if (playerName.trim().toLowerCase() === displayedPlayerName.toLowerCase()) {
      return
    }

    setNameSubmitting(true)
    setNameMessage(null)

    const result = await updatePlayerName(profile.playerId, playerName)

    if (result.success) {
      const newName = playerName.trim()
      setNameOverride(newName)
      setPlayerName('')
      setSuccessWithTimeout(setNameMessage, nameTimerRef, 'Player name updated successfully')
    } else {
      setNameMessage({ type: 'error', text: result.error ?? 'Failed to update player name' })
    }
    setNameSubmitting(false)
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPlayerName(e.target.value)
    if (nameMessage) {
      setNameMessage(null)
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEmailMessage(null)

    const trimmedEmail = newEmail.trim()

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!trimmedEmail || !emailRegex.test(trimmedEmail) || trimmedEmail.length > 254) {
      setEmailMessage({ type: 'error', text: 'Please enter a valid email address' })
      return
    }

    // Check if same as current
    if (trimmedEmail.toLowerCase() === currentEmail.toLowerCase()) {
      setEmailMessage({ type: 'error', text: 'New email must differ from your current email' })
      return
    }

    setEmailSubmitting(true)

    const { error } = await supabase.auth.updateUser({ email: trimmedEmail })

    if (error) {
      if (error.message?.toLowerCase().includes('already')) {
        setEmailMessage({ type: 'error', text: 'This email is already in use' })
      } else {
        setEmailMessage({ type: 'error', text: error.message || 'Failed to update email' })
      }
    } else {
      setSuccessWithTimeout(setEmailMessage, emailTimerRef, 'Check both your old and new email for confirmation links')
      setNewEmail('')
    }
    setEmailSubmitting(false)
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordMessage(null)

    // Validate length
    if (newPassword.length < 6 || newPassword.length > 72) {
      setPasswordMessage({ type: 'error', text: 'Password must be between 6 and 72 characters' })
      return
    }

    // Validate match
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match' })
      return
    }

    setPasswordSubmitting(true)

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setPasswordMessage({ type: 'error', text: error.message || 'Failed to update password' })
    } else {
      setSuccessWithTimeout(setPasswordMessage, passwordTimerRef, 'Password updated successfully')
      setNewPassword('')
      setConfirmPassword('')
    }
    setPasswordSubmitting(false)
  }

  function handleDeleteGameClick(game: Game) {
    setGameToDelete(game)
    setDeleteGameDialogOpen(true)
  }

  async function handleDeleteGameConfirm() {
    if (!gameToDelete || !session?.user?.id) return

    const result = await deleteGame(gameToDelete.id, session.user.id, gameToDelete.game_name)

    setDeleteGameDialogOpen(false)

    if (result.success) {
      deletedGameIds.add(gameToDelete.id)
      setGames((prev) => prev.filter((g) => g.id !== gameToDelete.id))
      setGamesSuccessMessage(`Successfully deleted ${gameToDelete.game_name}`)
      if (gamesTimerRef.current) clearTimeout(gamesTimerRef.current)
      gamesTimerRef.current = setTimeout(() => setGamesSuccessMessage(null), SUCCESS_MESSAGE_DURATION)
    } else {
      setGamesError(result.error ?? 'Failed to delete game')
    }
    setGameToDelete(null)
  }

  function handleDeleteGameCancel() {
    setDeleteGameDialogOpen(false)
    setGameToDelete(null)
  }

  function handleDeleteAccountClick() {
    setDeleteAccountDialogOpen(true)
  }

  async function handleDeleteAccountConfirm() {
    if (!session?.user?.id || !profile?.playerId) return

    setDeleteAccountLoading(true)
    setDeleteAccountError(null)

    const result = await deleteAccount(session.user.id, profile.playerId)

    if (result.success) {
      await supabase.auth.signOut()
      navigate({ to: '/login', replace: true })
    } else {
      setDeleteAccountLoading(false)
      setDeleteAccountDialogOpen(false)
      setDeleteAccountError(
        `${result.error ?? 'Account deletion failed'}. Please contact support.`
      )
    }
  }

  function handleDeleteAccountCancel() {
    if (!deleteAccountLoading) {
      setDeleteAccountDialogOpen(false)
    }
  }

  return (
    <section className="profile-section" aria-labelledby="profile-section-title">
      <h2 id="profile-section-title" className="profile-section__title">Profile</h2>

      {/* Player Name */}
      <form onSubmit={handleNameSubmit} className="profile-section__form-group">
        <label htmlFor="settings-player-name" className="profile-section__label">
          Player Name
        </label>
        <p className="profile-section__current-value">Current: {displayedPlayerName || '—'}</p>
        <div className="profile-section__input-row">
          <input
            id="settings-player-name"
            type="text"
            value={playerName}
            onChange={handleNameChange}
            placeholder="New player name"
            maxLength={50}
            autoComplete="off"
            className="profile-section__input"
          />
          <button
            type="submit"
            disabled={nameSubmitting}
            className="profile-section__btn profile-section__btn--primary"
          >
            {nameSubmitting ? 'Saving…' : 'Update Name'}
          </button>
        </div>
        {nameMessage && (
          <p
            role="alert"
            className={`profile-section__message profile-section__message--${nameMessage.type}`}
          >
            {nameMessage.text}
          </p>
        )}
      </form>

      {/* Email */}
      <form onSubmit={handleEmailSubmit} className="profile-section__form-group">
        <label htmlFor="settings-email" className="profile-section__label">
          Email
        </label>
        <p className="profile-section__current-value">Current: {currentEmail || '—'}</p>
        <div className="profile-section__input-row">
          <input
            id="settings-email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="New email address"
            className="profile-section__input"
          />
          <button
            type="submit"
            disabled={emailSubmitting}
            className="profile-section__btn profile-section__btn--primary"
          >
            {emailSubmitting ? 'Updating…' : 'Update Email'}
          </button>
        </div>
        {emailMessage && (
          <p
            role="alert"
            className={`profile-section__message profile-section__message--${emailMessage.type}`}
          >
            {emailMessage.text}
          </p>
        )}
      </form>

      {/* Password */}
      <form onSubmit={handlePasswordSubmit} className="profile-section__form-group">
        <label className="profile-section__label">Change Password</label>
        <div className="profile-section__password-fields">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            maxLength={72}
            autoComplete="new-password"
            aria-label="New password"
            className="profile-section__input"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            maxLength={72}
            autoComplete="new-password"
            aria-label="Confirm new password"
            className="profile-section__input"
          />
        </div>
        <button
          type="submit"
          disabled={passwordSubmitting}
          className="profile-section__btn profile-section__btn--primary"
        >
          {passwordSubmitting ? 'Updating…' : 'Update Password'}
        </button>
        {passwordMessage && (
          <p
            role="alert"
            className={`profile-section__message profile-section__message--${passwordMessage.type}`}
          >
            {passwordMessage.text}
          </p>
        )}
      </form>

      {/* Account Creation Date */}
      <div className="profile-section__form-group">
        <span className="profile-section__label">Account Created</span>
        <p className="profile-section__current-value">{createdAt}</p>
      </div>

      {/* Games List */}
      <div className="profile-section__form-group">
        <span className="profile-section__label">Your Games</span>
        {gamesLoading && <p className="profile-section__current-value">Loading games…</p>}
        {!gamesLoading && games.length === 0 && !gamesError && (
          <p className="profile-section__current-value">No games yet</p>
        )}
        {!gamesLoading && games.length > 0 && (
          <ul className="profile-section__games-list">
            {games.map((game) => (
              <li key={game.id} className="profile-section__game-item">
                <span className="profile-section__game-name">{game.game_name}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteGameClick(game)}
                  className="profile-section__btn profile-section__btn--delete-game"
                  aria-label={`Delete game ${game.game_name}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        {gamesSuccessMessage && (
          <p role="status" className="profile-section__message profile-section__message--success">
            {gamesSuccessMessage}
          </p>
        )}
        {gamesError && (
          <p role="alert" className="profile-section__message profile-section__message--error">
            {gamesError}
          </p>
        )}
      </div>

      {/* Delete Account */}
      <div className="profile-section__form-group profile-section__danger-zone">
        <h3 className="profile-section__danger-zone-heading">Danger Zone</h3>
        {deleteAccountError && (
          <p role="alert" className="profile-section__message profile-section__message--error">
            {deleteAccountError}
          </p>
        )}
        <button
          type="button"
          onClick={handleDeleteAccountClick}
          className="delete-button"
        >
          <span className="button-shadow"></span>
          <span className="button-edge"></span>
          <span className="button-front">
            <svg
              className="delete-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            DELETE ACCOUNT
          </span>
        </button>
      </div>

      {/* Dialogs */}
      <DeleteGameDialog
        isOpen={deleteGameDialogOpen}
        gameName={gameToDelete?.game_name ?? ''}
        onConfirm={handleDeleteGameConfirm}
        onCancel={handleDeleteGameCancel}
      />
      <DeleteAccountDialog
        isOpen={deleteAccountDialogOpen}
        onConfirm={handleDeleteAccountConfirm}
        onCancel={handleDeleteAccountCancel}
        isLoading={deleteAccountLoading}
      />
    </section>
  )
}
