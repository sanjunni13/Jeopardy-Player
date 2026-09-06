// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest'
import fc from 'fast-check'
import { render, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import { CollapsiblePlayerSection } from './CollapsiblePlayerSection'

// Feature: negative-balance-and-analytics-updates
// Property 27: Collapsible section toggle round trip

afterEach(cleanup)

// ─── Generators ───────────────────────────────────────────────────────────────

/**
 * Player names as they can actually reach analytics: a non-empty display string
 * with collapsed interior whitespace, so accessible-name comparisons stay exact.
 */
const playerNameArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 24 })
  .map((raw) => raw.replace(/\s+/g, ' ').trim())
  .filter((name) => name.length > 0)

// ─── Shared helpers ───────────────────────────────────────────────────────────

const CONTENT_TEST_ID = 'section-content'

const TOGGLE_SELECTOR = '.collapsible-player-section__toggle'
const CHEVRON_SELECTOR = '.collapsible-player-section__chevron'
const CONTENT_SELECTOR = `[data-testid="${CONTENT_TEST_ID}"]`

const COLLAPSED_CHEVRON = '▼'
const EXPANDED_CHEVRON = '▲'

/** The three ways a player can activate a disclosure toggle — Requirements 9.5, 9.6. */
type ActivationMode = 'pointer' | 'enter' | 'space'

const ACTIVATION_MODES: readonly ActivationMode[] = ['pointer', 'enter', 'space']

/** A user-event session without inter-event delays, so hundreds of runs stay quick. */
function setupUser(): UserEvent {
  return userEvent.setup({ delay: null })
}

/** Renders one section whose content is identifiable by test id. */
function renderSection(playerName: string) {
  return render(
    <CollapsiblePlayerSection playerName={playerName}>
      <p data-testid={CONTENT_TEST_ID}>Breakdown for {playerName}</p>
    </CollapsiblePlayerSection>
  )
}

/** Everything Requirement 9 observes about a section, read fresh from the DOM. */
function readSection(container: HTMLElement) {
  const toggle = container.querySelector<HTMLButtonElement>(TOGGLE_SELECTOR)
  return {
    toggle,
    expanded: toggle?.getAttribute('aria-expanded') ?? null,
    chevron: container.querySelector(CHEVRON_SELECTOR)?.textContent ?? null,
    content: container.querySelector(CONTENT_SELECTOR),
  }
}

/**
 * Activates a toggle the way a real player would. Keyboard activation focuses
 * the toggle first, then relies on the native button's own `Enter`/`Space`
 * handling — the component adds no key handlers.
 */
async function activateToggle(user: UserEvent, toggle: HTMLElement, mode: ActivationMode) {
  if (mode === 'pointer') {
    await user.click(toggle)
    return
  }
  toggle.focus()
  await user.keyboard(mode === 'enter' ? '{Enter}' : '[Space]')
}

// ─── Property 27: Collapsible section toggle round trip ───────────────────────

describe('Property 27: Collapsible section toggle round trip', () => {
  /**
   * **Validates: Requirements 9.4, 9.5, 9.6, 9.7**
   *
   * For any player name, a CollapsiblePlayerSection renders collapsed with
   * `aria-expanded` false, its content absent from the page, and a `▼` chevron;
   * activating the toggle by pointer, `Enter`, or `Space` renders the content,
   * sets `aria-expanded` true, shows a `▲` chevron, and leaves focus on the
   * toggle; and activating it again returns the section to a state
   * indistinguishable from its initial one, with focus still on the toggle.
   */

  it('round trips through expanded and back for pointer, Enter, and Space activation', async () => {
    await fc.assert(
      fc.asyncProperty(playerNameArb, async (playerName) => {
        for (const mode of ACTIVATION_MODES) {
          cleanup()
          const user = setupUser()
          const { container } = renderSection(playerName)

          // Initial render is collapsed — Requirements 9.4, 9.7
          const initial = readSection(container)
          expect(initial.toggle).not.toBeNull()
          expect(initial.expanded).toBe('false')
          expect(initial.content).toBeNull()
          expect(initial.chevron).toBe(COLLAPSED_CHEVRON)
          const initialHtml = container.innerHTML

          const toggle = initial.toggle as HTMLButtonElement

          // First activation expands and keeps focus — Requirements 9.5, 9.7
          await activateToggle(user, toggle, mode)
          const expanded = readSection(container)
          expect(expanded.expanded).toBe('true')
          expect(expanded.content).not.toBeNull()
          expect(expanded.chevron).toBe(EXPANDED_CHEVRON)
          expect(document.activeElement).toBe(expanded.toggle)

          // Second activation collapses back to the initial state — Requirements 9.6, 9.7
          await activateToggle(user, expanded.toggle as HTMLButtonElement, mode)
          const collapsed = readSection(container)
          expect(collapsed.expanded).toBe('false')
          expect(collapsed.content).toBeNull()
          expect(collapsed.chevron).toBe(COLLAPSED_CHEVRON)
          expect(document.activeElement).toBe(collapsed.toggle)
          expect(container.innerHTML).toBe(initialHtml)
        }
      }),
      { numRuns: 100 }
    )
  }, 60_000)
})
// ─── Property 28: Section toggles are reachable and named ─────────────────────

/** Sentinel buttons that bracket the section, so `Tab` order is observable. */
const BEFORE_TEST_ID = 'before-section'
const AFTER_TEST_ID = 'after-section'

/** Every element a `Tab` press can land on, in document order. */
const TABBABLE_SELECTOR = 'a[href], button, input, select, textarea, [tabindex]'

/**
 * Renders one section between two focusable sentinels, so a `Tab` walk shows
 * where the toggle sits in document order — Requirement 9.12.
 */
function renderSectionBetweenSentinels(playerName: string) {
  return render(
    <>
      <button type="button" data-testid={BEFORE_TEST_ID}>
        before
      </button>
      <CollapsiblePlayerSection playerName={playerName}>
        <p data-testid={CONTENT_TEST_ID}>Breakdown for {playerName}</p>
      </CollapsiblePlayerSection>
      <button type="button" data-testid={AFTER_TEST_ID}>
        after
      </button>
    </>
  )
}

/**
 * Computes an element's accessible name the way assistive technology does for
 * a button: `aria-labelledby`, else `aria-label`, else its content with
 * `aria-hidden` subtrees removed. Whitespace is flattened, as name computation
 * does.
 */
function accessibleName(element: HTMLElement): string {
  const flatten = (text: string) => text.replace(/\s+/g, ' ').trim()

  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    return flatten(
      labelledBy
        .split(/\s+/)
        .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
        .join(' ')
    )
  }

  const label = element.getAttribute('aria-label')
  if (label !== null) return flatten(label)

  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
  return flatten(clone.textContent ?? '')
}

describe('Property 28: Section toggles are reachable and named', () => {
  /**
   * **Validates: Requirements 9.12**
   *
   * For any player name, the section toggle is a single element reachable by
   * `Tab` in document order whose accessible name is that player name.
   */

  it('exposes exactly one toggle that Tab reaches in document order, named for the player', async () => {
    await fc.assert(
      fc.asyncProperty(playerNameArb, async (playerName) => {
        cleanup()
        const user = setupUser()
        const { container } = renderSectionBetweenSentinels(playerName)

        // The section contributes exactly one toggle, and it is the section's
        // only tab stop — Requirement 9.12
        const toggles = container.querySelectorAll<HTMLButtonElement>(TOGGLE_SELECTOR)
        expect(toggles).toHaveLength(1)
        const toggle = toggles[0]
        const section = toggle.closest('.collapsible-player-section') as HTMLElement
        expect(Array.from(section.querySelectorAll(TABBABLE_SELECTOR))).toEqual([toggle])
        expect(toggle.hasAttribute('disabled')).toBe(false)
        expect(toggle.getAttribute('tabindex')).toBeNull()

        // The accessible name is the player name; the chevron is hidden from it
        expect(accessibleName(toggle)).toBe(playerName)
        expect(container.querySelector(CHEVRON_SELECTOR)?.getAttribute('aria-hidden')).toBe('true')
        expect(accessibleName(toggle)).not.toContain(COLLAPSED_CHEVRON)

        // Tab walks straight through the toggle, between the two sentinels
        const before = container.querySelector<HTMLButtonElement>(`[data-testid="${BEFORE_TEST_ID}"]`)
        const after = container.querySelector<HTMLButtonElement>(`[data-testid="${AFTER_TEST_ID}"]`)
        await user.tab()
        expect(document.activeElement).toBe(before)
        await user.tab()
        expect(document.activeElement).toBe(toggle)
        await user.tab()
        expect(document.activeElement).toBe(after)

        // Expanding does not cost the toggle its tab position or its name
        await activateToggle(user, toggle, 'pointer')
        expect(readSection(container).expanded).toBe('true')
        const expandedToggle = readSection(container).toggle as HTMLButtonElement
        expect(accessibleName(expandedToggle)).toBe(playerName)
        expect(accessibleName(expandedToggle)).not.toContain(EXPANDED_CHEVRON)
        expect(section.querySelectorAll(TABBABLE_SELECTOR)[0]).toBe(expandedToggle)
      }),
      { numRuns: 100 }
    )
  }, 60_000)
})

// ─── Property 29: Sections are independent ────────────────────────────────────

/** The three analytics groups that each render one section per player. */
const SECTION_GROUPS = ['bet-types', 'ledger', 'head-to-head'] as const

type SectionGroup = (typeof SECTION_GROUPS)[number]

/** Identifies one section by its group and its position within that group. */
type SectionKey = `${SectionGroup}#${number}`

const sectionKey = (group: SectionGroup, index: number): SectionKey => `${group}#${index}`

/** One toggle activation: which section, and how the player activated it. */
interface Activation {
  group: SectionGroup
  index: number
  mode: ActivationMode
}

/** Activations restricted to the sections that actually exist for `playerCount`. */
const activationArb = (playerCount: number): fc.Arbitrary<Activation> =>
  fc.record({
    group: fc.constantFrom(...SECTION_GROUPS),
    index: fc.nat({ max: playerCount - 1 }),
    mode: fc.constantFrom(...ACTIVATION_MODES),
  })

/** A player list plus a sequence of activations aimed only at real sections. */
const playersWithActivationsArb = fc
  .uniqueArray(playerNameArb, { minLength: 2, maxLength: 4 })
  .chain((playerNames) =>
    fc
      .array(activationArb(playerNames.length), { minLength: 1, maxLength: 10 })
      .map((activations) => ({ playerNames, activations }))
  )

/**
 * Renders all three groups, each with one section per player, mirroring how
 * the bet type breakdown, gambling ledger, and Head_To_Head_Section coexist on
 * the analytics screen — Requirement 9.11.
 */
function renderAllGroups(playerNames: readonly string[]) {
  return render(
    <>
      {SECTION_GROUPS.map((group) => (
        <section key={group} data-testid={`group-${group}`}>
          {playerNames.map((playerName, index) => (
            <CollapsiblePlayerSection key={sectionKey(group, index)} playerName={playerName}>
              <p data-testid={CONTENT_TEST_ID}>
                {group} for {playerName}
              </p>
            </CollapsiblePlayerSection>
          ))}
        </section>
      ))}
    </>
  )
}

/** What Requirement 9.11 observes about one section. */
interface SectionState {
  toggle: HTMLButtonElement
  expanded: boolean
  chevron: string | null
  hasContent: boolean
}

/** Reads every section in every group, keyed by group and position. */
function readAllGroups(container: HTMLElement): Map<SectionKey, SectionState> {
  const states = new Map<SectionKey, SectionState>()
  for (const group of SECTION_GROUPS) {
    const groupElement = container.querySelector(`[data-testid="group-${group}"]`)
    expect(groupElement).not.toBeNull()
    const toggles = (groupElement as HTMLElement).querySelectorAll<HTMLButtonElement>(TOGGLE_SELECTOR)
    toggles.forEach((toggle, index) => {
      const section = toggle.closest('.collapsible-player-section') as HTMLElement
      states.set(sectionKey(group, index), {
        toggle,
        expanded: toggle.getAttribute('aria-expanded') === 'true',
        chevron: section.querySelector(CHEVRON_SELECTOR)?.textContent ?? null,
        hasContent: section.querySelector(CONTENT_SELECTOR) !== null,
      })
    })
  }
  return states
}

describe('Property 29: Sections are independent', () => {
  /**
   * **Validates: Requirements 9.11**
   *
   * For any set of players and any sequence of toggle activations across the
   * bet type breakdown, gambling ledger, and Head_To_Head_Section, each
   * section's expanded state equals the parity of the number of activations of
   * its own toggle, and no activation changes the expanded state of any other
   * section — so from zero through all players may be expanded at once within
   * each group.
   */

  it('leaves every section at the parity of its own activation count', async () => {
    await fc.assert(
      fc.asyncProperty(playersWithActivationsArb, async ({ playerNames, activations }) => {
        cleanup()
        const user = setupUser()
        const { container } = renderAllGroups(playerNames)

        // Every group contributes one section per player, all collapsed
        const activationCounts = new Map<SectionKey, number>()
        for (const group of SECTION_GROUPS) {
          for (let index = 0; index < playerNames.length; index += 1) {
            activationCounts.set(sectionKey(group, index), 0)
          }
        }
        const initial = readAllGroups(container)
        expect(initial.size).toBe(SECTION_GROUPS.length * playerNames.length)
        for (const state of initial.values()) {
          expect(state.expanded).toBe(false)
        }

        for (const activation of activations) {
          const key = sectionKey(activation.group, activation.index)
          const target = readAllGroups(container).get(key)
          expect(target).toBeDefined()
          await activateToggle(user, (target as SectionState).toggle, activation.mode)
          activationCounts.set(key, (activationCounts.get(key) ?? 0) + 1)

          // After every activation, each section — target and bystander alike —
          // reflects only the parity of its own activations
          const states = readAllGroups(container)
          expect(states.size).toBe(SECTION_GROUPS.length * playerNames.length)
          for (const [sectionId, state] of states) {
            const expectedExpanded = (activationCounts.get(sectionId) ?? 0) % 2 === 1
            expect(state.expanded).toBe(expectedExpanded)
            expect(state.hasContent).toBe(expectedExpanded)
            expect(state.chevron).toBe(expectedExpanded ? EXPANDED_CHEVRON : COLLAPSED_CHEVRON)
          }
        }
      }),
      { numRuns: 100 }
    )
  }, 240_000)
})
