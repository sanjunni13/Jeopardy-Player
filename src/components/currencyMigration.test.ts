/**
 * Source scan for the currency-migration guarantee —
 * negative-balance-and-analytics-updates, task 16.4.
 *
 * **Validates: Requirements 5.13**
 *
 * Requirement 5 criterion 13: "THE modules named in criterion 4 SHALL contain no
 * string interpolation that places a `$` character directly before a numeric
 * monetary value, so that criteria 5 through 10 are verifiable by scanning the
 * source of those modules."
 *
 * Criteria 5 through 10 are behavioural — they say each surface must render the
 * exact string the formatter returned. A rendering test can only prove that for
 * the values it generates (task 16.3 does that). This test closes the other half:
 * it proves the surfaces have no *way* to build a currency string by hand, by
 * reading their source and rejecting both shapes of hand-rolled prefix:
 *
 *   1. `` `$${amount}` ``  — a literal `$` immediately before a template
 *      interpolation.
 *   2. `<span>${amount}</span>` — a literal `$` in JSX text immediately before a
 *      JSX expression container.
 *
 * Detection is done with a small context-tracking scanner rather than a bare
 * regex, because a bare `/\$\{/` would flag every ordinary template
 * interpolation (`` `Round ${round}` ``). The scanner knows whether it is inside
 * a template literal, a quoted string, a comment, or plain code/JSX, so an
 * ordinary `$` (a CSS class, a lone `$1` in prose, a `$` not followed by an
 * interpolation) cannot trip it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── The scanned module list, from Requirement 5 criterion 4 ──────────────────

/**
 * Criterion 4 names its scope by glossary surface: "every monetary display in
 * the Auction_UI, Betting_UI, Daily_Double_Wager_Form, Final_Jeopardy_Wager_Form,
 * Category_Win_Toast, host auction status view, host betting status view,
 * Analytics_Screen, Gambling_Analytics, Head_To_Head_Section, Clue_Heatmap, and
 * the leaderboard table, replacing the local `formatDollar` duplicates in
 * `GamblingAnalytics`, `HeadToHead`, `DailyDoubleBreakdown`, `BiggestComeback`,
 * `LongestLossStreak`, and `ScoreTimelineChart` and the `formatProfit` and
 * `formatNetImpact` variants, while leaving `exportGamePdf.ts` out of scope."
 *
 * Each entry below is one module that a named surface resolves to.
 */
const SCANNED_MODULES: readonly string[] = [
  // Auction_UI — PlayerAuctionPanel (player device) and CategoryAuction (host).
  'src/components/player/PlayerAuctionPanel.tsx',
  'src/components/game/CategoryAuction.tsx',
  // Betting_UI — PlayerBettingPanel (player device) and BettingSideGames (host).
  'src/components/player/PlayerBettingPanel.tsx',
  'src/components/game/BettingSideGames.tsx',
  // Daily_Double_Wager_Form.
  'src/components/game/DailyDoubleWager.tsx',
  // Final_Jeopardy_Wager_Form — WagerEntry (host), FinalJeopardyEntryPage
  // (player), and the co-op team wager in FinalJeopardy (Requirement 4.11).
  'src/components/game/WagerEntry.tsx',
  'src/components/player/FinalJeopardyEntryPage.tsx',
  'src/components/game/FinalJeopardy.tsx',
  // Category_Win_Toast.
  'src/components/player/CategoryWinToast.tsx',
  // Host auction status view — the status panel plus the result panel and the
  // balance list extracted out of GamePage.tsx to make this scan possible.
  'src/components/host/AuctionStatusView.tsx',
  'src/components/host/AuctionResultView.tsx',
  'src/components/host/PlayerBalanceList.tsx',
  // Host betting status view.
  'src/components/host/BettingStatusView.tsx',
  // Analytics_Screen.
  'src/components/game/AnalyticsScreen.tsx',
  // Gambling_Analytics.
  'src/components/game/GamblingAnalytics.tsx',
  // Head_To_Head_Section.
  'src/components/game/HeadToHead.tsx',
  // Clue_Heatmap.
  'src/components/game/ClueHeatmap.tsx',
  // The leaderboard table.
  'src/components/leaderboard/LeaderboardTable.tsx',
  // The four remaining analytics components criterion 4 names by their deleted
  // `formatDollar` / `formatNetImpact` duplicates.
  'src/components/game/DailyDoubleBreakdown.tsx',
  'src/components/game/BiggestComeback.tsx',
  'src/components/game/LongestLossStreak.tsx',
  'src/components/game/ScoreTimelineChart.tsx',
]

/**
 * `src/utils/currency.ts` is deliberately absent: it *defines* the
 * Currency_Formatter, so `` `-$${grouped}` `` is the one correct place in the
 * codebase for that interpolation. Also absent, per the design's explicit
 * out-of-scope list: `Scoreboard`, `ClueScreen`, `GameOver`, `CoopScoreboard`,
 * `CoopGameOver`, `finalJeopardyValidation.ts`, and `exportGamePdf.ts` — they are
 * not named in criterion 4, so criterion 13 does not reach them.
 */
const OUT_OF_SCOPE_MODULES: readonly string[] = [
  'src/utils/currency.ts',
  'src/components/game/Scoreboard.tsx',
  'src/components/game/ClueScreen.tsx',
  'src/components/game/GameOver.tsx',
  'src/components/game/CoopScoreboard.tsx',
  'src/components/game/CoopGameOver.tsx',
  'src/utils/finalJeopardyValidation.ts',
  'src/utils/exportGamePdf.ts',
]

// ─── The scanner ─────────────────────────────────────────────────────────────

type ViolationKind = 'template-literal' | 'jsx-text'

interface Violation {
  kind: ViolationKind
  /** 1-based line number. */
  line: number
  /** 1-based column of the offending `$`. */
  column: number
  /** The whole source line, trimmed, for the failure message. */
  text: string
}

/**
 * Walks `source` tracking lexical context and returns every place a literal `$`
 * sits immediately before an interpolation.
 *
 * Contexts tracked: line comment, block comment, single- and double-quoted
 * string, template literal (with nested `${ … }` back into code, arbitrarily
 * deep), and plain code/JSX. A `$` inside a comment or a quoted string is never
 * a violation, because neither can interpolate.
 */
function findDollarBeforeInterpolation(source: string): Violation[] {
  const violations: Violation[] = []
  /** Stack of open contexts. `braces` counts `{` depth inside a code frame. */
  const stack: Array<{ type: 'code' | 'template'; braces: number }> = [
    { type: 'code', braces: 0 },
  ]

  const positionOf = (index: number) => {
    const before = source.slice(0, index)
    const lineStart = before.lastIndexOf('\n') + 1
    const lineEnd = source.indexOf('\n', index)
    return {
      line: before.split('\n').length,
      column: index - lineStart + 1,
      text: source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trim(),
    }
  }

  const record = (index: number, kind: ViolationKind) => {
    violations.push({ kind, ...positionOf(index) })
  }

  let i = 0
  while (i < source.length) {
    const frame = stack[stack.length - 1]
    const ch = source[i]

    if (frame.type === 'template') {
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === '`') {
        stack.pop()
        i += 1
        continue
      }
      if (ch === '$') {
        // `$${…}` — this `$` is literal text and the next two characters open an
        // interpolation. Record it, then let the `${` be handled normally.
        if (source[i + 1] === '$' && source[i + 2] === '{') {
          record(i, 'template-literal')
          i += 1
          continue
        }
        if (source[i + 1] === '{') {
          stack.push({ type: 'code', braces: 0 })
          i += 2
          continue
        }
      }
      i += 1
      continue
    }

    // ── code / JSX ──
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i)
      i = end === -1 ? source.length : end + 1
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
      continue
    }
    if (ch === "'" || ch === '"') {
      // Only treat the quote as a string delimiter when a matching unescaped
      // quote follows on the same line. A JS string cannot span a raw newline, so
      // an unmatched quote is JSX prose (`<p>Don't wager</p>`) and skipping to the
      // next line's quote would swallow real code.
      let j = i + 1
      let closed = -1
      while (j < source.length && source[j] !== '\n') {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === ch) {
          closed = j
          break
        }
        j += 1
      }
      i = closed === -1 ? i + 1 : closed + 1
      continue
    }
    if (ch === '`') {
      stack.push({ type: 'template', braces: 0 })
      i += 1
      continue
    }
    if (ch === '$' && source[i + 1] === '{') {
      // Outside a template literal, `${` can only be JSX text `$` followed by an
      // expression container.
      record(i, 'jsx-text')
      frame.braces += 1
      i += 2
      continue
    }
    if (ch === '{') {
      frame.braces += 1
      i += 1
      continue
    }
    if (ch === '}') {
      if (frame.braces === 0 && stack.length > 1) {
        // Closes the interpolation that opened this code frame.
        stack.pop()
      } else if (frame.braces > 0) {
        frame.braces -= 1
      }
      i += 1
      continue
    }
    i += 1
  }

  return violations
}

const describeViolation = (module: string, v: Violation) =>
  `${module}:${v.line}:${v.column} (${v.kind}) → ${v.text}`

// ─── The scan is not vacuous ─────────────────────────────────────────────────

describe('Requirement 5.13 source scan — coverage', () => {
  it('scans a non-empty, duplicate-free list of modules that all exist', () => {
    expect(SCANNED_MODULES.length).toBeGreaterThan(0)
    expect(new Set(SCANNED_MODULES).size).toBe(SCANNED_MODULES.length)

    // A rename or move must break this test loudly rather than silently reduce
    // the scan to nothing.
    const missing = SCANNED_MODULES.filter(
      (module) => !existsSync(resolve(process.cwd(), module)),
    )
    expect(missing, `scanned module(s) not found on disk: ${missing.join(', ')}`).toEqual([])

    // And each file must actually have content to scan.
    for (const module of SCANNED_MODULES) {
      const source = readFileSync(resolve(process.cwd(), module), 'utf-8')
      expect(source.length, `${module} is empty`).toBeGreaterThan(0)
    }
  })

  it('excludes the formatter module and the out-of-scope surfaces', () => {
    for (const module of OUT_OF_SCOPE_MODULES) {
      expect(SCANNED_MODULES).not.toContain(module)
    }
  })
})

// ─── The scanner itself behaves ──────────────────────────────────────────────

describe('Requirement 5.13 source scan — detector', () => {
  it('flags a literal `$` before a template interpolation', () => {
    const found = findDollarBeforeInterpolation('const s = `Bid $${amount} placed`\n')
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('template-literal')
    expect(found[0].line).toBe(1)
  })

  it('flags a literal `$` before a JSX expression container', () => {
    const found = findDollarBeforeInterpolation('const el = <span>${amount}</span>\n')
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('jsx-text')
  })

  it('reports the line and column of every violation', () => {
    const found = findDollarBeforeInterpolation(
      ['const a = `$${one}`', '', 'const b = <b>${two}</b>'].join('\n'),
    )
    expect(found.map((v) => v.line)).toEqual([1, 3])
    expect(found.map((v) => v.column)).toEqual([12, 14])
    expect(found.map((v) => v.text)).toEqual(['const a = `$${one}`', 'const b = <b>${two}</b>'])
  })

  it('treats an unmatched apostrophe in JSX prose as text, not as a string', () => {
    const found = findDollarBeforeInterpolation(
      '<p>Don\'t wager more than <b>${max}</b></p>\n',
    )
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('jsx-text')
  })

  it('does not flag legitimate `$`-free interpolation or ordinary `$` characters', () => {
    const clean = [
      'const a = `Round ${round} of ${total}`',
      'const b = formatCurrency(amount)',
      'const c = <span className="dollar-sign">{formatCurrency(amount)}</span>',
      'const d = "costs $5 flat"',
      "const e = 'a $ on its own'",
      '// a comment mentioning `$${x}`',
      '/* a block comment mentioning $${x} */',
      'const f = `nested ${inner ? `${a}` : `${b}`} done`',
      'const g = <p>Balance: {formatCurrency(score)}</p>',
    ].join('\n')
    expect(findDollarBeforeInterpolation(clean)).toEqual([])
  })
})

// ─── The guarantee ───────────────────────────────────────────────────────────

describe('Requirement 5.13 — no hand-rolled currency interpolation', () => {
  it.each(SCANNED_MODULES)('%s builds no `$`-prefixed amount by hand', (module) => {
    const source = readFileSync(resolve(process.cwd(), module), 'utf-8')
    const found = findDollarBeforeInterpolation(source)
    expect(
      found.map((v) => describeViolation(module, v)),
      `${module} must import formatCurrency / formatSignedChange from src/utils/currency.ts ` +
        `instead of interpolating a \`$\` before a value`,
    ).toEqual([])
  })

  it('leaves no violation anywhere in the scanned set', () => {
    const all = SCANNED_MODULES.flatMap((module) =>
      findDollarBeforeInterpolation(
        readFileSync(resolve(process.cwd(), module), 'utf-8'),
      ).map((v) => describeViolation(module, v)),
    )
    expect(all).toEqual([])
  })
})
