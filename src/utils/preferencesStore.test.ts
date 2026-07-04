import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  readPreferences,
  writePreferences,
  isValidPreferences,
  PREFERENCES_KEY,
  DEFAULT_PREFERENCES,
} from './preferencesStore'

// ─── localStorage Mock ──────────────────────────────────────────────────────

let store: Record<string, string> = {}

const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value }),
  removeItem: vi.fn((key: string) => { delete store[key] }),
  clear: vi.fn(() => { store = {} }),
  get length() { return Object.keys(store).length },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
}

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', localStorageMock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── isValidPreferences ─────────────────────────────────────────────────────

describe('isValidPreferences', () => {
  it('returns true for a valid preferences object', () => {
    expect(isValidPreferences({ theme: 'dark', reducedAnimations: false, defaultRounds: 2 })).toBe(true)
    expect(isValidPreferences({ theme: 'light', reducedAnimations: true, defaultRounds: 5 })).toBe(true)
    expect(isValidPreferences({ theme: 'dark', reducedAnimations: true, defaultRounds: 1 })).toBe(true)
  })

  it('returns false for null and non-objects', () => {
    expect(isValidPreferences(null)).toBe(false)
    expect(isValidPreferences(undefined)).toBe(false)
    expect(isValidPreferences(42)).toBe(false)
    expect(isValidPreferences('string')).toBe(false)
    expect(isValidPreferences([])).toBe(false)
  })

  it('returns false for invalid theme values', () => {
    expect(isValidPreferences({ theme: 'blue', reducedAnimations: false, defaultRounds: 2 })).toBe(false)
    expect(isValidPreferences({ theme: 123, reducedAnimations: false, defaultRounds: 2 })).toBe(false)
    expect(isValidPreferences({ theme: null, reducedAnimations: false, defaultRounds: 2 })).toBe(false)
  })

  it('returns false for invalid reducedAnimations values', () => {
    expect(isValidPreferences({ theme: 'dark', reducedAnimations: 'yes', defaultRounds: 2 })).toBe(false)
    expect(isValidPreferences({ theme: 'dark', reducedAnimations: 0, defaultRounds: 2 })).toBe(false)
    expect(isValidPreferences({ theme: 'dark', reducedAnimations: null, defaultRounds: 2 })).toBe(false)
  })

  it('returns false for invalid defaultRounds values', () => {
    expect(isValidPreferences({ theme: 'dark', reducedAnimations: false, defaultRounds: 0 })).toBe(false)
    expect(isValidPreferences({ theme: 'dark', reducedAnimations: false, defaultRounds: 6 })).toBe(false)
    expect(isValidPreferences({ theme: 'dark', reducedAnimations: false, defaultRounds: 2.5 })).toBe(false)
    expect(isValidPreferences({ theme: 'dark', reducedAnimations: false, defaultRounds: -1 })).toBe(false)
    expect(isValidPreferences({ theme: 'dark', reducedAnimations: false, defaultRounds: 'two' })).toBe(false)
  })

  it('returns false when fields are missing', () => {
    expect(isValidPreferences({ theme: 'dark', reducedAnimations: false })).toBe(false)
    expect(isValidPreferences({ theme: 'dark', defaultRounds: 2 })).toBe(false)
    expect(isValidPreferences({ reducedAnimations: false, defaultRounds: 2 })).toBe(false)
    expect(isValidPreferences({})).toBe(false)
  })
})

// ─── readPreferences ────────────────────────────────────────────────────────

describe('readPreferences', () => {
  it('returns defaults when localStorage has no entry', () => {
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('returns defaults for empty string', () => {
    store[PREFERENCES_KEY] = ''
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('returns defaults for malformed JSON', () => {
    store[PREFERENCES_KEY] = '{not valid json'
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('returns defaults for non-object JSON (number)', () => {
    store[PREFERENCES_KEY] = '42'
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('returns defaults for non-object JSON (array)', () => {
    store[PREFERENCES_KEY] = '[1, 2, 3]'
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('returns defaults for null JSON', () => {
    store[PREFERENCES_KEY] = 'null'
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('returns stored valid preferences', () => {
    const prefs = { theme: 'light', reducedAnimations: true, defaultRounds: 4 }
    store[PREFERENCES_KEY] = JSON.stringify(prefs)
    expect(readPreferences()).toEqual(prefs)
  })

  it('falls back individual invalid fields to defaults', () => {
    store[PREFERENCES_KEY] = JSON.stringify({
      theme: 'blue',
      reducedAnimations: 'yes',
      defaultRounds: 10,
    })
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('preserves valid fields while falling back invalid ones', () => {
    store[PREFERENCES_KEY] = JSON.stringify({
      theme: 'light',
      reducedAnimations: 'not-boolean',
      defaultRounds: 3,
    })
    expect(readPreferences()).toEqual({
      theme: 'light',
      reducedAnimations: false,
      defaultRounds: 3,
    })
  })

  it('handles partial objects (missing fields fall back to defaults)', () => {
    store[PREFERENCES_KEY] = JSON.stringify({ theme: 'light' })
    expect(readPreferences()).toEqual({
      theme: 'light',
      reducedAnimations: false,
      defaultRounds: 2,
    })
  })

  it('falls back defaultRounds for floats', () => {
    store[PREFERENCES_KEY] = JSON.stringify({
      theme: 'dark',
      reducedAnimations: false,
      defaultRounds: 2.7,
    })
    expect(readPreferences()).toEqual({
      theme: 'dark',
      reducedAnimations: false,
      defaultRounds: 2,
    })
  })

  it('reads a valid defaultTimerDuration', () => {
    store[PREFERENCES_KEY] = JSON.stringify({
      theme: 'dark',
      reducedAnimations: false,
      defaultRounds: 2,
      defaultTimerDuration: 45,
    })
    expect(readPreferences()).toEqual({
      theme: 'dark',
      reducedAnimations: false,
      defaultRounds: 2,
      defaultTimerDuration: 45,
    })
  })

  it('returns undefined defaultTimerDuration when the field is absent', () => {
    store[PREFERENCES_KEY] = JSON.stringify({
      theme: 'dark',
      reducedAnimations: false,
      defaultRounds: 2,
    })
    const result = readPreferences()
    expect(result.defaultTimerDuration).toBeUndefined()
  })

  it('falls back defaultTimerDuration to undefined for value below 5', () => {
    store[PREFERENCES_KEY] = JSON.stringify({
      theme: 'dark',
      reducedAnimations: false,
      defaultRounds: 2,
      defaultTimerDuration: 4,
    })
    const result = readPreferences()
    expect(result.defaultTimerDuration).toBeUndefined()
  })

  it('falls back defaultTimerDuration to undefined for value above 120', () => {
    store[PREFERENCES_KEY] = JSON.stringify({
      theme: 'dark',
      reducedAnimations: false,
      defaultRounds: 2,
      defaultTimerDuration: 121,
    })
    const result = readPreferences()
    expect(result.defaultTimerDuration).toBeUndefined()
  })

  it('falls back defaultTimerDuration to undefined for a float', () => {
    store[PREFERENCES_KEY] = JSON.stringify({
      theme: 'dark',
      reducedAnimations: false,
      defaultRounds: 2,
      defaultTimerDuration: 30.5,
    })
    const result = readPreferences()
    expect(result.defaultTimerDuration).toBeUndefined()
  })

  it('accepts boundary values 5 and 120 for defaultTimerDuration', () => {
    store[PREFERENCES_KEY] = JSON.stringify({
      theme: 'dark',
      reducedAnimations: false,
      defaultRounds: 2,
      defaultTimerDuration: 5,
    })
    expect(readPreferences().defaultTimerDuration).toBe(5)

    store[PREFERENCES_KEY] = JSON.stringify({
      theme: 'dark',
      reducedAnimations: false,
      defaultRounds: 2,
      defaultTimerDuration: 120,
    })
    expect(readPreferences().defaultTimerDuration).toBe(120)
  })
})

// ─── writePreferences ───────────────────────────────────────────────────────

describe('writePreferences', () => {
  it('writes valid preferences to localStorage and returns true', () => {
    const prefs = { theme: 'light' as const, reducedAnimations: true, defaultRounds: 3 }
    const result = writePreferences(prefs)
    expect(result).toBe(true)
    expect(store[PREFERENCES_KEY]).toBe(JSON.stringify(prefs))
  })

  it('returns false when localStorage throws', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })
    const prefs = { theme: 'dark' as const, reducedAnimations: false, defaultRounds: 2 }
    const result = writePreferences(prefs)
    expect(result).toBe(false)
  })

  it('overwrites existing preferences atomically', () => {
    store[PREFERENCES_KEY] = JSON.stringify({ theme: 'light', reducedAnimations: true, defaultRounds: 5 })
    const newPrefs = { theme: 'dark' as const, reducedAnimations: false, defaultRounds: 1 }
    writePreferences(newPrefs)
    expect(store[PREFERENCES_KEY]).toBe(JSON.stringify(newPrefs))
  })

  it('persists defaultTimerDuration when present', () => {
    const prefs = { theme: 'dark' as const, reducedAnimations: false, defaultRounds: 2, defaultTimerDuration: 60 }
    writePreferences(prefs)
    const stored = JSON.parse(store[PREFERENCES_KEY])
    expect(stored.defaultTimerDuration).toBe(60)
  })

  it('omits defaultTimerDuration from stored JSON when not set', () => {
    const prefs = { theme: 'dark' as const, reducedAnimations: false, defaultRounds: 2 }
    writePreferences(prefs)
    const stored = JSON.parse(store[PREFERENCES_KEY])
    expect(stored.defaultTimerDuration).toBeUndefined()
  })
})
