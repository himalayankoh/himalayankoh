import { describe, expect, it, vi } from 'vitest';
import {
  availableProviders,
  compareRates,
  createLiveFreightProvider,
  isRateUsable,
  manualRatesProvider,
  preferredRate,
  rateFreshness,
  rateTotal,
  unconfiguredProvider,
} from './freight';
import type { FreightRate } from './types';

const mockRate = (overrides: Partial<FreightRate> = {}): FreightRate => ({
  id: 'r_test_1',
  source: 'manual',
  provider: 'Direct Forwarder',
  originPort: 'PKKHI',
  destinationPort: 'USNYC',
  containerType: '40HC',
  carrier: 'Maersk Line',
  currency: 'USD',
  oceanFreight: 3400,
  surcharges: [{ label: 'BAF', amount: 165 }],
  transitDays: 30,
  retrievedAt: '2026-09-01T00:00:00.000Z',
  validUntil: '2026-10-15T00:00:00.000Z',
  providerReference: 'FWD-101',
  notes: 'Manual test rate',
  ...overrides,
});

describe('FreightProvider & Rate Logic', () => {
  it('correctly calculates total rate including all surcharges', () => {
    const rate = mockRate({
      oceanFreight: 3000,
      surcharges: [
        { label: 'BAF', amount: 150 },
        { label: 'ISPS', amount: 35 },
      ],
    });
    expect(rateTotal(rate)).toBe(3185);
  });

  it('evaluates rate freshness accurately against validity date', () => {
    const rate = mockRate({ validUntil: '2026-10-01T00:00:00.000Z' });
    const before = new Date('2026-09-20T00:00:00.000Z');
    const after = new Date('2026-10-05T00:00:00.000Z');

    expect(isRateUsable(rate, before)).toBe(true);
    expect(rateFreshness(rate, before)).toBe('VALID');

    expect(isRateUsable(rate, after)).toBe(false);
    expect(rateFreshness(rate, after)).toBe('EXPIRED');

    const noExpiry = mockRate({ validUntil: null });
    expect(isRateUsable(noExpiry)).toBe(false);
    expect(rateFreshness(noExpiry)).toBe('UNKNOWN');
  });

  it('orders rates by total cost and filters preferred usable rates by currency', () => {
    const cheap = mockRate({ id: 'cheap', oceanFreight: 2000, surcharges: [] });
    const expensive = mockRate({ id: 'exp', oceanFreight: 4000, surcharges: [] });
    const expired = mockRate({ id: 'exp_cheap', oceanFreight: 1500, surcharges: [], validUntil: '2026-08-01T00:00:00.000Z' });

    const at = new Date('2026-09-15T00:00:00.000Z');
    const sorted = compareRates([expensive, cheap, expired], at);
    expect(sorted.map((r) => r.rate.id)).toEqual(['exp_cheap', 'cheap', 'exp']);
    expect(sorted[0].freshness).toBe('EXPIRED');
    expect(sorted[1].freshness).toBe('VALID');

    // preferredRate picks the cheapest VALID rate of matching currency
    const chosen = preferredRate([expensive, cheap, expired], 'USD', at);
    expect(chosen?.id).toBe('cheap');
  });

  it('manualRatesProvider matches exact lane and returns manual source', async () => {
    const rate = mockRate();
    const provider = manualRatesProvider([rate]);

    const hit = await provider.getOceanRates({
      originPort: 'PKKHI',
      destinationPort: 'USNYC',
      containerType: '40HC',
    });
    expect(hit).toHaveLength(1);
    expect(hit[0].source).toBe('manual');
    expect(hit[0].id).toBe(rate.id);

    const miss = await provider.getOceanRates({
      originPort: 'CNSHA',
      destinationPort: 'USLAX',
      containerType: '20FT',
    });
    expect(miss).toHaveLength(0);
  });

  it('unconfiguredProvider throws an honest descriptive error', async () => {
    const unconf = unconfiguredProvider('custom', 'Custom Cargo', 'Missing license');
    expect(unconf.configured).toBe(false);
    await expect(
      unconf.getOceanRates({ originPort: 'A', destinationPort: 'B', containerType: '20FT' })
    ).rejects.toThrow('Custom Cargo is not configured: Missing license');
  });

  it('createLiveFreightProvider falls back to manual rates when unconfigured', async () => {
    const manual = mockRate();
    const live = createLiveFreightProvider(
      { provider: 'freightos', apiKey: '' },
      [manual]
    );

    expect(live.configured).toBe(false);
    const rates = await live.getOceanRates({
      originPort: 'PKKHI',
      destinationPort: 'USNYC',
      containerType: '40HC',
    });
    expect(rates).toHaveLength(1);
    expect(rates[0].source).toBe('manual');
    expect(rates[0].id).toBe(manual.id);
  });

  it('createLiveFreightProvider calls API when configured and tags source as api', async () => {
    const manual = mockRate();
    const live = createLiveFreightProvider(
      {
        provider: 'freightos',
        apiKey: 'test_key',
        apiBase: 'http://example.com/api',
      },
      [manual]
    );

    expect(live.configured).toBe(true);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rates: [
          {
            price: 3650,
            currency: 'USD',
            carrier: 'CMA CGM',
            transitDays: 28,
            validUntil: '2026-11-01',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    try {
      const rates = await live.getOceanRates({
        originPort: 'PKKHI',
        destinationPort: 'USNYC',
        containerType: '40HC',
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(rates).toHaveLength(1);
      expect(rates[0].source).toBe('api');
      expect(rates[0].oceanFreight).toBe(3650);
      expect(rates[0].carrier).toBe('CMA CGM');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('createLiveFreightProvider falls back to manual rates if live API call fails', async () => {
    const manual = mockRate();
    const live = createLiveFreightProvider(
      {
        provider: 'freightos',
        apiKey: 'test_key',
        apiBase: 'http://example.com/api',
      },
      [manual]
    );

    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    vi.stubGlobal('fetch', mockFetch);

    try {
      const rates = await live.getOceanRates({
        originPort: 'PKKHI',
        destinationPort: 'USNYC',
        containerType: '40HC',
      });

      expect(rates).toHaveLength(1);
      expect(rates[0].source).toBe('manual');
      expect(rates[0].id).toBe(manual.id);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('availableProviders returns only manual provider when no live API key exists', () => {
    const manual = mockRate();
    const providers = availableProviders({ provider: 'freightos', apiKey: '' }, [manual]);
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe('manual');
  });

  it('availableProviders returns live and fallback manual providers when key exists', () => {
    const manual = mockRate();
    const providers = availableProviders({ provider: 'freightos', apiKey: 'valid_key' }, [manual]);
    expect(providers).toHaveLength(2);
    expect(providers[0].id).toBe('freightos');
    expect(providers[1].id).toBe('manual');
  });
});
