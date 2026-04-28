const CURRENCY_ROUNDING_TOLERANCE = 0.000001;

/** Round currency to cents while absorbing sub-cent floating-point drift. */
export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + CURRENCY_ROUNDING_TOLERANCE) * 100) / 100;
}

export function parseCurrency(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return roundCurrency(numeric);
}
