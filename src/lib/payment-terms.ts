export const DEFAULT_PAYMENT_TERMS_DAYS = 14;
export const DEFAULT_LATE_FEE_RATE = 1.5;

export const PAYMENT_TERMS_PRESETS = [7, 14, 30] as const;

export type PaymentTermsPreset = 'net_7' | 'net_14' | 'net_30' | 'custom';

export function daysToPreset(days: number): PaymentTermsPreset {
  return (PAYMENT_TERMS_PRESETS as readonly number[]).includes(days)
    ? (`net_${days}` as PaymentTermsPreset)
    : 'custom';
}

export function presetToDays(preset: PaymentTermsPreset): number | null {
  if (preset === 'custom') return null;
  return parseInt(preset.replace('net_', ''), 10);
}

export function validatePaymentTermsDays(days: number): string | null {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return 'Payment terms must be between 1 and 365 days';
  }
  return null;
}

export function validateLateFeeRate(rate: number): string | null {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return 'Late fee rate must be between 0% and 100%';
  }
  return null;
}
