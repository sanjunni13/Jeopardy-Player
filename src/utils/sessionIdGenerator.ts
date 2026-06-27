/**
 * Session ID generation utilities for the game session system.
 * Produces cryptographically secure, URL-safe session identifiers.
 */

/**
 * Generates a cryptographically secure session ID using base64url encoding.
 * Produces a 22-character URL-safe string from 16 random bytes.
 *
 * Characters used: [A-Za-z0-9_-] (base64url alphabet without padding)
 */
export function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Base64url encoding produces 22 chars from 16 bytes
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Constructs the full session link URL for a given session ID.
 * Uses window.location.origin as the base so it works across environments.
 *
 * @param sessionId - The session ID to include in the URL path
 * @returns The full URL in the format `{origin}/play/{sessionId}`
 */
export function buildSessionLink(sessionId: string): string {
  return `${window.location.origin}/play/${sessionId}`;
}
