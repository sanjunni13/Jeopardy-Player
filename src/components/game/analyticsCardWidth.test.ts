import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Requirement 11 (Wider Analytics_Card) — CSS declaration assertions.
 *
 * jsdom performs no cascade and no layout, so measured geometry
 * (`getBoundingClientRect`, computed `max-width` on a rendered node) is not
 * observable here. These tests therefore read the stylesheet sources and assert
 * the declarations that produce the required geometry in a real engine:
 * the 64rem cap, the `min(…, 100%)` viewport clamp, auto horizontal margins,
 * `box-sizing: border-box`, and the per-table `overflow-x: auto` fallback.
 *
 * Covers Requirements 11.1, 11.3, 11.4, 11.6, 11.7, 11.8.
 */

const ANALYTICS_CSS_PATH = 'src/components/game/AnalyticsScreen.css'
const GAMBLING_CSS_PATH = 'src/components/game/GamblingAnalytics.css'

/** Reads a stylesheet with block comments stripped so declarations parse cleanly. */
function readCss(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  )
}

/** Returns the declaration block for an exact selector, or `null`. */
function ruleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  return match ? match[1] : null
}

/** Returns the value of a declaration inside a rule body, or `null`. */
function declaration(body: string, property: string): string | null {
  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(body)
  return match ? match[1].trim() : null
}

const analyticsCss = readCss(ANALYTICS_CSS_PATH)
const gamblingCss = readCss(GAMBLING_CSS_PATH)

const CARD_SELECTORS = ['.analytics-gradient-container', '.analytics-card'] as const

describe('Analytics_Card width cap (Req 11.1, 11.3)', () => {
  for (const selector of CARD_SELECTORS) {
    it(`${selector} caps its width at 64rem and clamps to the container`, () => {
      const body = ruleBody(analyticsCss, selector)
      expect(body).not.toBeNull()

      const maxWidth = declaration(body as string, 'max-width')
      expect(maxWidth).not.toBeNull()

      // The 64rem cap gives the wide-viewport outer width (criterion 1) …
      expect(maxWidth).toMatch(/\b64rem\b/)
      // … and `min(…, 100%)` keeps it inside a narrower page (criterion 3).
      expect(maxWidth?.replace(/\s+/g, '')).toBe('min(64rem,100%)')
    })
  }

  it('leaves at least 58rem of inner content width after the card padding', () => {
    const body = ruleBody(analyticsCss, '.analytics-card')
    const padding = declaration(body as string, 'padding')
    expect(padding).toBe('2.5rem')

    // 64rem outer − 2 × 2.5rem horizontal padding = 59rem of content.
    const OUTER_REM = 64
    const PADDING_REM = 2.5
    expect(OUTER_REM - 2 * PADDING_REM).toBeGreaterThanOrEqual(58)
  })
})

describe('Analytics_Card centring (Req 11.4)', () => {
  it('.analytics-gradient-container centres itself with auto margins', () => {
    const body = ruleBody(analyticsCss, '.analytics-gradient-container')
    expect(body).not.toBeNull()
    expect(declaration(body as string, 'margin')).toBe('0 auto')
  })

  it('.analytics-card centres itself with auto left and right margins', () => {
    const body = ruleBody(analyticsCss, '.analytics-card')
    expect(body).not.toBeNull()
    expect(declaration(body as string, 'margin-left')).toBe('auto')
    expect(declaration(body as string, 'margin-right')).toBe('auto')
  })
})

describe('Analytics_Card never overflows the page (Req 11.7)', () => {
  it('.analytics-card sizes its padding inside the capped width', () => {
    const body = ruleBody(analyticsCss, '.analytics-card')
    expect(declaration(body as string, 'box-sizing')).toBe('border-box')
  })

  for (const selector of CARD_SELECTORS) {
    it(`${selector} declares no fixed width that could exceed the viewport`, () => {
      const body = ruleBody(analyticsCss, selector) as string
      expect(declaration(body, 'width')).toBeNull()
      expect(declaration(body, 'min-width')).toBeNull()
    })
  }

  it('neither the analytics page nor the card forces horizontal scrolling', () => {
    for (const selector of ['.analytics-page', ...CARD_SELECTORS]) {
      const body = ruleBody(analyticsCss, selector) as string
      expect(body).not.toBeNull()
      const overflowX = declaration(body, 'overflow-x')
      expect(overflowX === null || overflowX === 'hidden').toBe(true)
      const overflow = declaration(body, 'overflow')
      expect(overflow === null || !/scroll/.test(overflow)).toBe(true)
    }
  })
})

describe('Gambling table scroll fallback (Req 11.6)', () => {
  // The bet type breakdown table sits inside a `.gambling-stats` wrapper, so
  // these two containers cover all three Gambling_Analytics tables.
  for (const selector of ['.gambling-stats', '.gambling-ledger']) {
    it(`${selector} scrolls its own overflow horizontally`, () => {
      const body = ruleBody(gamblingCss, selector)
      expect(body).not.toBeNull()
      expect(declaration(body as string, 'overflow-x')).toBe('auto')
    })
  }
})

describe('The 64rem cap is scoped to the Analytics_Card (Req 11.8)', () => {
  it('applies the cap to exactly the two Analytics_Card selectors', () => {
    const cappedRules = analyticsCss.match(/max-width\s*:\s*min\(\s*64rem\s*,\s*100%\s*\)/g) ?? []
    expect(cappedRules).toHaveLength(CARD_SELECTORS.length)
  })

  it('declares no 64rem width cap in any other stylesheet', () => {
    const otherStylesheets = [
      GAMBLING_CSS_PATH,
      'src/components/game/AnalyticsBreakdown.css',
      'src/routes/index.css',
    ]

    for (const path of otherStylesheets) {
      expect(readCss(path), `${path} must not cap width at 64rem`).not.toMatch(
        /max-width\s*:[^;]*64rem/
      )
    }
  })
})
