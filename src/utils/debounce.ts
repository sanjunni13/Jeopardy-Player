/**
 * Creates a debounced version of the given function.
 * The debounced function delays invoking `fn` until `waitMs` milliseconds
 * have elapsed since the last call. Pending calls are cancelled if a new
 * call arrives within the wait window.
 *
 * @param fn - The function to debounce
 * @param waitMs - Milliseconds to wait after the last call before invoking
 * @returns A debounced wrapper with a `cancel()` method to clear any pending call
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  waitMs: number
): T & { cancel: () => void } {
  let timerId: ReturnType<typeof setTimeout> | null = null

  function debounced(...args: Parameters<T>): void {
    if (timerId !== null) {
      clearTimeout(timerId)
    }
    timerId = setTimeout(() => {
      timerId = null
      fn(...args)
    }, waitMs)
  }

  debounced.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId)
      timerId = null
    }
  }

  return debounced as T & { cancel: () => void }
}
