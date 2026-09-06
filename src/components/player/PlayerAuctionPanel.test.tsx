// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { PlayerAuctionPanel } from './PlayerAuctionPanel'
import { formatCurrency } from '../../utils/currency'
import { GAMBLING_ALLOWANCE_AMOUNT } from '../../utils/gamblingAllowance'

// Mock the broadcastMessage utility
vi.mock('../../utils/sessionChannel', () => ({
  broadcastMessage: vi.fn().mockResolvedValue(undefined),
}))

import { broadcastMessage } from '../../utils/sessionChannel'

const mockChannel = {
  send: vi.fn().mockResolvedValue('ok'),
} as unknown as import('@supabase/supabase-js').RealtimeChannel

function renderPanel(overrides = {}) {
  const defaultProps = {
    category: 'Science',
    categoryIndex: 0,
    roundName: 'round-1',
    playerBalance: 1000,
    timerDuration: 30,
    channel: mockChannel,
    playerName: 'Alice',
    onBidSubmitted: vi.fn(),
  }
  return render(<PlayerAuctionPanel {...defaultProps} {...overrides} />)
}

describe('PlayerAuctionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Validation rejects invalid bids (Req 3.3)', () => {
    it('rejects a bid of 0', async () => {
      renderPanel()

      const input = screen.getByLabelText('Your Bid')
      // The input only allows digit characters via onChange filter, so "0" is valid input text
      fireEvent.change(input, { target: { value: '0' } })
      fireEvent.click(screen.getByRole('button', { name: 'Place Bid' }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Bid must be greater than zero')
      })
    })

    it('rejects a negative bid (input does not accept negative chars)', () => {
      renderPanel()

      const input = screen.getByLabelText('Your Bid')
      // The component's onChange filters out non-digit chars, so "-5" won't register
      fireEvent.change(input, { target: { value: '-5' } })
      // Since regex /^\d*$/ rejects "-5", value stays empty
      expect(input).toHaveValue('')
    })

    it('rejects a bid that exceeds the player balance', async () => {
      renderPanel({ playerBalance: 500 })

      const input = screen.getByLabelText('Your Bid')
      fireEvent.change(input, { target: { value: '600' } })
      fireEvent.click(screen.getByRole('button', { name: 'Place Bid' }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Maximum bid is $500')
      })
    })

    it('rejects an empty bid submission', async () => {
      renderPanel()

      fireEvent.click(screen.getByRole('button', { name: 'Place Bid' }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid number')
      })
    })
  })

  describe('Input disabled after bid submission (Req 3.3)', () => {
    it('shows confirmation and hides input after successful bid', async () => {
      const onBidSubmitted = vi.fn()
      renderPanel({ onBidSubmitted })

      const input = screen.getByLabelText('Your Bid')
      fireEvent.change(input, { target: { value: '200' } })
      fireEvent.click(screen.getByRole('button', { name: 'Place Bid' }))

      await waitFor(() => {
        expect(screen.getByText(/Bid submitted/)).toBeInTheDocument()
      })

      // Input should no longer be in the document (panel shows confirmation state)
      expect(screen.queryByLabelText('Your Bid')).not.toBeInTheDocument()
      expect(onBidSubmitted).toHaveBeenCalledTimes(1)
    })

    it('broadcasts auction_bid message with correct payload on submission', async () => {
      renderPanel({ playerBalance: 1000, playerName: 'Bob', categoryIndex: 2 })

      const input = screen.getByLabelText('Your Bid')
      fireEvent.change(input, { target: { value: '350' } })
      fireEvent.click(screen.getByRole('button', { name: 'Place Bid' }))

      await waitFor(() => {
        expect(broadcastMessage).toHaveBeenCalledWith(mockChannel, {
          type: 'auction_bid',
          playerName: 'Bob',
          categoryIndex: 2,
          amount: 350,
        })
      })
    })
  })

  describe('Allowance labelling (Req 1.7, 1.13)', () => {
    it('shows the allowance label with its amount and the Real_Balance for an Allowance_Player', () => {
      renderPanel({
        playerBalance: -750,
        budget: { realBalance: -750, unspent: GAMBLING_ALLOWANCE_AMOUNT, isAllowance: true },
      })

      // Req 1.7 — allowance remaining, as Currency_Formatter output verbatim…
      const allowanceLine = screen.getByText(
        `Allowance remaining: ${formatCurrency(GAMBLING_ALLOWANCE_AMOUNT)}`
      )
      expect(allowanceLine).toBeInTheDocument()

      // …together with the Real_Balance, on a separate, distinctly-classed line
      const balanceLine = screen.getByText(`Your balance: ${formatCurrency(-750)}`)
      expect(balanceLine).toBeInTheDocument()
      expect(balanceLine.className).not.toEqual(allowanceLine.className)

      // The generic "Available" wording belongs to Real_Balance-funded players only
      expect(screen.queryByText(/^Available:/)).not.toBeInTheDocument()
    })

    it('reflects a partially spent allowance in the label amount and the range hint', () => {
      renderPanel({
        playerBalance: 0,
        budget: { realBalance: 0, unspent: 175, isAllowance: true },
      })

      expect(
        screen.getByText(`Allowance remaining: ${formatCurrency(175)}`)
      ).toBeInTheDocument()
      expect(
        screen.getByText(`Enter a bid between ${formatCurrency(1)} and ${formatCurrency(175)}`)
      ).toBeInTheDocument()
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
    })

    it('shows no allowance label when no budget was broadcast (older tab fallback)', () => {
      renderPanel({ playerBalance: 400 })

      expect(screen.getByText(`Available: ${formatCurrency(400)}`)).toBeInTheDocument()
      expect(screen.getByText(`Your balance: ${formatCurrency(400)}`)).toBeInTheDocument()
      expect(screen.queryByText(/[Aa]llowance/)).not.toBeInTheDocument()
    })
  })
})
