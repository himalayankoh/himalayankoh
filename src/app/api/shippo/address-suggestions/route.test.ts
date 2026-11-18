import { beforeEach, describe, expect, it, vi } from 'vitest';

const { validate } = vi.hoisted(() => ({ validate: vi.fn() }));

vi.mock('@/lib/shippo/server/validateAddress', () => ({
  validateShippingAddress: validate,
}));

vi.mock('@/lib/shippo/config', () => ({
  resolveShippoConfigError: async () => null,
}));

vi.mock('@/lib/http/clientIp', () => ({
  clientIp: () => '203.0.113.10',
}));

vi.mock('@/lib/http/originAllowlist', () => ({
  isAllowedRequestOrigin: () => true,
}));

vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: () => ({ allowed: true, resetAt: Date.now() + 60_000 }),
}));

import { POST } from './route';
import type { CheckoutShippingAddress } from '@/lib/shippo/types';

const address: CheckoutShippingAddress = {
  fullName: 'Khan salman',
  addressLine1: 'BLOCK DR 4027',
  addressLine2: 'apt 216',
  city: 'IRVING',
  state: 'TX',
  postalCode: '75038',
  country: 'United States',
};

const corrected: CheckoutShippingAddress = {
  ...address,
  addressLine1: '4027 Block Dr Apt 216',
  addressLine2: 'Apt 216',
  city: 'Irving',
  postalCode: '75038-7733',
};

function requestFor(value: CheckoutShippingAddress) {
  return new Request('https://himalayankoh.com/api/shippo/address-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: value }),
  });
}

describe('POST /api/shippo/address-suggestions', () => {
  beforeEach(() => {
    validate.mockReset();
  });

  it('returns the standard layout when the typed layout is ambiguous', async () => {
    validate.mockImplementation(async (input: CheckoutShippingAddress) => {
      if (input.addressLine1 === 'BLOCK DR 4027') {
        return {
          isValid: false,
          messages: ['Multiple addresses were found.'],
          normalizedAddress: input,
          source: 'shippo',
        };
      }
      return {
        isValid: true,
        messages: [],
        normalizedAddress: corrected,
        recommendedAddress: corrected,
        source: 'shippo',
      };
    });

    const response = await POST(requestFor(address));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.original.isValid).toBe(false);
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0]).toMatchObject({
      addressLine1: '4027 Block Dr',
      addressLine2: 'Apt 216',
      city: 'Irving',
      postalCode: '75038-7733',
    });
  });

  it('does not reorder a non-US address', async () => {
    validate.mockResolvedValue({
      isValid: false,
      messages: ['Address could not be validated.'],
      normalizedAddress: { ...address, country: 'Canada' },
      source: 'shippo',
    });

    const response = await POST(requestFor({ ...address, country: 'Canada' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.suggestions).toEqual([]);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('does not spend extra validation calls on an address that already passes', async () => {
    const valid = {
      isValid: true,
      messages: [],
      normalizedAddress: address,
      source: 'shippo',
    };
    validate.mockResolvedValue(valid);

    const response = await POST(requestFor(address));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.suggestions).toEqual([]);
    expect(validate).toHaveBeenCalledTimes(1);
  });
});
