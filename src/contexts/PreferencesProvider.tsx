import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PreferencesContext } from './PreferencesContext'
import type { AppPreferences, ThemeMode } from '../utils/preferencesStore'
import { readPreferences, writePreferences } from '../utils/preferencesStore'

interface PreferencesProviderProps {
  children: React.ReactNode
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Determines whether the .reduced-motion class should be applied on <html>.
 * Class is added if user toggled reduced animations ON, or if the OS
 * prefers-reduced-motion media query is set to 'reduce'.
 */
function shouldDisableAnimations(
  userPref: boolean,
  osReducedMotion: boolean
): boolean {
  return userPref || osReducedMotion
}

function applyTheme(theme: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', theme)
}

function applyReducedMotion(disable: boolean): void {
  if (disable) {
    document.documentElement.classList.add('reduced-motion')
  } else {
    document.documentElement.classList.remove('reduced-motion')
  }
}

export function PreferencesProvider({ children }: PreferencesProviderProps) {
  const [preferences, setPreferences] = useState<AppPreferences>(() => {
    const prefs = readPreferences()
    // Apply immediately during initial render to avoid flash
    applyTheme(prefs.theme)
    return prefs
  })

  // Track OS reduced motion preference
  const [osReducedMotion, setOsReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(REDUCED_MOTION_QUERY).matches
  })

  // Ref to track if component has mounted (for avoiding double-apply in strict mode)
  const mountedRef = useRef(false)

  // Listen for OS prefers-reduced-motion changes
  useEffect(() => {
    const mql = window.matchMedia(REDUCED_MOTION_QUERY)

    const handler = (event: MediaQueryListEvent) => {
      setOsReducedMotion(event.matches)
    }

    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // Apply reduced motion class whenever user pref or OS pref changes
  useEffect(() => {
    const disable = shouldDisableAnimations(
      preferences.reducedAnimations,
      osReducedMotion
    )
    applyReducedMotion(disable)
  }, [preferences.reducedAnimations, osReducedMotion])

  // Apply theme on mount and when it changes
  useEffect(() => {
    if (mountedRef.current) {
      applyTheme(preferences.theme)
    } else {
      mountedRef.current = true
    }
  }, [preferences.theme])

  const setTheme = useCallback((mode: ThemeMode) => {
    setPreferences((prev) => {
      const next: AppPreferences = { ...prev, theme: mode }
      // Apply immediately
      applyTheme(mode)
      // Persist - if it fails, still apply in-memory
      const success = writePreferences(next)
      if (!success) {
        console.warn(
          '[PreferencesProvider] Failed to persist theme preference to localStorage.'
        )
      }
      return next
    })
  }, [])

  const setReducedAnimations = useCallback(
    (enabled: boolean) => {
      setPreferences((prev) => {
        const next: AppPreferences = { ...prev, reducedAnimations: enabled }
        // Persist - if it fails, still apply in-memory but warn
        const success = writePreferences(next)
        if (!success) {
          console.warn(
            '[PreferencesProvider] Failed to persist reduced animations preference to localStorage. The preference may not be retained after the browser is closed.'
          )
        }
        return next
      })
    },
    []
  )

  const setDefaultRounds = useCallback((rounds: number) => {
    // Clamp to valid range [1, 5] and ensure integer
    const clamped = Math.max(1, Math.min(5, Math.round(rounds)))

    setPreferences((prev) => {
      const next: AppPreferences = { ...prev, defaultRounds: clamped }
      const success = writePreferences(next)
      if (!success) {
        console.warn(
          '[PreferencesProvider] Failed to persist default rounds preference to localStorage.'
        )
      }
      return next
    })
  }, [])

  const setDefaultTimerDuration = useCallback((duration: number | undefined) => {
    setPreferences((prev) => {
      const next: AppPreferences = { ...prev, defaultTimerDuration: duration }
      const success = writePreferences(next)
      if (!success) {
        console.warn(
          '[PreferencesProvider] Failed to persist default timer duration preference to localStorage.'
        )
      }
      return next
    })
  }, [])

  const contextValue = useMemo(
    () => ({
      preferences,
      setTheme,
      setReducedAnimations,
      setDefaultRounds,
      setDefaultTimerDuration,
    }),
    [preferences, setTheme, setReducedAnimations, setDefaultRounds, setDefaultTimerDuration]
  )

  return (
    <PreferencesContext.Provider value={contextValue}>
      {children}
    </PreferencesContext.Provider>
  )
}
