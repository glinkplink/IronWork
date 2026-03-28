import { describe, it, expect } from 'vitest';
import { buildGuestPreviewProfile } from '../guest-agreement-profile';

describe('buildGuestPreviewProfile', () => {
  it('maps owner name and phone; email stays null until account capture', () => {
    const p = buildGuestPreviewProfile({
      ownerFirstName: '  Pat  ',
      ownerLastName: 'Smith',
      ownerBusinessPhone: ' 5551234567 ',
    });
    expect(p.business_name).toBe('');
    expect(p.owner_name).toBe('Pat Smith');
    expect(p.email).toBeNull();
    expect(p.phone).toBe('5551234567');
  });

  it('uses null for empty owner and phone', () => {
    const p = buildGuestPreviewProfile({
      ownerFirstName: '',
      ownerLastName: '',
      ownerBusinessPhone: '',
    });
    expect(p.owner_name).toBeNull();
    expect(p.email).toBeNull();
    expect(p.phone).toBeNull();
  });
});
