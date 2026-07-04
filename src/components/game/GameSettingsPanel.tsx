import { useState, useCallback } from 'react'
import type { ToggleConfig } from '../../types/game'
import { DEFAULT_TOGGLE_CONFIG } from '../../types/game'
import { readPreferences } from '../../utils/preferencesStore'
import './GameSettingsPanel.css'

interface GameSettingsPanelProps {
  onConfigChange: (config: ToggleConfig, hasErrors: boolean) => void
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateWagerFloor(value: string): string | null {
  if (value === '' || value === '0') return 'Enter a value between 1 and 10,000.'
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 10000) return 'Must be an integer between 1 and 10,000.'
  return null
}

function validateStealBonus(value: string): string | null {
  if (value === '' || value === '0') return 'Enter a value between 1 and 5,000.'
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 5000) return 'Must be an integer between 1 and 5,000.'
  return null
}

function validateStreakThreshold(value: string): string | null {
  if (value === '') return 'Enter a value between 2 and 5.'
  const n = Number(value)
  if (!Number.isInteger(n) || n < 2 || n > 5) return 'Must be an integer between 2 and 5.'
  return null
}

function validateStreakMultiplier(value: string): string | null {
  if (value === '') return 'Enter a value between 2 and 5.'
  const n = Number(value)
  if (!Number.isInteger(n) || n < 2 || n > 5) return 'Must be an integer between 2 and 5.'
  return null
}

function validateTimerDuration(value: string): string | null {
  if (value === '') return 'Enter a value between 5 and 120.'
  const n = Number(value)
  if (!Number.isInteger(n) || n < 5 || n > 120) return 'Must be an integer between 5 and 120.'
  return null
}

// ─── Filter non-integer keystrokes ───────────────────────────────────────────
function filterInt(value: string): string {
  return /^\d*$/.test(value) ? value : value.replace(/[^\d]/g, '')
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GameSettingsPanel({ onConfigChange }: GameSettingsPanelProps) {
  // ── Toggle enabled states ──
  const [wageringEnabled, setWageringEnabled] = useState(false)
  const [rulesEnabled, setRulesEnabled] = useState(false)
  const [timedEnabled, setTimedEnabled] = useState(false)

  // ── Wagering sub-section ──
  const [wagerFloor, setWagerFloor] = useState('100')
  const [wagerFloorError, setWagerFloorError] = useState<string | null>(null)

  // ── Rules Engine sub-section ──
  const [stealBonusEnabled, setStealBonusEnabled] = useState(false)
  const [stealBonusPoints, setStealBonusPoints] = useState('200')
  const [stealBonusError, setStealBonusError] = useState<string | null>(null)

  const [streakEnabled, setStreakEnabled] = useState(false)
  const [streakThreshold, setStreakThreshold] = useState('3')
  const [streakThresholdError, setStreakThresholdError] = useState<string | null>(null)
  const [streakMultiplier, setStreakMultiplier] = useState('2')
  const [streakMultiplierError, setStreakMultiplierError] = useState<string | null>(null)

  const [penaltyEnabled, setPenaltyEnabled] = useState(false)

  // ── Timed Clue sub-section ──
  const [timerDuration, setTimerDuration] = useState('30')
  const [timerDurationError, setTimerDurationError] = useState<string | null>(null)

  // ─── Build config and report to parent ───────────────────────────────────

  const buildAndReport = useCallback((overrides: {
    wageringEnabled?: boolean
    rulesEnabled?: boolean
    timedEnabled?: boolean
    wagerFloor?: string
    wagerFloorError?: string | null
    stealBonusEnabled?: boolean
    stealBonusPoints?: string
    stealBonusError?: string | null
    streakEnabled?: boolean
    streakThreshold?: string
    streakThresholdError?: string | null
    streakMultiplier?: string
    streakMultiplierError?: string | null
    penaltyEnabled?: boolean
    timerDuration?: string
    timerDurationError?: string | null
  }) => {
    const we = overrides.wageringEnabled ?? wageringEnabled
    const re = overrides.rulesEnabled ?? rulesEnabled
    const te = overrides.timedEnabled ?? timedEnabled
    const wf = overrides.wagerFloor ?? wagerFloor
    const wfe = overrides.wagerFloorError !== undefined ? overrides.wagerFloorError : wagerFloorError
    const sbe = overrides.stealBonusEnabled ?? stealBonusEnabled
    const sbp = overrides.stealBonusPoints ?? stealBonusPoints
    const sbErr = overrides.stealBonusError !== undefined ? overrides.stealBonusError : stealBonusError
    const ske = overrides.streakEnabled ?? streakEnabled
    const skt = overrides.streakThreshold ?? streakThreshold
    const sktErr = overrides.streakThresholdError !== undefined ? overrides.streakThresholdError : streakThresholdError
    const skm = overrides.streakMultiplier ?? streakMultiplier
    const skmErr = overrides.streakMultiplierError !== undefined ? overrides.streakMultiplierError : streakMultiplierError
    const pe = overrides.penaltyEnabled ?? penaltyEnabled
    const td = overrides.timerDuration ?? timerDuration
    const tdErr = overrides.timerDurationError !== undefined ? overrides.timerDurationError : timerDurationError

    const config: ToggleConfig = {
      wagering: {
        enabled: we,
        wagerFloor: we ? (Number(wf) || 100) : DEFAULT_TOGGLE_CONFIG.wagering.wagerFloor,
      },
      rulesEngine: {
        enabled: re,
        stealBonus: {
          enabled: re && sbe,
          bonusPoints: re && sbe ? (Number(sbp) || 200) : DEFAULT_TOGGLE_CONFIG.rulesEngine.stealBonus.bonusPoints,
        },
        streakMultiplier: {
          enabled: re && ske,
          threshold: re && ske ? (Number(skt) || 3) : DEFAULT_TOGGLE_CONFIG.rulesEngine.streakMultiplier.threshold,
          multiplier: re && ske ? (Number(skm) || 2) : DEFAULT_TOGGLE_CONFIG.rulesEngine.streakMultiplier.multiplier,
        },
        penaltyDoubler: {
          enabled: re && pe,
        },
      },
      timedClues: {
        enabled: te,
        timerDuration: te ? (Number(td) || 30) : DEFAULT_TOGGLE_CONFIG.timedClues.timerDuration,
      },
    }

    const hasErrors =
      (we && wfe !== null) ||
      (re && sbe && sbErr !== null) ||
      (re && ske && (sktErr !== null || skmErr !== null)) ||
      (te && tdErr !== null)

    onConfigChange(config, hasErrors)
  }, [
    wageringEnabled, rulesEnabled, timedEnabled,
    wagerFloor, wagerFloorError,
    stealBonusEnabled, stealBonusPoints, stealBonusError,
    streakEnabled, streakThreshold, streakThresholdError, streakMultiplier, streakMultiplierError,
    penaltyEnabled,
    timerDuration, timerDurationError,
    onConfigChange,
  ])

  // ─── Toggle handlers ──────────────────────────────────────────────────────

  function handleWageringToggle(checked: boolean) {
    setWageringEnabled(checked)
    const newWagerFloor = checked ? '100' : '100'
    const newError = checked ? null : null
    setWagerFloor(newWagerFloor)
    setWagerFloorError(newError)
    buildAndReport({ wageringEnabled: checked, wagerFloor: newWagerFloor, wagerFloorError: newError })
  }

  function handleRulesToggle(checked: boolean) {
    setRulesEnabled(checked)
    if (!checked) {
      // Reset all rules engine sub-options
      setStealBonusEnabled(false)
      setStealBonusPoints('200')
      setStealBonusError(null)
      setStreakEnabled(false)
      setStreakThreshold('3')
      setStreakThresholdError(null)
      setStreakMultiplier('2')
      setStreakMultiplierError(null)
      setPenaltyEnabled(false)
    }
    buildAndReport({
      rulesEnabled: checked,
      stealBonusEnabled: checked ? stealBonusEnabled : false,
      stealBonusPoints: checked ? stealBonusPoints : '200',
      stealBonusError: checked ? stealBonusError : null,
      streakEnabled: checked ? streakEnabled : false,
      streakThreshold: checked ? streakThreshold : '3',
      streakThresholdError: checked ? streakThresholdError : null,
      streakMultiplier: checked ? streakMultiplier : '2',
      streakMultiplierError: checked ? streakMultiplierError : null,
      penaltyEnabled: checked ? penaltyEnabled : false,
    })
  }

  function handleTimedToggle(checked: boolean) {
    setTimedEnabled(checked)
    let duration: string
    const error: string | null = null
    if (checked) {
      // Pre-fill from preferences
      const prefs = readPreferences()
      const prefDuration = prefs.defaultTimerDuration ?? 30
      duration = String(prefDuration)
      setTimerDuration(duration)
      setTimerDurationError(null)
    } else {
      duration = '30'
      setTimerDuration('30')
      setTimerDurationError(null)
    }
    buildAndReport({ timedEnabled: checked, timerDuration: duration, timerDurationError: error })
  }

  // ─── Wagering sub-section handlers ───────────────────────────────────────

  function handleWagerFloorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const filtered = filterInt(e.target.value)
    setWagerFloor(filtered)
    // Clear error on change if value becomes valid while error is showing
    if (wagerFloorError !== null) {
      const err = validateWagerFloor(filtered)
      setWagerFloorError(err)
      buildAndReport({ wagerFloor: filtered, wagerFloorError: err })
    } else {
      buildAndReport({ wagerFloor: filtered })
    }
  }

  function handleWagerFloorBlur() {
    const err = validateWagerFloor(wagerFloor)
    setWagerFloorError(err)
    buildAndReport({ wagerFloorError: err })
  }

  // ─── Steal Bonus handlers ─────────────────────────────────────────────────

  function handleStealBonusToggle(checked: boolean) {
    setStealBonusEnabled(checked)
    const newPoints = checked ? stealBonusPoints : '200'
    const newErr = checked ? stealBonusError : null
    if (!checked) {
      setStealBonusPoints('200')
      setStealBonusError(null)
    }
    buildAndReport({ stealBonusEnabled: checked, stealBonusPoints: newPoints, stealBonusError: newErr })
  }

  function handleStealBonusChange(e: React.ChangeEvent<HTMLInputElement>) {
    const filtered = filterInt(e.target.value)
    setStealBonusPoints(filtered)
    if (stealBonusError !== null) {
      const err = validateStealBonus(filtered)
      setStealBonusError(err)
      buildAndReport({ stealBonusPoints: filtered, stealBonusError: err })
    } else {
      buildAndReport({ stealBonusPoints: filtered })
    }
  }

  function handleStealBonusBlur() {
    const err = validateStealBonus(stealBonusPoints)
    setStealBonusError(err)
    buildAndReport({ stealBonusError: err })
  }

  // ─── Streak Multiplier handlers ───────────────────────────────────────────

  function handleStreakToggle(checked: boolean) {
    setStreakEnabled(checked)
    const newThreshold = checked ? streakThreshold : '3'
    const newMultiplier = checked ? streakMultiplier : '2'
    const newThreshErr = checked ? streakThresholdError : null
    const newMultiplierErr = checked ? streakMultiplierError : null
    if (!checked) {
      setStreakThreshold('3')
      setStreakMultiplier('2')
      setStreakThresholdError(null)
      setStreakMultiplierError(null)
    }
    buildAndReport({
      streakEnabled: checked,
      streakThreshold: newThreshold,
      streakMultiplier: newMultiplier,
      streakThresholdError: newThreshErr,
      streakMultiplierError: newMultiplierErr,
    })
  }

  function handleStreakThresholdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const filtered = filterInt(e.target.value)
    setStreakThreshold(filtered)
    if (streakThresholdError !== null) {
      const err = validateStreakThreshold(filtered)
      setStreakThresholdError(err)
      buildAndReport({ streakThreshold: filtered, streakThresholdError: err })
    } else {
      buildAndReport({ streakThreshold: filtered })
    }
  }

  function handleStreakThresholdBlur() {
    const err = validateStreakThreshold(streakThreshold)
    setStreakThresholdError(err)
    buildAndReport({ streakThresholdError: err })
  }

  function handleStreakMultiplierChange(e: React.ChangeEvent<HTMLInputElement>) {
    const filtered = filterInt(e.target.value)
    setStreakMultiplier(filtered)
    if (streakMultiplierError !== null) {
      const err = validateStreakMultiplier(filtered)
      setStreakMultiplierError(err)
      buildAndReport({ streakMultiplier: filtered, streakMultiplierError: err })
    } else {
      buildAndReport({ streakMultiplier: filtered })
    }
  }

  function handleStreakMultiplierBlur() {
    const err = validateStreakMultiplier(streakMultiplier)
    setStreakMultiplierError(err)
    buildAndReport({ streakMultiplierError: err })
  }

  // ─── Penalty Doubler handler ──────────────────────────────────────────────

  function handlePenaltyToggle(checked: boolean) {
    setPenaltyEnabled(checked)
    buildAndReport({ penaltyEnabled: checked })
  }

  // ─── Timer Duration handlers ──────────────────────────────────────────────

  function handleTimerDurationChange(e: React.ChangeEvent<HTMLInputElement>) {
    const filtered = filterInt(e.target.value)
    setTimerDuration(filtered)
    if (timerDurationError !== null) {
      const err = validateTimerDuration(filtered)
      setTimerDurationError(err)
      buildAndReport({ timerDuration: filtered, timerDurationError: err })
    } else {
      buildAndReport({ timerDuration: filtered })
    }
  }

  function handleTimerDurationBlur() {
    const err = validateTimerDuration(timerDuration)
    setTimerDurationError(err)
    buildAndReport({ timerDurationError: err })
  }

  // ─── Summary strip ────────────────────────────────────────────────────────

  const anyEnabled = wageringEnabled || rulesEnabled || timedEnabled

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="gsp-container">
      <h2 className="gsp-title">Game Settings</h2>

      {/* ── Wagering Mode ── */}
      <div className="gsp-section">
        <label className="gsp-toggle-row">
          <input
            type="checkbox"
            className="gsp-toggle-checkbox"
            checked={wageringEnabled}
            onChange={e => handleWageringToggle(e.target.checked)}
            aria-label="Enable Wagering Mode"
          />
          <span className="gsp-toggle-track" aria-hidden="true">
            <span className="gsp-toggle-thumb" />
          </span>
          <span className="gsp-toggle-label">Wagering Mode</span>
        </label>

        {wageringEnabled && (
          <div className="gsp-subsection">
            <div className="gsp-field">
              <label htmlFor="gsp-wager-floor" className="gsp-field-label">
                Minimum wager
              </label>
              <div className="gsp-input-wrapper">
                <span className="gsp-input-prefix">$</span>
                <input
                  id="gsp-wager-floor"
                  type="text"
                  inputMode="numeric"
                  className={`gsp-input gsp-input-with-prefix${wagerFloorError ? ' gsp-input-error' : ''}`}
                  value={wagerFloor}
                  onChange={handleWagerFloorChange}
                  onBlur={handleWagerFloorBlur}
                  aria-describedby={wagerFloorError ? 'gsp-wager-floor-error' : undefined}
                  aria-invalid={!!wagerFloorError}
                />
              </div>
              {wagerFloorError && (
                <p id="gsp-wager-floor-error" className="gsp-error" role="alert">
                  {wagerFloorError}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Rules Engine ── */}
      <div className="gsp-section">
        <label className="gsp-toggle-row">
          <input
            type="checkbox"
            className="gsp-toggle-checkbox"
            checked={rulesEnabled}
            onChange={e => handleRulesToggle(e.target.checked)}
            aria-label="Enable Rules Engine"
          />
          <span className="gsp-toggle-track" aria-hidden="true">
            <span className="gsp-toggle-thumb" />
          </span>
          <span className="gsp-toggle-label">Rules Engine</span>
        </label>

        {rulesEnabled && (
          <div className="gsp-subsection">

            {/* Steal Bonus */}
            <div className="gsp-modifier-section">
              <label className="gsp-modifier-toggle-row">
                <input
                  type="checkbox"
                  className="gsp-toggle-checkbox"
                  checked={stealBonusEnabled}
                  onChange={e => handleStealBonusToggle(e.target.checked)}
                  aria-label="Enable Steal Bonus modifier"
                />
                <span className="gsp-toggle-track gsp-toggle-track-sm" aria-hidden="true">
                  <span className="gsp-toggle-thumb" />
                </span>
                <span className="gsp-modifier-label">Steal Bonus</span>
              </label>

              {stealBonusEnabled && (
                <div className="gsp-subsection gsp-field-indent">
                  <div className="gsp-field">
                    <label htmlFor="gsp-steal-bonus" className="gsp-field-label">
                      Steal bonus points
                    </label>
                    <div className="gsp-input-wrapper">
                      <span className="gsp-input-prefix">$</span>
                      <input
                        id="gsp-steal-bonus"
                        type="text"
                        inputMode="numeric"
                        className={`gsp-input gsp-input-with-prefix${stealBonusError ? ' gsp-input-error' : ''}`}
                        value={stealBonusPoints}
                        onChange={handleStealBonusChange}
                        onBlur={handleStealBonusBlur}
                        aria-describedby={stealBonusError ? 'gsp-steal-bonus-error' : undefined}
                        aria-invalid={!!stealBonusError}
                      />
                    </div>
                    {stealBonusError && (
                      <p id="gsp-steal-bonus-error" className="gsp-error" role="alert">
                        {stealBonusError}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Streak Multiplier */}
            <div className="gsp-modifier-section">
              <label className="gsp-modifier-toggle-row">
                <input
                  type="checkbox"
                  className="gsp-toggle-checkbox"
                  checked={streakEnabled}
                  onChange={e => handleStreakToggle(e.target.checked)}
                  aria-label="Enable Streak Multiplier modifier"
                />
                <span className="gsp-toggle-track gsp-toggle-track-sm" aria-hidden="true">
                  <span className="gsp-toggle-thumb" />
                </span>
                <span className="gsp-modifier-label">Streak Multiplier</span>
              </label>

              {streakEnabled && (
                <div className="gsp-subsection gsp-field-indent">
                  <div className="gsp-field-group">
                    <div className="gsp-field">
                      <label htmlFor="gsp-streak-threshold" className="gsp-field-label">
                        Streak length
                      </label>
                      <input
                        id="gsp-streak-threshold"
                        type="text"
                        inputMode="numeric"
                        className={`gsp-input gsp-input-sm${streakThresholdError ? ' gsp-input-error' : ''}`}
                        value={streakThreshold}
                        onChange={handleStreakThresholdChange}
                        onBlur={handleStreakThresholdBlur}
                        aria-describedby={streakThresholdError ? 'gsp-streak-threshold-error' : undefined}
                        aria-invalid={!!streakThresholdError}
                      />
                      {streakThresholdError && (
                        <p id="gsp-streak-threshold-error" className="gsp-error" role="alert">
                          {streakThresholdError}
                        </p>
                      )}
                    </div>

                    <div className="gsp-field">
                      <label htmlFor="gsp-streak-multiplier" className="gsp-field-label">
                        Multiplier
                      </label>
                      <input
                        id="gsp-streak-multiplier"
                        type="text"
                        inputMode="numeric"
                        className={`gsp-input gsp-input-sm${streakMultiplierError ? ' gsp-input-error' : ''}`}
                        value={streakMultiplier}
                        onChange={handleStreakMultiplierChange}
                        onBlur={handleStreakMultiplierBlur}
                        aria-describedby={streakMultiplierError ? 'gsp-streak-multiplier-error' : undefined}
                        aria-invalid={!!streakMultiplierError}
                      />
                      {streakMultiplierError && (
                        <p id="gsp-streak-multiplier-error" className="gsp-error" role="alert">
                          {streakMultiplierError}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Penalty Doubler */}
            <div className="gsp-modifier-section">
              <label className="gsp-modifier-toggle-row">
                <input
                  type="checkbox"
                  className="gsp-toggle-checkbox"
                  checked={penaltyEnabled}
                  onChange={e => handlePenaltyToggle(e.target.checked)}
                  aria-label="Enable Penalty Doubler modifier"
                />
                <span className="gsp-toggle-track gsp-toggle-track-sm" aria-hidden="true">
                  <span className="gsp-toggle-thumb" />
                </span>
                <span className="gsp-modifier-label">Penalty Doubler</span>
              </label>

              {penaltyEnabled && (
                <p className="gsp-penalty-description gsp-field-indent">
                  Incorrect answers are penalized at double the point value.
                </p>
              )}
            </div>

          </div>
        )}
      </div>

      {/* ── Timed Clue Responses ── */}
      <div className="gsp-section">
        <label className="gsp-toggle-row">
          <input
            type="checkbox"
            className="gsp-toggle-checkbox"
            checked={timedEnabled}
            onChange={e => handleTimedToggle(e.target.checked)}
            aria-label="Enable Timed Clue Responses"
          />
          <span className="gsp-toggle-track" aria-hidden="true">
            <span className="gsp-toggle-thumb" />
          </span>
          <span className="gsp-toggle-label">Timed Clue Responses</span>
        </label>

        {timedEnabled && (
          <div className="gsp-subsection">
            <div className="gsp-field">
              <label htmlFor="gsp-timer-duration" className="gsp-field-label">
                Seconds per clue
              </label>
              <input
                id="gsp-timer-duration"
                type="text"
                inputMode="numeric"
                className={`gsp-input${timerDurationError ? ' gsp-input-error' : ''}`}
                value={timerDuration}
                onChange={handleTimerDurationChange}
                onBlur={handleTimerDurationBlur}
                aria-describedby={timerDurationError ? 'gsp-timer-duration-error' : undefined}
                aria-invalid={!!timerDurationError}
              />
              {timerDurationError && (
                <p id="gsp-timer-duration-error" className="gsp-error" role="alert">
                  {timerDurationError}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Settings Summary ── */}
      {anyEnabled && (
        <div className="gsp-summary">
          <p className="gsp-summary-title">Active settings</p>
          <ul className="gsp-summary-list">
            {wageringEnabled && (
              <li className="gsp-summary-item">
                Minimum wager: {wagerFloor || '100'} pts
              </li>
            )}
            {rulesEnabled && stealBonusEnabled && (
              <li className="gsp-summary-item">
                Steal Bonus: +{stealBonusPoints || '200'} pts
              </li>
            )}
            {rulesEnabled && streakEnabled && (
              <li className="gsp-summary-item">
                Streak ×{streakMultiplier || '2'} at {streakThreshold || '3'}
              </li>
            )}
            {rulesEnabled && penaltyEnabled && (
              <li className="gsp-summary-item">
                Penalty Doubler active
              </li>
            )}
            {timedEnabled && (
              <li className="gsp-summary-item">
                Timed: {timerDuration || '30'}s per clue
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
