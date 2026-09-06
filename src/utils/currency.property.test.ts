import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { formatCurrency, formatSignedChange, toWholeDollars } from './currency'

// ─── Generators ───────────────────────────────────────────────────────────────

/** The exact numeric bound Requirement 5.11 names. */
const MONETARY_BOUND = 9_999_999

/** Whole-dollar amounts across the entire supported range. */
const wholeDollarArb = fc.integer({ min: -MONETARY_BOUND, max: MONETARY_BOUND })

/** Fractional amounts across the entire supported range. */
const fractionalArb = fc.double({
  min: -MONETARY_BOUND,
  max: MONETARY_BOUND,
  noNaN: true,
})

/** Values that must appear in every finite generator for this module. */
const monetaryEdgeArb = fc.constantFrom(
  0,
  -0,
  1,
  -1,
  0.5,
  -0.5,
  999,
  -999,
  1000,
  -1000,
  MONETARY_BOUND,
  -MONETARY_BOUND
)

/** Any finite input the Currency_Formatter must accept. */
const finiteMonetaryArb = fc.oneof(
  { arbitrary: monetaryEdgeArb, weight: 2 },
  { arbitrary: wholeDollarArb, weight: 3 },
  { arbitrary: fractionalArb, weight: 3 }
)

/** Every non-finite input Requirement 5.12 names. */
const nonFiniteArb = fc.constantFrom(NaN, Infinity, -Infinity)

/** `$1,234,567` / `-$1,234,567`: one `$`, no decimals, digits grouped in threes. */
const CURRENCY_SHAPE = /^-?\$\d{1,3}(,\d{3})*$/

// ─── Property 19: Currency_Formatter output shape ─────────────────────────────

describe('Property 19: Currency_Formatter output shape', () => {
  /**
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.12**
   *
   * For any finite number from -9,999,999 through 9,999,999 the output contains
   * exactly one `$`, no decimal point and no decimal digit, groups digits in
   * threes with commas, begins with `-` exactly when the value rounds to a
   * negative whole dollar, and never begins with `+`. `0` and `-0` both return
   * exactly `$0`, and every non-finite input returns the empty string without
   * raising.
   */

  it('contains exactly one $ and no decimal point or decimal digit', () => {
    fc.assert(
      fc.property(finiteMonetaryArb, (value) => {
        const result = formatCurrency(value)
        expect(result.split('$')).toHaveLength(2)
        expect(result).not.toContain('.')
        expect(result).not.toMatch(/\d\.\d/)
      }),
      { numRuns: 1000 }
    )
  })

  it('groups digits in threes with commas', () => {
    fc.assert(
      fc.property(finiteMonetaryArb, (value) => {
        expect(formatCurrency(value)).toMatch(CURRENCY_SHAPE)
      }),
      { numRuns: 1000 }
    )
  })

  it('begins with - exactly when the value rounds to a negative whole dollar', () => {
    fc.assert(
      fc.property(finiteMonetaryArb, (value) => {
        const result = formatCurrency(value)
        expect(result.startsWith('-')).toBe(toWholeDollars(value) < 0)
      }),
      { numRuns: 1000 }
    )
  })

  it('never emits a + character', () => {
    fc.assert(
      fc.property(finiteMonetaryArb, (value) => {
        expect(formatCurrency(value)).not.toContain('+')
      }),
      { numRuns: 1000 }
    )
  })

  it('renders 0 and -0 as exactly $0', () => {
    expect(formatCurrency(0)).toBe('$0')
    expect(formatCurrency(-0)).toBe('$0')
  })

  it('returns the empty string for every non-finite input and raises nothing', () => {
    fc.assert(
      fc.property(nonFiniteArb, (value) => {
        expect(formatCurrency(value)).toBe('')
      }),
      { numRuns: 100 }
    )
  })
})
// ─── Property 20: Currency_Formatter round trip ───────────────────────────────

describe('Property 20: Currency_Formatter round trip', () => {
  /**
   * **Validates: Requirements 5.1, 5.2, 5.11**
   *
   * For any finite number in range, stripping the `$` and the commas from the
   * Currency_Formatter's output and parsing the result as an integer yields
   * exactly the input rounded to the nearest whole dollar with halves rounded
   * away from zero.
   */

  /** Strips the `$` and the commas, then parses what is left as an integer. */
  const parseFormatted = (formatted: string): number =>
    Number.parseInt(formatted.replace(/[$,]/g, ''), 10)

  /** Rounds half away from zero, normalising `-0` to `0` for comparison. */
  const expectedWholeDollars = (value: number): number =>
    Math.sign(value) * Math.round(Math.abs(value)) + 0

  it('round trips any finite in-range value to its whole-dollar rounding', () => {
    fc.assert(
      fc.property(finiteMonetaryArb, (value) => {
        expect(parseFormatted(formatCurrency(value))).toBe(
          expectedWholeDollars(value)
        )
      }),
      { numRuns: 1000 }
    )
  })

  it('round trips whole dollars to themselves unchanged', () => {
    fc.assert(
      fc.property(wholeDollarArb, (value) => {
        expect(parseFormatted(formatCurrency(value))).toBe(value + 0)
      }),
      { numRuns: 1000 }
    )
  })

  it('rounds fractional values half away from zero', () => {
    fc.assert(
      fc.property(fractionalArb, (value) => {
        expect(parseFormatted(formatCurrency(value))).toBe(
          toWholeDollars(value) + 0
        )
      }),
      { numRuns: 1000 }
    )
  })

  it('rounds exactly-half inputs away from zero', () => {
    expect(parseFormatted(formatCurrency(0.5))).toBe(1)
    expect(parseFormatted(formatCurrency(-0.5))).toBe(-1)
    expect(parseFormatted(formatCurrency(1.5))).toBe(2)
    expect(parseFormatted(formatCurrency(-1.5))).toBe(-2)
    expect(parseFormatted(formatCurrency(999.5))).toBe(1000)
    expect(parseFormatted(formatCurrency(-999.5))).toBe(-1000)
  })

  it('round trips the bounds and near-zero fractions', () => {
    expect(parseFormatted(formatCurrency(MONETARY_BOUND))).toBe(MONETARY_BOUND)
    expect(parseFormatted(formatCurrency(-MONETARY_BOUND))).toBe(-MONETARY_BOUND)
    expect(parseFormatted(formatCurrency(0.4))).toBe(0)
    expect(parseFormatted(formatCurrency(-0.4))).toBe(0)
  })
})

// ─── Property 21: Signed_Change_Formatter output shape ────────────────────────

describe('Property 21: Signed_Change_Formatter output shape', () => {
  /**
   * **Validates: Requirements 5.10, 5.11, 5.12**
   *
   * For any finite number in range, the Signed_Change_Formatter returns the
   * Currency_Formatter output prefixed with `+` when the value rounds to a
   * positive whole dollar, returns exactly the Currency_Formatter output when it
   * rounds to a negative whole dollar, returns exactly `$0` for zero, and never
   * returns a string containing two sign characters.
   */

  /** `+$1,234,567` / `-$1,234,567` / `$0`: at most one leading sign. */
  const SIGNED_SHAPE = /^[+-]?\$\d{1,3}(,\d{3})*$/

  it('prefixes the Currency_Formatter output with + for a positive rounding', () => {
    fc.assert(
      fc.property(finiteMonetaryArb, (value) => {
        fc.pre(toWholeDollars(value) > 0)
        expect(formatSignedChange(value)).toBe(`+${formatCurrency(value)}`)
      }),
      { numRuns: 1000 }
    )
  })

  it('returns exactly the Currency_Formatter output for a negative rounding', () => {
    fc.assert(
      fc.property(finiteMonetaryArb, (value) => {
        fc.pre(toWholeDollars(value) < 0)
        expect(formatSignedChange(value)).toBe(formatCurrency(value))
      }),
      { numRuns: 1000 }
    )
  })

  it('returns exactly $0 for every value that rounds to zero', () => {
    fc.assert(
      fc.property(finiteMonetaryArb, (value) => {
        fc.pre(toWholeDollars(value) === 0)
        expect(formatSignedChange(value)).toBe('$0')
      }),
      { numRuns: 500 }
    )
    expect(formatSignedChange(0)).toBe('$0')
    expect(formatSignedChange(-0)).toBe('$0')
    expect(formatSignedChange(0.4)).toBe('$0')
    expect(formatSignedChange(-0.4)).toBe('$0')
  })

  it('never contains two sign characters', () => {
    fc.assert(
      fc.property(fc.oneof(finiteMonetaryArb, nonFiniteArb), (value) => {
        const result = formatSignedChange(value)
        const signs = result.replace(/[^+-]/g, '')
        expect(signs.length).toBeLessThanOrEqual(1)
        expect(result).not.toContain('+-')
        expect(result).not.toContain('-+')
        expect(result).not.toContain('--')
        expect(result).not.toContain('++')
      }),
      { numRuns: 1000 }
    )
  })

  it('emits at most one leading sign followed by the currency shape', () => {
    fc.assert(
      fc.property(finiteMonetaryArb, (value) => {
        const result = formatSignedChange(value)
        expect(result).toMatch(SIGNED_SHAPE)
        expect(result.split('$')).toHaveLength(2)
        expect(result).not.toContain('.')
      }),
      { numRuns: 1000 }
    )
  })

  it('accepts the full range and rounds halves away from zero', () => {
    fc.assert(
      fc.property(wholeDollarArb, (value) => {
        expect(formatSignedChange(value)).toBe(
          value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value)
        )
      }),
      { numRuns: 1000 }
    )
    expect(formatSignedChange(0.5)).toBe('+$1')
    expect(formatSignedChange(-0.5)).toBe('-$1')
    expect(formatSignedChange(1.5)).toBe('+$2')
    expect(formatSignedChange(-1.5)).toBe('-$2')
    expect(formatSignedChange(MONETARY_BOUND)).toBe('+$9,999,999')
    expect(formatSignedChange(-MONETARY_BOUND)).toBe('-$9,999,999')
  })

  it('returns the empty string for every non-finite input and raises nothing', () => {
    fc.assert(
      fc.property(nonFiniteArb, (value) => {
        expect(formatSignedChange(value)).toBe('')
      }),
      { numRuns: 100 }
    )
  })
})
