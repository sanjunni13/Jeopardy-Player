import { createContext } from 'react'
import type { AppPreferences, ThemeMode } from '../utils/preferencesStore'

export interface PreferencesContextValue {
  preferences: AppPreferences
  setTheme: (mode: ThemeMode) => void
  setReducedAnimations: (enabled: boolean) => void
  setDefaultRounds: (rounds: number) => void
  setDefaultTimerDuration: (duration: number | undefined) => void
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null)
