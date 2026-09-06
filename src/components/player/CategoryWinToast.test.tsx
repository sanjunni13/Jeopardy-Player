// @vitest-environment jsdom
import { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BuzzState } from '../../types/session'

import { CategoryWinToast, CATEGORY_WIN_TOAST_LIFETIME_MS } from './CategoryWinToast'
import { BuzzerPage } from './BuzzerPage'

// Feature: negative-balance-and-analytics-updates
// Task 13.3 — Category_Win_Toast placement and lifetime (Requirements 7.1, 7.2, 7.3, 7.6)

// ─── Stylesheet helpers ──────────────────────────────────────────────────────

/**
 * Returns the declaration block for an exact selector, or `null`.
 *
 * jsdom applies no cascade, so placement rules are verified against the
 * stylesheet source rather than computed styles.
 */
function ruleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  return match ? match[1] : null
}

/** Every `z-index` value declared in a stylesheet, as numbers. */
function zIndexValues(css: string): number[] {
  return [...css.matchAll(/z-index\s*:\s*(-?\d+)/g)].map(m => Number(m[1]))
}

function readCss(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8')
}

const TOAST_CSS = readCss('src/components/player/CategoryWinToast.css')
const TOAST_RULE = ruleBody(TOAST_CSS, '.category-win-toast')

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ACTIVE_BUZZ_STATE: BuzzState = {
  clueActive: true,
  queue: [],
  lockedOut: [],
  systemLocked: false,
}

function makeChannel() {
  return { send: vi.fn().mockResolvedValue('ok') } as unknown as
    import('@supabase/supabase-js').RealtimeChannel
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Anchor and stacking order (Req 7.1, 7.2) ────────────────────────────────

describe('Category_Win_Toast anchor and stacking order (Req 7.1, 7.2)', () => {
  it('renders a live region carrying the single .category-win-toast class', () => {
    render(<CategoryWinToast category="Science" winningBid={500} onDismiss={vi.fn()} />)

    const toast = screen.getByRole('status')
    expect(toast).toHaveClass('category-win-toast')
    // Placement comes from the stylesheet, not a per-render inline style.
    expect(toast.getAttribute('style')).toBeNull()
  })

  it('anchors to the top right corner of the viewport', () => {
    expect(TOAST_RULE).not.toBeNull()
    const body = TOAST_RULE as string

    expect(body).toMatch(/position\s*:\s*fixed\s*;/)
    expect(body).toMatch(/top\s*:\s*1rem\s*;/)
    expect(body).toMatch(/right\s*:\s*1rem\s*;/)
    // Anchoring to the opposite edges would place it over the bottom controls.
    expect(body).not.toMatch(/(?:^|[\s;])bottom\s*:/)
    expect(body).not.toMatch(/(?:^|[\s;])left\s*:/)
    expect(body).not.toMatch(/(?:^|[\s;])inset\s*:/)
  })

  it('sits above every buzzer page z-index while leaving room for overlays above it', () => {
    const body = TOAST_RULE as string
    const toastZ = zIndexValues(body)
    expect(toastZ).toHaveLength(1)
    expect(toastZ[0]).toBe(1000)

    // Above all buzzer page content (Req 7.2, first clause).
    const pageZIndexes = [
      ...zIndexValues(readCss('src/components/player/BuzzerPage.css')),
      ...zIndexValues(readCss('src/components/player/PlayerAuctionPanel.css')),
    ]
    for (const z of pageZIndexes) {
      expect(toastZ[0]).toBeGreaterThan(z)
    }

    // Browser-level and assistive-technology overlays still paint above it:
    // the value stays an ordinary layer rather than the maximum, and it is not
    // forced with `!important`.
    expect(toastZ[0]).toBeLessThan(2_147_483_647)
    expect(body).not.toMatch(/z-index[^;]*!important/)
  })
})

// ─── Lifetime (Req 7.3) ──────────────────────────────────────────────────────

describe('Category_Win_Toast lifetime (Req 7.3)', () => {
  it('uses a 5 second lifetime', () => {
    expect(CATEGORY_WIN_TOAST_LIFETIME_MS).toBe(5000)
  })

  it('does not dismiss before 5 seconds and dismisses exactly once at 5 seconds', () => {
    const onDismiss = vi.fn()
    render(<CategoryWinToast category="Science" winningBid={500} onDismiss={onDismiss} />)

    act(() => {
      vi.advanceTimersByTime(CATEGORY_WIN_TOAST_LIFETIME_MS - 1)
    })
    expect(onDismiss).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    // No repeat firing once the lifetime has elapsed.
    act(() => {
      vi.advanceTimersByTime(CATEGORY_WIN_TOAST_LIFETIME_MS * 3)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('is removed from the page once the parent clears its state from onDismiss', () => {
    function Host() {
      const [win, setWin] = useState<{ category: string; winningBid: number } | null>({
        category: 'Science',
        winningBid: 500,
      })
      return win === null ? null : (
        <CategoryWinToast
          category={win.category}
          winningBid={win.winningBid}
          onDismiss={() => setWin(null)}
        />
      )
    }

    render(<Host />)
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(CATEGORY_WIN_TOAST_LIFETIME_MS)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('clears the pending timer on unmount', () => {
    const onDismiss = vi.fn()
    const { unmount } = render(
      <CategoryWinToast category="Science" winningBid={500} onDismiss={onDismiss} />
    )

    act(() => {
      vi.advanceTimersByTime(CATEGORY_WIN_TOAST_LIFETIME_MS - 1)
    })
    unmount()

    expect(vi.getTimerCount()).toBe(0)
    act(() => {
      vi.advanceTimersByTime(CATEGORY_WIN_TOAST_LIFETIME_MS * 2)
    })
    expect(onDismiss).not.toHaveBeenCalled()
  })
})

// ─── Buzzer control stays reachable (Req 7.6) ────────────────────────────────

describe('Category_Win_Toast leaves the buzzer control reachable (Req 7.6)', () => {
  it('keeps the buzz button enabled and clickable while the toast is visible', async () => {
    const channel = makeChannel()

    render(
      <>
        <BuzzerPage playerName="Alice" buzzState={ACTIVE_BUZZ_STATE} channel={channel} />
        <CategoryWinToast category="Science" winningBid={500} onDismiss={vi.fn()} />
      </>
    )

    const toast = screen.getByRole('status')
    const buzz = screen.getByRole('button', { name: 'Buzz in' })

    expect(buzz).toBeEnabled()
    // The toast is a sibling of the buzzer page, so it never wraps or replaces
    // the control.
    expect(toast.contains(buzz)).toBe(false)
    expect(buzz.contains(toast)).toBe(false)

    await act(async () => {
      fireEvent.click(buzz)
    })

    expect(channel.send).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Buzz registered' })).toBeInTheDocument()
    // Still on screen, so the click landed on the control rather than the toast.
    expect(screen.getByRole('status')).toHaveClass('category-win-toast')
  })

  it('does not stretch across the viewport or over the bottom controls', () => {
    const body = TOAST_RULE as string

    // Content-sized pill: bounded width, no declared height, and never a
    // full-viewport sheet over the centred buzz button or bottom controls.
    expect(body).toMatch(/max-width\s*:\s*min\(22rem,\s*calc\(100vw - 2rem\)\)\s*;/)
    expect(body).not.toMatch(/(?:^|[\s;])width\s*:/)
    expect(body).not.toMatch(/(?:^|[\s;])height\s*:/)
    expect(body).not.toMatch(/100dvh|100vh/)

    // The buzz button is centred by its own container, so a top-anchored,
    // content-sized toast cannot sit on top of it.
    const buzzerCss = readCss('src/components/player/BuzzerPage.css')
    const container = ruleBody(buzzerCss, '.buzzer-page__button-container')
    expect(container).not.toBeNull()
    expect(container).toMatch(/align-items\s*:\s*center\s*;/)
    expect(container).toMatch(/justify-content\s*:\s*center\s*;/)
  })
})
