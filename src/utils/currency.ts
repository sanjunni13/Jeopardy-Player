/**
 * Shared monetary formatting. The single source of every currency display
 * string in the application (Requirement 5).
 *
 * Both formatters take one numeric argument and no locale, currency, or
 * option argument. Callers must never prepend a sign of their own.
 */

/** Rounds half away from zero so 0.5 → 1 and -0.5 → -1. */
export function toWholeDollars(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value))
}

/**
 * Currency_Formatter. Renders a balance or absolute amount.
 * Negative → `-$1,000`. Positive → `$1,000`. Zero and -0 → `$0`.
 * Non-finite input → empty string.
 *
 * `Math.sign(-0)` is `-0` and `-0 < 0` is `false`, so `-0` takes the
 * positive branch and renders `$0` without a special case.
 */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return ''
  const whole = toWholeDollars(value)
  const grouped = Math.abs(whole).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  })
  return whole < 0 ? `-$${grouped}` : `$${grouped}`
}

/**
 * Signed_Change_Formatter. Renders a gain, loss, profit, or net impact.
 * Positive → `+$1,000`. Negative → `-$1,000`. Zero → `$0`.
 * Non-finite input → empty string.
 */
export function formatSignedChange(value: number): string {
  if (!Number.isFinite(value)) return ''
  const whole = toWholeDollars(value)
  return whole > 0 ? `+${formatCurrency(whole)}` : formatCurrency(whole)
}
