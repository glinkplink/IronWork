export const DEFAULT_TAX_RATE = 0.06;

export function normalizeTaxRate(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_TAX_RATE;
  return Math.max(0, value as number);
}

export function taxRateToPercentValue(rate: number | null | undefined): string {
  return (normalizeTaxRate(rate) * 100).toString();
}

export function percentValueToTaxRate(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed) / 100;
}
