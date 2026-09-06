// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PlayerBettingPanel } from './PlayerBettingPanel'
import { onChannelMessage } from '../../utils/sessionChannel'
import { formatCurrency } from '../../utils/currency'
import { GAMBLING_ALLOWANCE_AMOUNT } from '../../utils/gamblingAllowance'

const mockChannel = {
  send: vi.fn().mockResolvedValue('ok'),
} as unknown as import('@supabase/supabase-js').RealtimeChannel

/**
 * The broadcast event name every listener in the app subscribes to, read out of
 * the production `onChannelMessage` helper rather than hardcoded.
 */
const SUBSCRIBED_EVENT = (() => {
  let registered = ''
  const probe = {
    on: (type: string, filter: { event?: string }) => {
      if (type === 'broadcast' && filter?.event) registered = filter.event
      return probe
    },
  } as unknown as import('@supabase/supabase-js').RealtimeChannel
  onChannelMessage(probe, () => {})
  return registered
})()

const defaultBets = [
  { betType: 'round_leader', description: 'Who will lead after this round?' },
  { betType: 'most_incorrect', description: 'Who will get the most wrong?' },
]

function renderPanel(overrides = {}) {
  const defaultProps = {
    availableBets: defaultBets,
    playerBalance: 1000,
    timerDuration: 60,
    channel: mockChannel,
    playerName: 'Alice',
    players: ['Alice', 'Bob', 'Charlie'],
    onBettingDone: vi.fn(),
  }
  return render(<PlayerBettingPanel {...defaultProps} {...overrides} />)
}

describe('PlayerBettingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Cumulative wager constraint enforcement (Req 4.3)', () => {
    it('accepts a bet when wager is within balance', () => {
      renderPanel({ playerBalance: 500 })

      const wagerInput = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput, { target: { value: '200' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      // Bet should be placed locally (no error shown)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('rejects a wager of 0', () => {
      renderPanel()

      const wagerInput = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput, { target: { value: '0' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      expect(screen.getByRole('alert')).toHaveTextContent('Wager must be greater than zero')
    })

    it('rejects a wager that exceeds the player balance', () => {
      renderPanel({ playerBalance: 300 })

      const wagerInput = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput, { target: { value: '400' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      expect(screen.getByRole('alert')).toHaveTextContent(/Exceeds remaining balance/)
    })

    it('enforces cumulative wager constraint across multiple bets', () => {
      renderPanel({ playerBalance: 500 })

      // Place first bet: $300
      const wagerInput = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput, { target: { value: '300' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      // First bet accepted (no error)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      // Try to place second bet: $300 (cumulative would be 600 > 500)
      const wagerInput2 = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput2, { target: { value: '300' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      // Should show error about exceeding remaining balance
      expect(screen.getByRole('alert')).toHaveTextContent(/Exceeds remaining balance/)
    })

    it('allows a second bet when cumulative wagers stay within balance', () => {
      renderPanel({ playerBalance: 500 })

      // Place first bet: $200
      const wagerInput = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput, { target: { value: '200' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()

      // Place second bet: $200 (cumulative = 400, within 500)
      const wagerInput2 = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput2, { target: { value: '200' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      // Second bet also accepted
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('does not accept negative wager values (input rejects non-digit chars)', () => {
      renderPanel()

      const wagerInput = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput, { target: { value: '-50' } })

      // The component's onChange filters non-digit characters
      expect(wagerInput).toHaveValue('')
    })

    it('displays remaining balance accurately after placing bets', () => {
      renderPanel({ playerBalance: 1000 })

      // Initially shows full balance as available
      expect(screen.getByText(/Available: \$1,000/)).toBeInTheDocument()

      // Place first bet: $400
      const wagerInput = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput, { target: { value: '400' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      // Remaining balance should show $600
      expect(screen.getByText(/Available: \$600/)).toBeInTheDocument()
    })
  })

  describe('Button states (Req 3.5, 3.6, 3.7, 3.8)', () => {
    it('disables "Submit Bets" when no bets have been placed', () => {
      renderPanel()

      const submitBtn = screen.getByRole('button', { name: 'Submit Bets' })
      expect(submitBtn).toBeDisabled()
    })

    it('enables "Submit Bets" when at least one bet is placed', () => {
      renderPanel()

      // Place a bet
      const wagerInput = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput, { target: { value: '100' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      const submitBtn = screen.getByRole('button', { name: 'Submit Bets' })
      expect(submitBtn).toBeEnabled()
    })

    it('"Skip Betting" is always visible and calls onBettingDone directly', () => {
      const onBettingDone = vi.fn()
      renderPanel({ onBettingDone })

      const skipBtn = screen.getByRole('button', { name: 'Skip Betting' })
      expect(skipBtn).toBeInTheDocument()

      fireEvent.click(skipBtn)
      expect(onBettingDone).toHaveBeenCalledTimes(1)
      // Should NOT broadcast anything
      expect(mockChannel.send).not.toHaveBeenCalled()
    })

    it('displays submitError when channel is unavailable', () => {
      renderPanel({ channel: null })

      // Place a bet first
      const wagerInput = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput, { target: { value: '100' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      // Try to submit
      fireEvent.click(screen.getByRole('button', { name: 'Submit Bets' }))

      // Should show error
      expect(screen.getByText('Connection unavailable. Please try again.')).toBeInTheDocument()
    })
  })

  describe('Batch submission flow (Req 3.4, 3.5, 3.6, 3.9)', () => {
    it('sends exactly one channel.send call with all bets in payload on "Submit Bets"', () => {
      const onBettingDone = vi.fn()
      // Use 3 bet types so placing 2 doesn't trigger auto-finalize
      const threeBets = [
        { betType: 'round_leader', description: 'Who will lead after this round?' },
        { betType: 'most_incorrect', description: 'Who will get the most wrong?' },
        { betType: 'most_correct', description: 'Who will get the most correct?' },
      ]
      renderPanel({ onBettingDone, availableBets: threeBets })

      // Place first bet
      const wagerInput = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput, { target: { value: '100' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      // Place second bet (select the second available bet type)
      const betTypeSelect = screen.getByLabelText('Bet Type')
      fireEvent.change(betTypeSelect, { target: { value: 'most_incorrect' } })
      const wagerInput2 = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput2, { target: { value: '200' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      // Click "Submit Bets"
      fireEvent.click(screen.getByRole('button', { name: 'Submit Bets' }))

      // channel.send should be called exactly once
      expect(mockChannel.send).toHaveBeenCalledTimes(1)

      // Verify the payload contains all bets
      const sendMock = mockChannel.send as unknown as ReturnType<typeof vi.fn>
      const call = sendMock.mock.calls[0][0] as {
        type: string
        event: string
        payload: {
          type: string
          playerName: string
          bets: Array<{ betType: string; wager: number; prediction: string }>
        }
      }
      expect(call.type).toBe('broadcast')
      expect(call.event).toBe(SUBSCRIBED_EVENT)
      expect(call.payload.type).toBe('betting_submitted')
      expect(call.payload.playerName).toBe('Alice')
      expect(call.payload.bets).toHaveLength(2)
      expect(call.payload.bets[0]).toMatchObject({
        betType: 'round_leader',
        wager: 100,
        prediction: 'Bob',
      })
      expect(call.payload.bets[1]).toMatchObject({
        betType: 'most_incorrect',
        wager: 200,
        prediction: 'Bob',
      })

      // onBettingDone should have been called
      expect(onBettingDone).toHaveBeenCalledTimes(1)
    })

    it('"Submit Bets" is disabled when bet list is empty', () => {
      renderPanel()

      const submitBtn = screen.getByRole('button', { name: 'Submit Bets' })
      expect(submitBtn).toBeDisabled()

      // Confirm it has the disabled attribute
      expect(submitBtn).toHaveAttribute('disabled')
    })

    it('channel-unavailable produces error message and retains bet list', () => {
      const onBettingDone = vi.fn()
      renderPanel({ channel: null, onBettingDone })

      // Place a bet
      const wagerInput = screen.getByLabelText('Wager')
      fireEvent.change(wagerInput, { target: { value: '150' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      // Verify bet is shown in the list
      expect(screen.getByText(/round_leader|Who will lead/)).toBeInTheDocument()

      // Try to submit with null channel
      fireEvent.click(screen.getByRole('button', { name: 'Submit Bets' }))

      // Error message should appear
      expect(screen.getByRole('alert')).toHaveTextContent('Connection unavailable. Please try again.')

      // Bet list should be retained (bet still visible)
      expect(screen.getByText('$150')).toBeInTheDocument()

      // onBettingDone should NOT have been called
      expect(onBettingDone).not.toHaveBeenCalled()

      // Submit button should still be enabled (bets are still present)
      const submitBtn = screen.getByRole('button', { name: 'Submit Bets' })
      expect(submitBtn).toBeEnabled()
    })
  })

  describe('Allowance labelling (Req 1.7, 1.13)', () => {
    it('shows the allowance label with its amount and the Real_Balance for an Allowance_Player', () => {
      renderPanel({
        playerBalance: -200,
        budget: { realBalance: -200, unspent: GAMBLING_ALLOWANCE_AMOUNT, isAllowance: true },
      })

      // Req 1.7 — allowance remaining, as Currency_Formatter output verbatim…
      const allowanceLine = screen.getByText(
        `Allowance remaining: ${formatCurrency(GAMBLING_ALLOWANCE_AMOUNT)}`
      )
      expect(allowanceLine).toBeInTheDocument()

      // …together with the Real_Balance, on a separate, distinctly-classed line
      const balanceLine = screen.getByText(`Your balance: ${formatCurrency(-200)}`)
      expect(balanceLine).toBeInTheDocument()
      expect(balanceLine.className).not.toEqual(allowanceLine.className)

      expect(screen.queryByText(/^Available:/)).not.toBeInTheDocument()
    })

    it('draws the allowance label down as wagers are placed', () => {
      renderPanel({
        playerBalance: 0,
        budget: { realBalance: 0, unspent: 300, isAllowance: true },
      })

      expect(
        screen.getByText(`Allowance remaining: ${formatCurrency(300)}`)
      ).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Wager'), { target: { value: '120' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      expect(
        screen.getByText(`Allowance remaining: ${formatCurrency(180)}`)
      ).toBeInTheDocument()
      expect(screen.getByText(`Max: ${formatCurrency(180)}`)).toBeInTheDocument()
      // Real_Balance is untouched by an allowance-funded wager
      expect(screen.getByText(`Your balance: ${formatCurrency(0)}`)).toBeInTheDocument()
    })

    it('names the allowance, not the balance, when an Allowance_Player over-commits', () => {
      renderPanel({
        playerBalance: -1000,
        budget: { realBalance: -1000, unspent: GAMBLING_ALLOWANCE_AMOUNT, isAllowance: true },
      })

      fireEvent.change(screen.getByLabelText('Wager'), { target: { value: '600' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      expect(screen.getByRole('alert')).toHaveTextContent(
        `Exceeds remaining allowance (${formatCurrency(GAMBLING_ALLOWANCE_AMOUNT)})`
      )
    })

    it('shows no allowance label and no allowance amount for a Real_Balance-funded player', () => {
      renderPanel({
        playerBalance: 1200,
        budget: { realBalance: 1200, unspent: 900, isAllowance: false },
      })

      // Req 1.13 — unspent budget plus Real_Balance, no allowance wording anywhere
      expect(screen.getByText(`Available: ${formatCurrency(900)}`)).toBeInTheDocument()
      expect(screen.getByText(`Your balance: ${formatCurrency(1200)}`)).toBeInTheDocument()
      expect(screen.queryByText(/[Aa]llowance/)).not.toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Wager'), { target: { value: '950' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Bet' }))

      expect(screen.getByRole('alert')).toHaveTextContent(
        `Exceeds remaining balance (${formatCurrency(900)})`
      )
    })

    it('shows no allowance label when no budget was broadcast (older tab fallback)', () => {
      renderPanel({ playerBalance: 400 })

      expect(screen.getByText(`Available: ${formatCurrency(400)}`)).toBeInTheDocument()
      expect(screen.getByText(`Your balance: ${formatCurrency(400)}`)).toBeInTheDocument()
      expect(screen.queryByText(/[Aa]llowance/)).not.toBeInTheDocument()
    })
  })
})
