/**
 * What the carrier is actually asked to price.
 *
 * The packing maths is pinned in `../packing/packing.test.ts`; this file pins the step
 * after it, which no unit test covered before: `fetchShippoRates` turns each calculated
 * box into its own `/shipments/` request and never collapses a multi-box order into one
 * heavier parcel.
 *
 * That distinction is the money. Seven 2 lb licks are two boxes of 12 lb and 2 lb, and
 * the wrong implementation asks the carrier to price a single 14 lb box — a different
 * (and, on a USPS weight band, a cheaper) number than the two boxes that really ship.
 * A test at the parcel-list level cannot catch it, because the collapse happened on the
 * way to the request, so this asserts the requests themselves.
 *
 * No network and no Shippo account: `globalThis.fetch` is stubbed at the same seam the
 * app uses, so the WordPress reads, the parcel payloads, the per-box requests and the
 * rate combination all run for real. A live Shippo key is refused outside production by
 * design (`server/client.ts`), so a test key is used — which is exactly what a test
 * environment is meant to.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWordPressStub,
  type WordPressStub,
  type WordPressStubRoute,
} from '@/lib/backend/wordpressTestServer';

vi.hoisted(() => {
  process.env.WORDPRESS_BASE_URL = 'https://himalayankoh.test/staging';
  process.env.WOOCOMMERCE_CONSUMER_KEY = 'ck_test';
  process.env.WOOCOMMERCE_CONSUMER_SECRET = 'cs_test';
  // A test key, so the fail-closed live-key guard is satisfied rather than bypassed.
  process.env.SHIPPO_API_KEY = 'shippo_test_ratings';
  process.env.SHIPPO_FROM_NAME = 'Himalayan Koh';
  process.env.SHIPPO_FROM_STREET1 = '12620 FM 1960 W Ste A-4';
  process.env.SHIPPO_FROM_CITY = 'Houston';
  process.env.SHIPPO_FROM_STATE = 'TX';
  process.env.SHIPPO_FROM_ZIP = '77065';
  process.env.SHIPPO_FROM_COUNTRY = 'US';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://preview.himalayankoh.test';
});

import { fetchShippoRates, splitShippoRateIds } from './rates';
import { __resetWeightUnitCacheForTests } from '@/lib/woo/packingProfile';

/** The two approved products, stubbed with the weights the owner's packing rules use. */
const LICK_2LB = {
  id: 9101,
  slug: 'qa-2lb-livestock-salt-lick',
  name: '2 lb Himalayan Livestock Salt Lick',
  weight: '2',
  meta_data: [],
};

const LICK_6LB = {
  id: 9102,
  slug: 'qa-6lb-livestock-salt-lick',
  name: '6 lb Himalayan Livestock Salt Lick',
  weight: '6',
  meta_data: [],
};

const BLOCK_30LB = {
  id: 9103,
  slug: 'qa-30lb-block',
  name: '30 lb Himalayan Rock Salt Block',
  weight: '30',
  meta_data: [],
};

const DESTINATION = {
  fullName: 'QA Buyer',
  addressLine1: '1 Main St',
  city: 'Austin',
  state: 'TX',
  postalCode: '78701',
  country: 'US',
};

interface StubParcel {
  length: string;
  width: string;
  height: string;
  distance_unit: string;
  weight: string;
  mass_unit: string;
}

interface RecordedShipment {
  address_from: { city: string; state: string; zip: string };
  address_to: { city: string; state: string; zip: string };
  parcels: StubParcel[];
}

interface ShippoStub {
  shipments: RecordedShipment[];
}

const realFetch = globalThis.fetch;

/**
 * Both services are offered on every box, priced from the weight the box was sent with,
 * so a combined amount says what was summed: USPS Ground Advantage is $5 + 50c/lb and
 * Priority Mail is $9 + 75c/lb.
 */
function shipmentResponse(boxNumber: number, weightLbs: number) {
  return {
    rates: [
      {
        object_id: `rate-${boxNumber}-ground`,
        amount: (5 + weightLbs * 0.5).toFixed(2),
        currency: 'USD',
        provider: 'USPS',
        servicelevel: { name: 'Ground Advantage', token: 'ground_advantage' },
        estimated_days: 3,
      },
      {
        object_id: `rate-${boxNumber}-priority`,
        amount: (9 + weightLbs * 0.75).toFixed(2),
        currency: 'USD',
        provider: 'USPS',
        servicelevel: { name: 'Priority Mail', token: 'priority' },
        estimated_days: 2,
      },
    ],
  };
}

const STORE_ROUTES: WordPressStubRoute[] = [
  { path: '/wc/v3/settings/products', body: [{ id: 'woocommerce_weight_unit', value: 'lbs' }] },
  { path: '/wc/v3/products', body: [LICK_2LB, LICK_6LB, BLOCK_30LB] },
];

let wp: WordPressStub;
let shippo: ShippoStub;

beforeEach(() => {
  shippo = { shipments: [] };
  wp = createWordPressStub(STORE_ROUTES);
  __resetWeightUnitCacheForTests();

  globalThis.fetch = (async (input: unknown, init?: { body?: string }) => {
    const url = String(input);
    if (url.startsWith('https://api.goshippo.com')) {
      const body = JSON.parse(init?.body ?? '{}') as RecordedShipment;
      shippo.shipments.push(body);
      const weight = Number(body.parcels[0]?.weight ?? 0);
      return new Response(JSON.stringify(shipmentResponse(shippo.shipments.length, weight)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return wp.fetch(input, init);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function boxesSent(): StubParcel[] {
  return shippo.shipments.flatMap((shipment) => shipment.parcels);
}

/** Seven 2 lb licks: two boxes of 12 lb and 2 lb, not one box of 14 lb. */
describe('a multi-box order reaches Shippo as one shipment per box', () => {
  it('sends seven 2 lb licks as a 12 lb box and a 2 lb box, never as one 14 lb box', async () => {
    await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [{ productId: '9101', quantity: 7 }],
    });

    expect(shippo.shipments).toHaveLength(2);
    expect(boxesSent().map((parcel) => parcel.weight)).toEqual(['12', '2']);
    expect(boxesSent().map((parcel) => parcel.weight)).not.toContain('14');
  });

  it('puts exactly one parcel in each shipment', async () => {
    await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [{ productId: '9101', quantity: 13 }],
    });

    expect(shippo.shipments).toHaveLength(3);
    for (const shipment of shippo.shipments) {
      expect(shipment.parcels).toHaveLength(1);
    }
    expect(boxesSent().map((parcel) => parcel.weight)).toEqual(['12', '12', '2']);
  });

  it('sends every box in the approved 10 x 10 x 6 carton', async () => {
    await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [
        { productId: '9101', quantity: 7 },
        { productId: '9102', quantity: 5 },
      ],
    });

    expect(boxesSent()).toHaveLength(4);
    for (const parcel of boxesSent()) {
      expect(parcel).toMatchObject({
        length: '10',
        width: '10',
        height: '6',
        distance_unit: 'in',
        mass_unit: 'lb',
      });
    }
  });

  it('sends the 30 lb block as one parcel per block, in its own carton', async () => {
    await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [{ productId: '9103', quantity: 2 }],
    });

    expect(shippo.shipments).toHaveLength(2);
    expect(boxesSent()).toHaveLength(2);
    for (const parcel of boxesSent()) {
      expect(parcel).toMatchObject({
        length: '8.5',
        width: '7.5',
        height: '6.5',
        weight: '30',
        distance_unit: 'in',
        mass_unit: 'lb',
      });
    }
    // Two blocks are two 30 lb boxes, not one 60 lb box.
    expect(boxesSent().map((parcel) => parcel.weight)).not.toContain('60');
  });

  it('sends a mixed cart as one parcel per box, size by size', async () => {
    // The owner's example: 1 x 2 lb + 1 x 6 lb is two parcels, never one of 8 lb.
    await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [
        { productId: '9101', quantity: 1 },
        { productId: '9102', quantity: 1 },
      ],
    });

    expect(shippo.shipments).toHaveLength(2);
    expect(boxesSent().map((parcel) => parcel.weight)).toEqual(['2', '6']);
    expect(boxesSent().map((parcel) => parcel.weight)).not.toContain('8');
  });

  it('asks the store for every product in the cart, not only the last one', async () => {
    // The shape of this read is what a mixed cart turns on. Asked as repeated bare
    // `include` keys, WooCommerce answers with the last id alone, and every other line
    // reached the packer with no name, no slug and no weight — so a cart of two
    // products could not be priced at all.
    await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [
        { productId: '9101', quantity: 1 },
        { productId: '9103', quantity: 1 },
      ],
    });

    const [read] = wp.callsTo('/wc/v3/products');
    expect(read.query.getAll('include[]')).toEqual(['9101', '9103']);
    expect(boxesSent().map((parcel) => parcel.weight)).toEqual(['2', '30']);
  });

  it('keeps the block carton and the lick cartons apart in one request', async () => {
    await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [
        { productId: '9101', quantity: 7 },
        { productId: '9102', quantity: 5 },
        { productId: '9103', quantity: 1 },
      ],
    });

    expect(shippo.shipments).toHaveLength(5);
    const boxes = boxesSent().map(
      (parcel) => `${parcel.length}x${parcel.width}x${parcel.height}@${parcel.weight}`,
    );
    expect(boxes).toEqual([
      '10x10x6@12',
      '10x10x6@2',
      '10x10x6@24',
      '10x10x6@6',
      '8.5x7.5x6.5@30',
    ]);
  });
});

describe('the weight Shippo is given', () => {
  it('is the weight of the box going out, not our own dimensional-weight estimate', async () => {
    await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [{ productId: '9101', quantity: 1 }],
    });

    // A 10 x 10 x 6 carton has a DIM weight of 3.61 lb. Sending that for a 2 lb box
    // asks the carrier to price a parcel 1.6 lb heavier than the one being shipped.
    expect(boxesSent().map((parcel) => parcel.weight)).toEqual(['2']);
  });

  it('is pieces x product weight for each product', async () => {
    await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [
        { productId: '9101', quantity: 6 },
        { productId: '9102', quantity: 4 },
      ],
    });

    expect(boxesSent().map((parcel) => parcel.weight)).toEqual(['12', '24']);
  });

  it('is the block’s own weight on a block, and never the carton along with it', async () => {
    await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [{ productId: '9103', quantity: 1 }],
    });

    // An 8.5 x 7.5 x 6.5 carton has a DIM weight under 3 lb, so nothing should replace
    // the 30 lb the block actually weighs.
    expect(boxesSent().map((parcel) => parcel.weight)).toEqual(['30']);
  });
});

describe('the quote returned to checkout', () => {
  it('sums one amount per box for a service all boxes offer', async () => {
    const rates = await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [{ productId: '9101', quantity: 7 }],
    });

    const ground = rates.find((rate) => rate.serviceName === 'Ground Advantage');
    // 12 lb -> $11.00, 2 lb -> $6.00.
    expect(ground?.amount).toBe(17);
    expect(splitShippoRateIds(ground?.objectId ?? '')).toHaveLength(2);
  });

  it('keeps a single-box order as one plain rate', async () => {
    const rates = await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [{ productId: '9101', quantity: 6 }],
    });

    expect(shippo.shipments).toHaveLength(1);
    const ground = rates.find((rate) => rate.serviceName === 'Ground Advantage');
    expect(ground?.amount).toBe(11);
    expect(splitShippoRateIds(ground?.objectId ?? '')).toEqual([ground?.objectId]);
  });

  it('rates from the store address to the address that was asked about', async () => {
    await fetchShippoRates({
      toAddress: DESTINATION,
      lineItems: [{ productId: '9102', quantity: 1 }],
    });

    expect(shippo.shipments[0].address_from).toMatchObject({ city: 'Houston', state: 'TX', zip: '77065' });
    expect(shippo.shipments[0].address_to).toMatchObject({ city: 'Austin', state: 'TX', zip: '78701' });
    expect(boxesSent().map((parcel) => parcel.weight)).toEqual(['6']);
  });
});
