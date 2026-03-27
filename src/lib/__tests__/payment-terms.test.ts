import { describe, it, expect } from 'vitest';
import {
  daysToPreset,
  presetToDays,
  validateLateFeeRate,
  validatePaymentTermsDays,
  PAYMENT_TERMS_PRESETS,
} from '../payment-terms';

describe('payment-terms', () => {
  it('exposes preset day list', () => {
    expect(PAYMENT_TERMS_PRESETS).toEqual([7, 14, 30]);
  });

  describe('daysToPreset / presetToDays', () => {
    it('round-trips preset days', () => {
      for (const d of PAYMENT_TERMS_PRESETS) {
        const p = daysToPreset(d);
        expect(presetToDays(p)).toBe(d);
      }
    });

    it('maps non-preset days to custom', () => {
      expect(daysToPreset(21)).toBe('custom');
      expect(presetToDays('custom')).toBeNull();
    });
  });

  describe('validatePaymentTermsDays', () => {
    it('accepts 1 and 365', () => {
      expect(validatePaymentTermsDays(1)).toBeNull();
      expect(validatePaymentTermsDays(365)).toBeNull();
    });

    it('rejects non-integers, below 1, above 365', () => {
      expect(validatePaymentTermsDays(0)).not.toBeNull();
      expect(validatePaymentTermsDays(366)).not.toBeNull();
      expect(validatePaymentTermsDays(1.5)).not.toBeNull();
      expect(validatePaymentTermsDays(NaN)).not.toBeNull();
    });
  });

  describe('validateLateFeeRate', () => {
    it('accepts 0, 1.5, and 100', () => {
      expect(validateLateFeeRate(0)).toBeNull();
      expect(validateLateFeeRate(1.5)).toBeNull();
      expect(validateLateFeeRate(100)).toBeNull();
    });

    it('rejects negative, above 100, and NaN', () => {
      expect(validateLateFeeRate(-0.1)).not.toBeNull();
      expect(validateLateFeeRate(100.01)).not.toBeNull();
      expect(validateLateFeeRate(NaN)).not.toBeNull();
    });
  });
});
