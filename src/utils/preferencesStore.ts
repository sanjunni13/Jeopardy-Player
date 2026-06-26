export type ThemeMode = 'light' | 'dark'

export interface AppPreferences {
  theme: ThemeMode
  reducedAnimations: boolean
  defaultRounds: number // 1-5
}

export const PREFERENCES_KEY = 'jeopardy-player-preferences'

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'dark',
  reducedAnimations: false,
  defaultRounds: 2,
}

/**
 * Type guard that validates whether an unknown value conforms to the AppPreferences interface.
 * Each field is validated independently against its allowed values.
 */
export function isValidPreferences(value: unknown): value is AppPreferences {
  if (typeof value !== 'object' || value === null) return false

  const obj = value as Record<string, unknown>

  if (obj.theme !== 'light' && obj.theme !== 'dark') return false
  if (typeof obj.reducedAnimations !== 'boolean') return false
  if (
    typeof obj.defaultRounds !== 'number' ||
    !Number.isInteger(obj.defaultRounds) ||
    obj.defaultRounds < 1 ||
    obj.defaultRounds > 5
  ) return false

  return true
}

/**
 * Reads preferences from localStorage with per-field validation.
 * Invalid or missing fields fall back to DEFAULT_PREFERENCES values.
 * Handles malformed JSON, partial objects, and empty strings gracefully.
 */
export function readPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY)
    if (raw === null || raw === '') return { ...DEFAULT_PREFERENCES }

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PREFERENCES }

    const obj = parsed as Record<string, unknown>

    const theme: ThemeMode =
      obj.theme === 'light' || obj.theme === 'dark'
        ? obj.theme
        : DEFAULT_PREFERENCES.theme

    const reducedAnimations: boolean =
      typeof obj.reducedAnimations === 'boolean'
        ? obj.reducedAnimations
        : DEFAULT_PREFERENCES.reducedAnimations

    const defaultRounds: number =
      typeof obj.defaultRounds === 'number' &&
      Number.isInteger(obj.defaultRounds) &&
      obj.defaultRounds >= 1 &&
      obj.defaultRounds <= 5
        ? obj.defaultRounds
        : DEFAULT_PREFERENCES.defaultRounds

    return { theme, reducedAnimations, defaultRounds }
  } catch {
    // Malformed JSON or any other error
    return { ...DEFAULT_PREFERENCES }
  }
}

/**
 * Writes preferences to localStorage atomically (overwrites entire object).
 * Returns true on success, false if localStorage is unavailable or the write fails.
 */
export function writePreferences(prefs: AppPreferences): boolean {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs))
    return true
  } catch {
    return false
  }
}
