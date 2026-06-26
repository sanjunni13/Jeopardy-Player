import { useState } from 'react'
import { usePreferences } from '../../../hooks/usePreferences'
import { ToggleSwitch } from '../../../components/ToggleSwitch'
import { RoundsSelector } from '../../../components/RoundsSelector'
import { writePreferences } from '../../../utils/preferencesStore'
import './PreferencesSection.css'

export function PreferencesSection() {
  const { preferences, setTheme, setReducedAnimations, setDefaultRounds } =
    usePreferences()

  const [animationsWarning, setAnimationsWarning] = useState<string | null>(null)
  const [roundsError, setRoundsError] = useState<string | null>(null)

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
    </section>
  )
}
