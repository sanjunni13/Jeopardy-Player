// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { generateSessionId, buildSessionLink } from './sessionIdGenerator'

// Feature: final-jeopardy-and-buzzer, Property 1: Session ID format and uniqueness

/**
 * **Validates: Requirements 1.1, 8.1**
 *
 * For any generated session ID, it SHALL be at least 22 characters long,
 * contain only URL-safe characters ([A-Za-z0-9_-]), and no two generated
 * IDs SHALL be equal.
 */
describe('Property 1: Session ID format and uniqueness', () => {
  it('every generated ID is at least 22 characters long', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const id = generateSessionId()
          expect(id.length).toBeGreaterThanOrEqual(22)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('every generated ID matches /^[A-Za-z0-9_-]+$/', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const id = generateSessionId()
          expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('no two generated IDs are equal', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const id1 = generateSessionId()
          const id2 = generateSessionId()
          expect(id1).not.toEqual(id2)
        }
      ),
      { numRuns: 100 }
    )
  })
})

// Feature: final-jeopardy-and-buzzer, Property 2: Session link URL construction

/**
 * **Validates: Requirements 1.3**
 *
 * For any valid session ID, the generated session link SHALL contain the
 * session ID as a path segment and match the format `{baseUrl}/play/{sessionId}`.
 */
describe('Property 2: Session link URL construction', () => {
  const mockOrigin = 'http://localhost:3000'

  beforeEach(() => {
    // Stub window.location.origin for the test environment
    Object.defineProperty(window, 'location', {
      value: { origin: mockOrigin },
      writable: true,
      configurable: true,
    })
  })

  it('the link ends with /play/{sessionId} for any valid session ID string', () => {
    // Generate arbitrary URL-safe session IDs (matching the format generateSessionId produces)
    const urlSafeChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
    const urlSafeString = fc
      .array(fc.constantFrom(...urlSafeChars.split('')), { minLength: 1, maxLength: 50 })
      .map(chars => chars.join(''))

    fc.assert(
      fc.property(urlSafeString, (sessionId) => {
        const link = buildSessionLink(sessionId)
        expect(link).toEqual(`${mockOrigin}/play/${sessionId}`)
        expect(link.endsWith(`/play/${sessionId}`)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('the link contains the exact session ID without encoding or mutation', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // Use a real generated session ID to validate no mutation occurs
        const sessionId = generateSessionId()
        const link = buildSessionLink(sessionId)

        // The session ID appears verbatim in the link
        expect(link).toContain(sessionId)

        // Extract the session ID from the path and verify it matches exactly
        const pathSegment = link.split('/play/')[1]
        expect(pathSegment).toEqual(sessionId)
      }),
      { numRuns: 100 }
    )
  })
})
