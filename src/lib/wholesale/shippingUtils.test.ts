import { describe, expect, it } from 'vitest';
import { parseShippingAddress } from './shippingUtils';

describe('parseShippingAddress', () => {
  it('parses standard comma-separated US addresses with country', () => {
    const parsed = parseShippingAddress(
      '1200 Congress Ave, Austin, TX 78701, United States',
      'Salman Bashir'
    );
    expect(parsed).toEqual({
      fullName: 'Salman Bashir',
      addressLine1: '1200 Congress Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    });
  });

  it('parses standard comma-separated US addresses without country', () => {
    const parsed = parseShippingAddress('1200 Congress Ave, Austin, TX 78701');
    expect(parsed).toEqual({
      fullName: 'Wholesale Buyer',
      addressLine1: '1200 Congress Ave',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    });
  });

  it('parses multiline addresses', () => {
    const raw = `12620 FM 1960 W Ste A-4\nHouston, TX 77065`;
    const parsed = parseShippingAddress(raw, 'Himalayan Koh LLC');
    expect(parsed).toEqual({
      fullName: 'Himalayan Koh LLC',
      addressLine1: '12620 FM 1960 W Ste A-4',
      city: 'Houston',
      state: 'TX',
      postalCode: '77065',
      country: 'US',
    });
  });

  it('returns null on empty or single-word strings', () => {
    expect(parseShippingAddress('')).toBeNull();
    expect(parseShippingAddress('Austin')).toBeNull();
  });
});
