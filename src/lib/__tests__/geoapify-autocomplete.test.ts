import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGeoapifyAddressSuggestions } from '../geoapify-autocomplete';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchGeoapifyAddressSuggestions', () => {
  it('prefers housenumber and street over amenity address_line1', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              address_line1: 'White House',
              address_line2: '1600 Pennsylvania Avenue Northwest, Washington, DC 20500, United States of America',
              housenumber: '1600',
              street: 'Pennsylvania Avenue Northwest',
              city: 'Washington',
              state_code: 'DC',
              postcode: '20500',
              formatted:
                'White House, 1600 Pennsylvania Avenue Northwest, Washington, DC 20500, United States of America',
            },
          ],
        }),
      })
    );

    const out = await fetchGeoapifyAddressSuggestions('1600 Pennsylvania', 'test-key');
    expect(out).toHaveLength(1);
    expect(out[0].street).toBe('1600 Pennsylvania Avenue Northwest');
    expect(out[0].city).toBe('Washington');
    expect(out[0].state).toBe('DC');
    expect(out[0].zip).toBe('20500');
  });
});
