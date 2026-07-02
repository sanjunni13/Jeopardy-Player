import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from './debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not invoke the function before the wait window elapses', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('a')
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()
  })

  it('invokes the function once after the wait window elapses', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('a')
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('a')
  })

  it('coalesces multiple rapid calls into a single invocation', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    // Simulate 3 rapid buzz events within the window
    debounced('buzz-1')
    vi.advanceTimersByTime(50)
    debounced('buzz-2')
    vi.advanceTimersByTime(50)
    debounced('buzz-3')

    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('uses the arguments from the last call in the window', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('first')
    vi.advanceTimersByTime(100)
    debounced('second')
    vi.advanceTimersByTime(100)
    debounced('third')

    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledWith('third')
  })

  it('resets the timer on each call within the window', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('a')
    vi.advanceTimersByTime(250)  // almost there, but...
    debounced('b')               // ...reset the timer
    vi.advanceTimersByTime(250)  // still not 300ms since last call
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)   // now 300ms since last call
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('b')
  })

  it('fires again after the window if called again after a quiet period', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    // First burst
    debounced('a')
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)

    // Second burst after silence
    debounced('b')
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenNthCalledWith(2, 'b')
  })

  it('cancel() prevents the pending invocation', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('a')
    vi.advanceTimersByTime(150)
    debounced.cancel()

    vi.advanceTimersByTime(300)
    expect(fn).not.toHaveBeenCalled()
  })

  it('cancel() is a no-op when no call is pending', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    // Should not throw
    expect(() => debounced.cancel()).not.toThrow()
  })

  it('works with multiple arguments', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 300)

    debounced('session-id', { clueActive: true, queue: [], lockedOut: [], systemLocked: false })
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledWith('session-id', {
      clueActive: true,
      queue: [],
      lockedOut: [],
      systemLocked: false,
    })
  })
})
