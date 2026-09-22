/**
 * Product shipping facts as they are read from WooCommerce.
 *
 * The packing profile used to be read from the old Supabase database, so the thing
 * worth testing is that nothing about this path assumes that any more: the weight comes
 * from the product, the profile from its registered meta, and an incomplete profile is
 * reported as absent rather than as a parcel nothing can be rated from.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWordPressStub,
  type WordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck_test';
  process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs_test';
});

import {
  PACKING_PROFILE_META_KEY,
  readOrderableProducts,
  __resetWeightUnitCacheForTests,
} from './packingProfile';
import { decodePackingProfileJson } from '../shippo/packing/packingProfileTag';

const realFetch = globalThis.fetch;

/** The store's own weight unit, which the reader resolves before it converts. */
function settingsRoute(unit: string): WordPressStubRoute {
  return {
    path: '/wc/v3/settings/products',
    body: [{ id: 'woocommerce_weight_unit', value: unit }],
  };
}

function useWordPress(routes: WordPressStubRoute[]): WordPressStub {
  const stub = createWordPressStub([settingsRoute('lbs'), ...routes]);
  globalThis.fetch = stub.fetch as unknown as typeof fetch;
  __resetWeightUnitCacheForTests();
  return stub;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const PROFILE = {
  productLengthIn: 12,
  productWidthIn: 8,
  productHeightIn: 6,
  boxLengthIn: 14,
  boxWidthIn: 10,
  boxHeightIn: 8,
  packagingWeightLbs: 0.5,
  unitsPerBox: 4,
  maxPackedWeightLbs: 45,
  shipsSeparately: false,
  canMix: true,
  fragile: false,
  stackable: true,
};

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: 2492,
    name: 'Himalayan Salt 6 lbs',
    slug: 'himalayan-salt-6-lbs',
    weight: '6',
    meta_data: [{ key: PACKING_PROFILE_META_KEY, value: JSON.stringify(PROFILE) }],
    ...overrides,
  };
}

describe('readOrderableProducts', () => {
  it('reads weight and packing profile from the store', async () => {
    const stub = useWordPress([{ path: '/wc/v3/products', body: [product()] }]);

    const facts = await readOrderableProducts(['2492']);

    const read = facts.get('2492');
    expect(read?.name).toBe('Himalayan Salt 6 lbs');
    expect(read?.weightLbs).toBe(6);
    expect(read?.packingProfile?.unitsPerBox).toBe(4);

    // Ids are sent as WooCommerce's `include` filter: without it a batch read would
    // return the whole catalog and rate parcels from the wrong products.
    const [call] = stub.callsTo('/wc/v3/products');
    expect(call.query.get('include')).toBe('2492');
  });

  it('converts a kilogram weight using the store setting, not an assumption', async () => {
    // A store configured in kilograms stores "10", which is 22.05 lbs. Reading it as
    // pounds would under-charge every shipment by more than half, so the unit comes
    // from the store's own settings rather than from a guess in the app.
    const stub = createWordPressStub([
      settingsRoute('kg'),
      { path: '/wc/v3/products', body: [product({ weight: '10', meta_data: [] })] },
    ]);
    globalThis.fetch = stub.fetch as unknown as typeof fetch;
    __resetWeightUnitCacheForTests();

    const facts = await readOrderableProducts([2492]);

    expect(facts.get('2492')?.weightLbs).toBeCloseTo(22.05, 1);
    expect(stub.callsTo('/wc/v3/settings/products')).toHaveLength(1);
  });

  it('reports no profile when the product has none, instead of inventing one', async () => {
    useWordPress([{ path: '/wc/v3/products', body: [product({ meta_data: [] })] }]);

    const facts = await readOrderableProducts([2492]);
    expect(facts.get('2492')?.packingProfile).toBeNull();
    expect(facts.get('2492')?.weightLbs).toBe(6);
  });

  it('drops ids the store could not hold rather than failing the whole read', async () => {
    const stub = useWordPress([{ path: '/wc/v3/products', body: [product()] }]);

    const facts = await readOrderableProducts(['2492', 'uuid-legacy-id', null, undefined, '']);

    expect([...facts.keys()]).toEqual(['2492']);
    expect(stub.callsTo('/wc/v3/products')).toHaveLength(1);
  });

  it('does not call the store at all when there is nothing to read', async () => {
    const stub = useWordPress([]);
    const facts = await readOrderableProducts([]);
    expect(facts.size).toBe(0);
    expect(stub.calls).toHaveLength(0);
  });
});

describe('decodePackingProfileJson', () => {
  it('accepts a complete profile, from JSON text or a parsed object', () => {
    expect(decodePackingProfileJson('2492', JSON.stringify(PROFILE))?.boxLengthIn).toBe(14);
    expect(decodePackingProfileJson('2492', PROFILE)?.unitsPerBox).toBe(4);
  });

  it('refuses an incomplete profile instead of filling in defaults', () => {
    // Half a profile is not a small parcel — it is a parcel whose size nobody has
    // said, and rating it would quote a price for a box that does not exist.
    expect(decodePackingProfileJson('2492', JSON.stringify({ ...PROFILE, boxLengthIn: 0 }))).toBeNull();
    expect(decodePackingProfileJson('2492', 'not json')).toBeNull();
    expect(decodePackingProfileJson('2492', '')).toBeNull();
    expect(decodePackingProfileJson('2492', null)).toBeNull();
  });
});
