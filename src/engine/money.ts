/**
 * Money helpers. The engine keeps all amounts in integer cents so that
 * schedules sum exactly; dollars only appear at the input/display boundary.
 */

/** Rounds to the nearest integer, halves away from zero, tolerating float noise. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cannot round non-finite value: ${value}`);
  }
  // Trim IEEE-754 noise (e.g. 100.49999999999999) before deciding on the half.
  const magnitude = Math.floor(Number(Math.abs(value).toPrecision(15)) + 0.5);
  return value < 0 && magnitude !== 0 ? -magnitude : magnitude;
}

export function toCents(dollars: number): number {
  return roundHalfUp(dollars * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}
