import { useState } from 'react'
import { usePreferences } from '../../../hooks/usePreferences'
import { ToggleSwitch } from '../../../components/ToggleSwitch'
import { RoundsSelector } from '../../../components/RoundsSelector'
import { writePreferences } from '../../../utils/preferencesStore'
import './PreferencesSection.css'

export function PreferencesSection() {
  const { preferences, setTheme, setReducedAnimations, setDefaultRounds, setDefaultTimerDuration } =
    usePreferences()

  const [animationsWarning, setAnimationsWarning] = useState<string | null>(null)
  const [roundsError, setRoundsError] = useState<string | null>(null)
  const [timerValue, setTimerValue] = useState<string>(() =>
    preferences.defaultTimerDuration !== undefined
      ? String(preferences.defaultTimerDuration)
      : ''
  )
  const [timerError, setTimerError] = useState<string | null>(null)

  function handleThemeChange(checked: boolean) {
    setTheme(checked ? 'dark' : 'light')
  }

  function handleReducedAnimationsChange(checked: boolean) {
    // Attempt persist check: build next state and try writing
    const nextPrefs = { ...preferences, reducedAnimations: checked }
    const success = writePreferences(nextPrefs)

    setReducedAnimations(checked)

    if (!success) {
      setAnimationsWarning(
        'Preference may not be retained after the browser is closed.'
      )
    } else {
      setAnimationsWarning(null)
    }
  }

  function handleDefaultRoundsChange(rounds: number) {
    const nextPrefs = { ...preferences, defaultRounds: rounds }
    const success = writePreferences(nextPrefs)

    if (!success) {
      setRoundsError('Failed to save preference. Please try again.')
    } else {
      setRoundsError(null)
      setDefaultRounds(rounds)
    }
  }

  function handleTimerDurationChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    // Filter non-digit characters
    const filtered = raw.replace(/\D/g, '')
    setTimerValue(filtered)
  }

  function handleTimerDurationBlur() {
    if (timerValue === '') {
      // Clear the stored value
      setTimerError(null)
      const nextPrefs = { ...preferences, defaultTimerDuration: undefined }
      const success = writePreferences(nextPrefs)
      if (success) {
        setDefaultTimerDuration(undefined)
      }
      return
    }

    const num = Number(timerValue)
    if (!Number.isInteger(num) || num < 5 || num > 120) {
      setTimerError('Value must be a whole number between 5 and 120.')
      return
    }

    setTimerError(null)
    const nextPrefs = { ...preferences, defaultTimerDuration: num }
    const success = writePreferences(nextPrefs)

    if (!success) {
      setTimerError('Failed to save preference. Please try again.')
    } else {
      setDefaultTimerDuration(num)
    }
  }

  return (
    <section className="preferences-section" aria-labelledby="preferences-heading">
      <h2 id="preferences-heading" className="preferences-section__heading">
        App Preferences
      </h2>

      <div className="preferences-section__item">
        <ToggleSwitch
          id="theme-toggle"
          label="Dark Mode"
          checked={preferences.theme === 'dark'}
          onChange={handleThemeChange}
        />
        <p className="preferences-section__description">
          Switch between light and dark color themes.
        </p>
      </div>

      <div className="preferences-section__item">
        <ToggleSwitch
          id="reduced-animations-toggle"
          label="Reduce Animations"
          checked={preferences.reducedAnimations}
          onChange={handleReducedAnimationsChange}
        />
        <p className="preferences-section__description">
          Disable scale and fade transitions throughout the app.
        </p>
        {animationsWarning && (
          <p className="preferences-section__warning" role="alert">
            {animationsWarning}
          </p>
        )}
      </div>

      <div className="preferences-section__item">
        <div className="preferences-section__rounds-row">
          <span className="preferences-section__label">Default Rounds</span>
          <RoundsSelector
            value={preferences.defaultRounds}
            onChange={handleDefaultRoundsChange}
          />
        </div>
        <p className="preferences-section__description">
          Pre-fill the number of rounds when generating a new game.
        </p>
        {roundsError && (
          <p className="preferences-section__error" role="alert">
            {roundsError}
          </p>
        )}
      </div>

      <div className="preferences-section__item">
        <div className="preferences-section__rounds-row">
          <label
            htmlFor="default-timer-duration"
            className="preferences-section__label"
          >
            Default clue timer (seconds)
          </label>
          <input
            id="default-timer-duration"
            type="text"
            inputMode="numeric"
            placeholder="30"
            value={timerValue}
            onChange={handleTimerDurationChange}
            onBlur={handleTimerDurationBlur}
            className={`preferences-section__timer-input${timerError ? ' preferences-section__timer-input--error' : ''}`}
          />
        </div>
        <p className="preferences-section__description">
          Pre-fill the timer duration when enabling Timed Clue Responses.
        </p>
        {timerError && (
          <p className="preferences-section__error" role="alert">
            {timerError}
          </p>
        )}
      </div>
    </section>
  )
}
