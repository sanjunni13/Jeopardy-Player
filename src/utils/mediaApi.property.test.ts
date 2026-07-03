import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { validateMediaFile, validateYouTubeUrl } from './mediaApi'

// ─── Constants (mirrored from mediaApi.ts for oracle comparison) ─────────────

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const AUDIO_EXTENSIONS = ['.mp3']
const IMAGE_MAX_SIZE = 5_242_880 // 5 MB
const AUDIO_MAX_SIZE = 10_485_760 // 10 MB

const YOUTUBE_PATTERN = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be)\/.+/

// ─── Generators ─────────────────────────────────────────────────────────────

/** Generate a valid image extension */
const imageExtArb = fc.constantFrom(...IMAGE_EXTENSIONS)

/** Generate a valid audio extension */
const audioExtArb = fc.constantFrom(...AUDIO_EXTENSIONS)

/** Generate an invalid extension (not in image or audio sets) */
const invalidExtArb = fc.constantFrom('.txt', '.pdf', '.mp4', '.doc', '.exe', '.wav', '.ogg', '.bmp')

/** Generate a file name base (alphanumeric, 1-20 chars) */
const fileNameBaseArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/)

/** Generate a file size within valid range for images (0 to IMAGE_MAX_SIZE) */
const validImageSizeArb = fc.integer({ min: 0, max: IMAGE_MAX_SIZE })

/** Generate a file size exceeding image limit */
const oversizedImageSizeArb = fc.integer({ min: IMAGE_MAX_SIZE + 1, max: IMAGE_MAX_SIZE * 3 })

/** Generate a file size within valid range for audio (0 to AUDIO_MAX_SIZE) */
const validAudioSizeArb = fc.integer({ min: 0, max: AUDIO_MAX_SIZE })

/** Generate a file size exceeding audio limit */
const oversizedAudioSizeArb = fc.integer({ min: AUDIO_MAX_SIZE + 1, max: AUDIO_MAX_SIZE * 3 })

/** Generate any file size (for general property testing) */
const anySizeArb = fc.integer({ min: 0, max: AUDIO_MAX_SIZE * 3 })

/** Generate any extension (valid or invalid) */
const anyExtArb = fc.oneof(imageExtArb, audioExtArb, invalidExtArb)

/** Helper: create a mock File object */
function createMockFile(name: string, size: number): File {
  // Create content of approximately the right size
  const content = new Uint8Array(size)
  return new File([content], name, { type: 'application/octet-stream' })
}

// ─── Property 5: Media file validation ──────────────────────────────────────

describe('Property 5: Media file validation', () => {
  /**
   * **Validates: Requirements 7.2, 7.3, 7.5**
   *
   * For any file with a given name (extension) and size in bytes,
   * `validateMediaFile` SHALL return valid if and only if:
   * (a) the file extension is one of .jpg, .jpeg, .png, .gif, .webp
   *     and the size is ≤ 5,242,880 bytes, OR
   * (b) the file extension is .mp3 and the size is ≤ 10,485,760 bytes.
   * All other combinations SHALL return invalid with an appropriate error message.
   */

  it('returns valid for image files within size limit', () => {
    fc.assert(
      fc.property(
        fileNameBaseArb,
        imageExtArb,
        validImageSizeArb,
        (baseName, ext, size) => {
          const file = createMockFile(`${baseName}${ext}`, size)
          const result = validateMediaFile(file)
          expect(result).toEqual({ valid: true })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns invalid for image files exceeding size limit', () => {
    fc.assert(
      fc.property(
        fileNameBaseArb,
        imageExtArb,
        oversizedImageSizeArb,
        (baseName, ext, size) => {
          const file = createMockFile(`${baseName}${ext}`, size)
          const result = validateMediaFile(file)
          expect(result.valid).toBe(false)
          if (!result.valid) {
            expect(result.error).toContain('5 MB')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns valid for audio files within size limit', () => {
    fc.assert(
      fc.property(
        fileNameBaseArb,
        audioExtArb,
        validAudioSizeArb,
        (baseName, ext, size) => {
          const file = createMockFile(`${baseName}${ext}`, size)
          const result = validateMediaFile(file)
          expect(result).toEqual({ valid: true })
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns invalid for audio files exceeding size limit', () => {
    fc.assert(
      fc.property(
        fileNameBaseArb,
        audioExtArb,
        oversizedAudioSizeArb,
        (baseName, ext, size) => {
          const file = createMockFile(`${baseName}${ext}`, size)
          const result = validateMediaFile(file)
          expect(result.valid).toBe(false)
          if (!result.valid) {
            expect(result.error).toContain('10 MB')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns invalid for unsupported file extensions regardless of size', () => {
    fc.assert(
      fc.property(
        fileNameBaseArb,
        invalidExtArb,
        anySizeArb,
        (baseName, ext, size) => {
          const file = createMockFile(`${baseName}${ext}`, size)
          const result = validateMediaFile(file)
          expect(result.valid).toBe(false)
          if (!result.valid) {
            expect(result.error).toContain('Unsupported file type')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('valid iff (image ext AND size ≤ 5MB) OR (audio ext AND size ≤ 10MB) — universal property', () => {
    fc.assert(
      fc.property(
        fileNameBaseArb,
        anyExtArb,
        anySizeArb,
        (baseName, ext, size) => {
          const file = createMockFile(`${baseName}${ext}`, size)
          const result = validateMediaFile(file)

          const isValidImage = IMAGE_EXTENSIONS.includes(ext) && size <= IMAGE_MAX_SIZE
          const isValidAudio = AUDIO_EXTENSIONS.includes(ext) && size <= AUDIO_MAX_SIZE
          const shouldBeValid = isValidImage || isValidAudio

          expect(result.valid).toBe(shouldBeValid)
        }
      ),
      { numRuns: 200 }
    )
  })
})

// ─── Property 6: YouTube URL validation ─────────────────────────────────────

describe('Property 6: YouTube URL validation', () => {
  /**
   * **Validates: Requirements 7.4, 7.6**
   *
   * For any string, `validateYouTubeUrl` SHALL return true if and only if
   * the string matches the pattern `^https?://(www\.)?(youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+)`,
   * and false otherwise.
   */

  /** Generate valid YouTube URLs */
  const validYouTubeUrlArb = fc.tuple(
    fc.constantFrom('http://', 'https://'),
    fc.constantFrom('', 'www.'),
    fc.constantFrom('youtube.com/watch', 'youtu.be'),
    fc.stringMatching(/^[a-zA-Z0-9_-]{4,20}$/)
  ).map(([protocol, www, domain, videoId]) => {
    if (domain === 'youtube.com/watch') {
      return `${protocol}${www}${domain}?v=${videoId}`
    }
    return `${protocol}${www}${domain}/${videoId}`
  })

  /** Generate arbitrary strings that may or may not be valid URLs */
  const arbitraryStringArb = fc.string({ minLength: 0, maxLength: 200 })

  it('returns true for valid YouTube URLs', () => {
    fc.assert(
      fc.property(
        validYouTubeUrlArb,
        (url) => {
          expect(validateYouTubeUrl(url)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns false for non-YouTube URLs', () => {
    const nonYouTubeUrlArb = fc.tuple(
      fc.constantFrom('http://', 'https://'),
      fc.constantFrom('vimeo.com/', 'dailymotion.com/', 'twitch.tv/', 'example.com/')
    ).map(([protocol, domain]) => `${protocol}${domain}video123`)

    fc.assert(
      fc.property(
        nonYouTubeUrlArb,
        (url) => {
          expect(validateYouTubeUrl(url)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns false for empty or whitespace strings', () => {
    const whitespaceArb = fc.constantFrom('', ' ', '  ', '\t', '\n')

    fc.assert(
      fc.property(
        whitespaceArb,
        (str) => {
          expect(validateYouTubeUrl(str)).toBe(false)
        }
      ),
      { numRuns: 5 }
    )
  })

  it('matches the YouTube regex pattern exactly — universal property', () => {
    fc.assert(
      fc.property(
        arbitraryStringArb,
        (str) => {
          const result = validateYouTubeUrl(str)
          const expected = YOUTUBE_PATTERN.test(str)
          expect(result).toBe(expected)
        }
      ),
      { numRuns: 200 }
    )
  })
})
