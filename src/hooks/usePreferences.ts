import { useContext } from 'react'
import { PreferencesContext } from '../contexts/PreferencesContext'
import type { PreferencesContextValue } from '../contexts/PreferencesContext'

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext)
  if (context === null) {
    throw new Error('usePreferences must be used within a PreferencesProvider')
  }
  return context
}
