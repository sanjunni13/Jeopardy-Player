import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { validateYouTubeUrl } from './builderValidation'

// ─── Helper Generators ─────────────────────────────────────────────────────

// Valid YouTube video ID characters: word chars and hyphens ([\w-]+)
const youtubeIdChar = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'.split('')
)
const youtubeVideoId = fc.array(youtubeIdChar, { minLength: 1, maxLength: 20 }).map(chars => chars.join(''))

// Optional protocol prefix
const protocolPrefix = fc.constantFrom('', 'http://', 'https://')

// Optional www prefix
const wwwPrefix = fc.constantFrom('', 'www.')

// YouTube URL path patterns
const watchPath = youtubeVideoId.map(id => `youtube.com/watch?v=${id}`)
const embedPath = youtubeVideoId.map(id => `youtube.com/embed/${id}`)
const shortPath = youtubeVideoId.map(id => `youtu.be/${id}`)

// Generator for valid YouTube URLs combining protocol + www + path
const validYouTubeUrl = fc.oneof(
  fc.tuple(protocolPrefix, wwwPrefix, watchPath).map(([proto, www, path]) => `${proto}${www}${path}`),
  fc.tuple(protocolPrefix, wwwPrefix, embedPath).map(([proto, www, path]) => `${proto}${www}${path}`),
  fc.tuple(protocolPrefix, wwwPrefix, shortPath).map(([proto, www, path]) => `${proto}${www}${path}`)
)

// Generator for strings that do NOT match YouTube patterns
const nonYouTubeString = fc.string({ minLength: 0, maxLength: 200 }).filter(s => {
  // Filter out strings that accidentally match the YouTube regex
  const regex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)[\w-]+/
  return !regex.test(s)
})

// ─── Property Tests ────────────────────────────────────────────────────────

// Feature: board-style-game-editor, Property 13: YouTube URL validation
describe('Property 13: YouTube URL validation', () => {
  /**
   * **Validates: Requirements 12.5**
   *
   * For any string matching recognized YouTube URL patterns
   * (youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID),
   * validateYouTubeUrl SHALL return true.
   * For any string not matching these patterns, it SHALL return false.
   */

  it('returns true for valid youtube.com/watch?v=ID URLs', () => {
    fc.assert(
      fc.property(
        fc.tuple(protocolPrefix, wwwPrefix, youtubeVideoId),
        ([proto, www, id]) => {
          const url = `${proto}${www}youtube.com/watch?v=${id}`
          expect(validateYouTubeUrl(url)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns true for valid youtube.com/embed/ID URLs', () => {
    fc.assert(
      fc.property(
        fc.tuple(protocolPrefix, wwwPrefix, youtubeVideoId),
        ([proto, www, id]) => {
          const url = `${proto}${www}youtube.com/embed/${id}`
          expect(validateYouTubeUrl(url)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns true for valid youtu.be/ID URLs', () => {
    fc.assert(
      fc.property(
        fc.tuple(protocolPrefix, wwwPrefix, youtubeVideoId),
        ([proto, www, id]) => {
          const url = `${proto}${www}youtu.be/${id}`
          expect(validateYouTubeUrl(url)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns true for all valid YouTube URL patterns combined', () => {
    fc.assert(
      fc.property(validYouTubeUrl, (url) => {
        expect(validateYouTubeUrl(url)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it('returns false for random strings that do not match YouTube patterns', () => {
    fc.assert(
      fc.property(nonYouTubeString, (str) => {
        expect(validateYouTubeUrl(str)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it('returns false for empty string', () => {
    expect(validateYouTubeUrl('')).toBe(false)
  })

  it('returns false for partial matches without a video ID', () => {
    const partialUrls = [
      'youtube.com/watch?v=',
      'youtube.com/embed/',
      'youtu.be/',
      'https://youtube.com/watch?v=',
      'https://www.youtube.com/embed/',
      'https://youtu.be/',
    ]
    for (const url of partialUrls) {
      expect(validateYouTubeUrl(url)).toBe(false)
    }
  })

  it('returns false for other video platforms or unrelated URLs', () => {
    const nonYouTubeUrls = [
      'https://vimeo.com/123456',
      'https://dailymotion.com/video/x123',
      'https://www.google.com',
      'https://facebook.com/watch?v=abc123',
      'random text string',
      'youtube.com',
      'youtu.be',
      'https://youtube.com/playlist?list=abc123',
    ]
    for (const url of nonYouTubeUrls) {
      expect(validateYouTubeUrl(url)).toBe(false)
    }
  })
})
