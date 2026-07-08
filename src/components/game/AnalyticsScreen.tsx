import { useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { toast } from 'react-toastify'
import type { GameSession } from '../../types/game'
import { computeAllAnalytics } from '../../utils/analyticsUtils'
import { updateGameStats } from '../../utils/gameApi'
import { usePlayerProfileContext } from '../../hooks/usePlayerProfileContext'
import { RatingPrompt } from '../RatingPrompt'
import { BackgroundGradient } from '../ui/background-gradient'
import { ScoreTimelineChart, PALETTE } from './ScoreTimelineChart'
import { CategoryAccuracy } from './CategoryAccuracy'
import { DailyDoubleBreakdown } from './DailyDoubleBreakdown'
import { BiggestComeback } from './BiggestComeback'
import { LongestLossStreak } from './LongestLossStreak'
import { HeadToHead } from './HeadToHead'
import './AnalyticsScreen.css'
import './AnalyticsBreakdown.css'

interface AnalyticsScreenProps {
  session: GameSession
  gameId: string
  onBackToHome: () => void
}

export function AnalyticsScreen({ session, gameId, onBackToHome }: AnalyticsScreenProps) {
  const statsCalledRef = useRef(false)
  const confettiFiredRef = useRef(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { profile } = usePlayerProfileContext()

  const [breakdownExpanded, setBreakdownExpanded] = useState(false)

  // Compute all analytics once, memoised for the lifetime of this screen
  const analytics = useMemo(() => computeAllAnalytics(session), [session])

  const { sortedPlayers } = analytics
  const highestScore = sortedPlayers[0]?.score ?? 0

  // Map each player to their timeline chart colour (same order as playerNames passed to ScoreTimelineChart)
  const playerColorMap = useMemo(() => {
    const map = new Map<string, string>()
    sortedPlayers.forEach((p, i) => {
      map.set(p.name, PALETTE[i % PALETTE.length])
    })
    return map
  }, [sortedPlayers])
  const winnerNames = sortedPlayers
    .filter(p => p.score === highestScore)
    .map(p => p.name)
  const hasMultipleWinners = winnerNames.length > 1

  // Post-game stats update (fires once, same pattern as GameOver)
  useEffect(() => {
    if (statsCalledRef.current) return
    statsCalledRef.current = true

    const authenticatedPlayer = profile
      ? { playerId: profile.playerId, playerName: profile.playerName }
      : undefined

    updateGameStats(gameId, session.players, winnerNames, authenticatedPlayer)
      .then(response => {
        if (!response.success) {
          toast.warning(response.error ?? 'Failed to update game statistics.')
        }
      })
      .catch(() => {
        toast.warning('Failed to update game statistics.')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fire confetti on mount (same pattern as GameOver)
  useEffect(() => {
    if (confettiFiredRef.current || !canvasRef.current) return
    confettiFiredRef.current = true

    const myConfetti = confetti.create(canvasRef.current, { resize: true })
    const end = Date.now() + 3 * 1000
    const colors = ['#6A1B9A', '#9C27B0', '#CE93D8', '#FFD700', '#E1BEE7']

    const frame = () => {
      if (Date.now() > end) return

      myConfetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        startVelocity: 60,
        origin: { x: 0, y: 0.5 },
        colors,
      })
      myConfetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        startVelocity: 60,
        origin: { x: 1, y: 0.5 },
        colors,
      })

      requestAnimationFrame(frame)
    }

    setTimeout(frame, 500)
  }, [])

  return (
    <div className="analytics-page">
      {/* Confetti canvas — fixed overlay, pointer-events none */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 100,
        }}
      />

      {/* Outermost container — ref used for image capture */}
      <div ref={containerRef} className="analytics-capture-root">
        <BackgroundGradient
          containerClassName="analytics-gradient-container"
          className="analytics-card"
        >
          {/* ── Title ── */}
          <h1 className="analytics-title">Game Over!</h1>

          {/* ── Winner announcement ── */}
          {winnerNames.length > 0 && (
            <div className="analytics-winner">
              {hasMultipleWinners ? (
                <p className="analytics-winner-text">🏆 Multiple Winners!</p>
              ) : (
                <p className="analytics-winner-text">🏆 Winner: {winnerNames[0]}</p>
              )}
            </div>
          )}

          {/* ── Final standings ── */}
          <ul className="analytics-standings" aria-label="Final standings">
            {sortedPlayers.map((player, index) => {
              const isWinner = winnerNames.includes(player.name)
              return (
                <li
                  key={player.name}
                  className={isWinner ? 'analytics-player analytics-player--winner' : 'analytics-player'}
                >
                  <div className="analytics-player-left">
                    <span className="analytics-player-rank">{index + 1}.</span>
                    <span className={isWinner ? 'analytics-player-name analytics-player-name--winner' : 'analytics-player-name'}>
                      {player.name}
                    </span>
                    {isWinner && <span className="analytics-trophy">🏆</span>}
                  </div>
                  <span className={player.score < 0 ? 'analytics-score analytics-score--negative' : 'analytics-score'}>
                    {player.score < 0
                      ? `-$${Math.abs(player.score).toLocaleString()}`
                      : `$${player.score.toLocaleString()}`}
                  </span>
                </li>
              )
            })}
          </ul>

          {/* ── Rating prompt (authenticated users only) ── */}
          {profile && (
            <RatingPrompt gameId={gameId} playerId={profile.playerId} />
          )}

          {/* ── Action buttons ── */}
          <div className="analytics-actions">
            {/* View Full Breakdown toggle */}
            <button
              type="button"
              className="analytics-btn analytics-btn--breakdown"
              onClick={() => setBreakdownExpanded(prev => !prev)}
              aria-expanded={breakdownExpanded}
            >
              {breakdownExpanded ? 'Hide Breakdown ▲' : 'View Full Breakdown ▼'}
            </button>

            {/* Download as Image
            <button
              type="button"
              className="analytics-btn analytics-btn--download"
              onClick={handleDownload}
              disabled={exporting}
              aria-busy={exporting}
            >
              {exporting ? (
                <>
                  <span className="analytics-spinner" aria-hidden="true" /> Capturing…
                </>
              ) : (
                'Download as Image'
              )}
            </button> */}
{/* Back to Home */}
            <button
              type="button"
              className="analytics-btn analytics-btn--home"
              onClick={onBackToHome}
            >
              Back to Home
            </button>
          </div>

          {/* ── Full Breakdown Section ── */}
          {breakdownExpanded && (
            <div className="analytics-breakdown">
              {/* Score Timeline */}
              <section className="analytics-section">
                <h2 className="analytics-section-title">Score Timeline</h2>
                <ScoreTimelineChart
                  timelines={analytics.scoreTimelines}
                  playerNames={sortedPlayers.map(p => p.name)}
                />
              </section>

              {/* Category Accuracy */}
              <section className="analytics-section">
                <h2 className="analytics-section-title">Category Accuracy</h2>
                <CategoryAccuracy
                  accuracy={analytics.categoryAccuracy}
                  playerNames={sortedPlayers.map(p => p.name)}
                />
              </section>

              {/* Daily Double Breakdown (hidden when no records) */}
              {analytics.dailyDoubleRecordsEnriched.length > 0 && (
                <section className="analytics-section">
                  <h2 className="analytics-section-title">Daily Double Results</h2>
                  <DailyDoubleBreakdown records={analytics.dailyDoubleRecordsEnriched} />
                </section>
              )}

              {/* Biggest Comeback (hidden when all deltas are 0) */}
              {analytics.biggestComebacks.some(c => c.delta > 0) && (
                <section className="analytics-section">
                  <h2 className="analytics-section-title">Biggest Comeback</h2>
                  <BiggestComeback comebacks={analytics.biggestComebacks} />
                </section>
              )}

              {/* Longest Loss Streak (hidden when no player has 2+ consecutive wrong) */}
              {analytics.longestLossStreaks.length > 0 && (
                <section className="analytics-section">
                  <h2 className="analytics-section-title">Longest Loss Streak</h2>
                  <LongestLossStreak streaks={analytics.longestLossStreaks} />
                </section>
              )}

              {/* Head to Head (hidden when fewer than 2 players) */}
              {analytics.headToHeads.length > 0 && (
                <section className="analytics-section">
                  <h2 className="analytics-section-title">Head to Head</h2>
                  <HeadToHead comparisons={analytics.headToHeads} playerColors={playerColorMap} />
                </section>
              )}
            </div>
          )}
        </BackgroundGradient>
      </div>
    </div>
  )
}
