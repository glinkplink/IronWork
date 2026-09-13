import { describe, expect, it } from 'vitest';
import { toUserFacingError } from '../user-facing-error';

describe('toUserFacingError', () => {
  it('rewrites browser fetch failures', () => {
    expect(toUserFacingError('Failed to fetch')).toBe(
      'Could not reach IronWork. Check your connection and try again.'
    );
    expect(toUserFacingError('TypeError: Failed to fetch')).toBe(
      'Could not reach IronWork. Check your connection and try again.'
    );
  });

  it('keeps server-provided messages', () => {
    expect(toUserFacingError('Invalid login credentials')).toBe('Invalid login credentials');
  });
});
