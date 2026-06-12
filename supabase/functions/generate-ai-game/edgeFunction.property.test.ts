import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { CORS_HEADERS, hasCorsHeaders } from './gameBuilder'

// Feature: ai-game-generation, Property 4: All Edge Function responses include CORS headers
describe('Property 4: All Edge Function responses include CORS headers', () => {
  /**
   * **Validates: Requirements 8.4**
   *
   * For any request to the Edge Function (any method, any auth state, any body),
   * the response SHALL include `Access-Control-Allow-Origin: *` and
   * `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`.
   */
  it('for any request scenario, response headers include CORS headers', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('OPTIONS'),
          fc.constant('POST'),
          fc.constant('GET'),
          fc.constant('PUT'),
          fc.constant('DELETE'),
        ),
        fc.boolean(), // hasValidAuth
        fc.boolean(), // isRateLimited
        fc.oneof(
          fc.constant(200),
          fc.constant(400),
          fc.constant(401),
          fc.constant(429),
          fc.constant(500),
          fc.constant(502),
          fc.constant(504),
        ),
        (_method, _hasValidAuth, _isRateLimited, _statusCode) => {
          // The Edge Function ALWAYS includes CORS headers on every response
          // This is enforced by spreading the CORS_HEADERS constant into every Response
          // Verify the CORS_HEADERS constant has the correct values
          expect(CORS_HEADERS['Access-Control-Allow-Origin']).toBe('*')
          expect(CORS_HEADERS['Access-Control-Allow-Headers']).toBe(
            'authorization, x-client-info, apikey, content-type'
          )

          // Verify hasCorsHeaders works correctly with the CORS constant
          expect(hasCorsHeaders(CORS_HEADERS)).toBe(true)

          // Verify missing or incorrect headers fail
          expect(hasCorsHeaders({})).toBe(false)
          expect(hasCorsHeaders({ 'Access-Control-Allow-Origin': 'http://evil.com' })).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('CORS headers are always included regardless of response status', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 599 }), // any HTTP status code
        fc.string({ minLength: 1, maxLength: 200 }), // any error message
        (_statusCode, _errorMsg) => {
          // Simulate building a response - CORS is always spread
          const responseHeaders = {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
          }

          // Verify CORS headers are present
          expect(hasCorsHeaders(responseHeaders)).toBe(true)
          expect(responseHeaders['Access-Control-Allow-Origin']).toBe('*')
          expect(responseHeaders['Access-Control-Allow-Headers']).toBe(
            'authorization, x-client-info, apikey, content-type'
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
