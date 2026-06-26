import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// Feature: user-profile-setup, Property 7: Storage migration path transformation

// ─── Function Under Test ──────────────────────────────────────────────────────

/**
 * Mimics the SQL migration path transformation logic from:
 * `supabase/migrations/20260618200000_rename_storage_paths_email_to_uuid.sql`
 *
 * The SQL performs:
 *   new_name := uuid_prefix || substring(obj.name FROM length(email_prefix) + 1);
 *
 * This is equivalent to replacing the email prefix with the auth UUID prefix,
 * preserving the filename and any subdirectory structure after the first segment.
 */
export function transformStoragePath(oldPath: string, email: string, authUuid: string): string {
  const emailPrefix = email + '/'
  if (!oldPath.startsWith(emailPrefix)) return oldPath
  return authUuid + '/' + oldPath.substring(emailPrefix.length)
}

// ─── Generators ───────────────────────────────────────────────────────────────

/** Generate a valid email address that doesn't contain slashes (real storage paths won't have slashes in emails) */
const emailArb = fc.emailAddress().filter((e) => !e.includes('/'))

/** Generate a valid UUID v4 (representing auth_uuid) */
const authUuidArb = fc.uuid()

/**
 * Generate a single filename-safe segment (alphanumeric, underscores, hyphens, dots).
 */
const filenameSafeChars = 'abcdefghijklmnopqrstuvwxyz0123456789_-.'
const filenameSegmentArb = fc
  .array(fc.constantFrom(...filenameSafeChars.split('')), { minLength: 1, maxLength: 30 })
  .map((chars) => chars.join(''))

/**
 * Generate a "rest of path" — one or more path segments representing
 * the filename and optional subdirectories after the email prefix.
 * Examples: "game.json", "drafts/abc.json", "subfolder/deep/file.json"
 */
const pathSegmentArb = fc
  .array(filenameSegmentArb, { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join('/'))

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 7: Storage migration path transformation', () => {
  /**
   * **Validates: Requirements 6.7**
   *
   * For any email string and corresponding Auth UUID, the migration path
   * transformation SHALL convert `{email}/{rest}` to `{auth_uuid}/{rest}`,
   * preserving the filename and any subdirectory structure after the first
   * path segment.
   */

  it('transforms {email}/{rest} to {authUuid}/{rest} for any email, UUID, and rest-of-path', () => {
    fc.assert(
      fc.property(emailArb, authUuidArb, pathSegmentArb, (email, authUuid, rest) => {
        const oldPath = `${email}/${rest}`
        const result = transformStoragePath(oldPath, email, authUuid)

        // The result must be {authUuid}/{rest}
        expect(result).toBe(`${authUuid}/${rest}`)
      }),
      { numRuns: 100 }
    )
  })

  it('preserves the filename and subdirectory structure after the first segment', () => {
    fc.assert(
      fc.property(emailArb, authUuidArb, pathSegmentArb, (email, authUuid, rest) => {
        const oldPath = `${email}/${rest}`
        const result = transformStoragePath(oldPath, email, authUuid)

        // Extract the portion after the email prefix in the old path
        const emailPrefix = email + '/'
        const oldRest = oldPath.substring(emailPrefix.length)

        // Extract the portion after the auth UUID prefix in the new path
        const uuidPrefix = authUuid + '/'
        const newRest = result.substring(uuidPrefix.length)

        // The rest-of-path must be identical (structure preserved)
        expect(newRest).toBe(oldRest)
        expect(newRest).toBe(rest)
      }),
      { numRuns: 100 }
    )
  })

  it('the result never contains the email in the folder prefix', () => {
    fc.assert(
      fc.property(emailArb, authUuidArb, pathSegmentArb, (email, authUuid, rest) => {
        const oldPath = `${email}/${rest}`
        const result = transformStoragePath(oldPath, email, authUuid)

        // The first path segment (folder prefix) must NOT be the email
        const folderPrefix = result.split('/')[0]
        expect(folderPrefix).not.toBe(email)

        // The result must not start with the email prefix
        expect(result.startsWith(email + '/')).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('round-trip: the new path first segment equals the auth UUID', () => {
    fc.assert(
      fc.property(emailArb, authUuidArb, pathSegmentArb, (email, authUuid, rest) => {
        const oldPath = `${email}/${rest}`
        const result = transformStoragePath(oldPath, email, authUuid)

        // The first segment of the transformed path must be the auth UUID
        const firstSegment = result.split('/')[0]
        expect(firstSegment).toBe(authUuid)
      }),
      { numRuns: 100 }
    )
  })

  it('returns the path unchanged if it does not start with the email prefix', () => {
    fc.assert(
      fc.property(authUuidArb, authUuidArb, pathSegmentArb, (otherPrefix, authUuid, rest) => {
        // Use a UUID as a non-email prefix to guarantee it won't match an email
        const oldPath = `${otherPrefix}/${rest}`
        const fakeEmail = 'nonmatching@example.com'

        const result = transformStoragePath(oldPath, fakeEmail, authUuid)

        // Path should be returned unchanged since it doesn't start with the email
        expect(result).toBe(oldPath)
      }),
      { numRuns: 100 }
    )
  })
})
