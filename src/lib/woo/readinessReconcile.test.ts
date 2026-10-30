import { describe, expect, it } from 'vitest';
import { readinessPatchFor } from './productWrite';
import { fromWooProduct, toWooProductBody } from './productPayload';

/** A record shaped like the staging imports (see the live inventory). */
function record(overrides: {
  readiness: string;
  cost?: string;
  flags?: string;
  safety?: string;
  id?: number;
}) {
  return fromWooProduct({
    id: overrides.id ?? 2710,
    name: 'Himalayan Rock Salt Pouches in Fine and Coarse Grain Sizes - 6 lbs',
    slug: 'himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs-himalayan-koh',
    type: 'simple',
    status: 'publish',
    description: 'Fine and coarse grain Himalayan rock salt pouches for the kitchen.',
    short_description: 'Fine and coarse grain rock salt pouches.',
    sku: '',
    regular_price: '17.95',
    price: '17.95',
    stock_status: 'instock',
    stock_quantity: 10,
    manage_stock: true,
    categories: [{ id: 121, name: 'Edible Pink Salt' }],
    images: [{ id: 1, src: 'https://himalayankoh.com/staging/wp-content/uploads/rocksalt.jpg' }],
    meta_data: [
      { key: '_himalayan_koh_commerce_readiness', value: overrides.readiness },
      { key: '_himalayan_koh_supplier_source', value: 'AliExpress' },
      { key: '_himalayan_koh_source_type', value: 'OTHER_VERIFIED' },
      { key: '_himalayan_koh_us_inventory', value: 'no' },
      ...(overrides.cost ? [{ key: '_himalayan_koh_cost_price', value: overrides.cost }] : []),
      ...(overrides.flags ? [{ key: '_himalayan_koh_risk_flags', value: overrides.flags }] : []),
      ...(overrides.safety ? [{ key: '_himalayan_koh_safety_review_status', value: overrides.safety }] : []),
      { key: '_yoast_wpseo_title', value: 'Himalayan Rock Salt Pouches' },
    ],
  });
}

describe('readiness reconciliation on a write', () => {
  it('upgrades ECONOMICS_PENDING to COMMERCE_READY when a verified cost is supplied', () => {
    expect(readinessPatchFor(record({ readiness: 'ECONOMICS_PENDING' }), { costPrice: 4 })).toBe('COMMERCE_READY');
  });

  it('leaves the stamp alone when the write did not touch a prerequisite', () => {
    expect(readinessPatchFor(record({ readiness: 'ECONOMICS_PENDING' }), { featured: true })).toBeUndefined();
    expect(readinessPatchFor(record({ readiness: 'ECONOMICS_PENDING' }), {})).toBeUndefined();
  });

  it('never clears a stored RISK_REVIEW from an economics change alone', () => {
    const flagged = record({
      readiness: 'RISK_REVIEW',
      flags: '["Ingestible — food safety review"]',
    });
    expect(readinessPatchFor(flagged, { costPrice: 5 })).toBeUndefined();
  });

  it('moves a flagged product out of RISK_REVIEW only on a recorded approval', () => {
    const flagged = record({
      readiness: 'RISK_REVIEW',
      flags: '["Ingestible — food safety review"]',
    });
    // Approval without economics falls back to the honest pending state…
    expect(readinessPatchFor(flagged, { safetyReviewStatus: 'APPROVED_FOR_SALE' })).toBe('ECONOMICS_PENDING');
    // …approval plus economics completes it.
    const approved = record({
      readiness: 'RISK_REVIEW',
      flags: '["Ingestible — food safety review"]',
      safety: 'APPROVED_FOR_SALE',
    });
    expect(readinessPatchFor(approved, { costPrice: 5 })).toBe('COMMERCE_READY');
  });

  it('does not downgrade a COMMERCE_READY product on an unrelated edit', () => {
    const ready = record({ readiness: 'COMMERCE_READY', cost: '4' });
    expect(readinessPatchFor(ready, { featured: true })).toBeUndefined();
  });

  it('downgrades a COMMERCE_READY product only when a prerequisite is actually removed', () => {
    const ready = record({ readiness: 'COMMERCE_READY', cost: '4' });
    expect(readinessPatchFor(ready, { costPrice: 0 })).toBe('ECONOMICS_PENDING');
  });
});

describe('the readiness write does not disturb category or SEO', () => {
  it('carries only the readiness meta when that is all it is given', () => {
    const body = toWooProductBody({ commerceReadiness: 'COMMERCE_READY' });
    expect(body).toEqual({
      meta_data: [{ key: '_himalayan_koh_commerce_readiness', value: 'COMMERCE_READY' }],
    });
    expect(body).not.toHaveProperty('categories');
    expect(body).not.toHaveProperty('meta_title');
  });
});
