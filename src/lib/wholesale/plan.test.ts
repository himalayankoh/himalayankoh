import { describe, expect, it } from 'vitest';

import { WholesaleEngineError } from './engine';
import { buildBuyerPlan, parseLineRequests } from './plan';
import { containerProfileFromRow, priceTierFromRow, productFromRow } from './mapping';
import { DEFAULT_PACKAGING_PROFILE } from './types';
import type { WholesaleData } from './pricing';

const PACKAGING = { ...DEFAULT_PACKAGING_PROFILE, cartonQty: 4, maxPalletGrossWeightKg: 1_000 };

const DATA: WholesaleData = {
  products: [
    productFromRow({
      id: 1,
      name: 'Fine Grain',
      wholesale_sku: 'HK-WS-FINE',
      currency: 'USD',
      ex_factory_cost: 18.5,
      net_unit_weight_kg: 2.5,
      active: 1,
      packaging: PACKAGING,
    }),
    productFromRow({
      id: 2,
      name: 'Coarse Grain',
      wholesale_sku: 'HK-WS-COARSE',
      currency: 'USD',
      ex_factory_cost: 19.25,
      net_unit_weight_kg: 2.6,
      active: 1,
      packaging: PACKAGING,
    }),
  ],
  tiers: [
    priceTierFromRow({ id: 1, product_id: 1, min_units: 1_000, unit_price: 16.4, currency: 'USD' }),
    priceTierFromRow({ id: 2, product_id: 1, min_units: 100, unit_price: 17.9, currency: 'USD' }),
  ],
  containers: [containerProfileFromRow({ id: 1, code: '20FT', name: '20ft Standard', usable_cbm: 33.2, max_cargo_weight_kg: 28_200, practical_volume_factor: 0.9, pallet_capacity: 10 })],
  costProfiles: [],
  freightRates: [],
};

describe('line requests', () => {
  it('accepts units or pallets and refuses both', () => {
    expect(parseLineRequests([{ productRowId: 1, units: 500 }])).toEqual([{ productRowId: 1, units: 500 }]);
    expect(parseLineRequests([{ productRowId: 1, pallets: 2 }])).toEqual([{ productRowId: 1, pallets: 2 }]);
    expect(() => parseLineRequests([{ productRowId: 1, units: 500, pallets: 2 }])).not.toThrow();
    // Both are passed through; buildMixedLoad is what refuses the ambiguity, so
    // there is exactly one owner of that rule.
    expect(() =>
      buildBuyerPlan(DATA, { lines: [{ productRowId: 1, units: 500, pallets: 2 }] })
    ).toThrow(/either units or pallets/);
  });

  it('refuses an empty request rather than answering zero', () => {
    expect(() => parseLineRequests([])).toThrow(WholesaleEngineError);
    expect(() => parseLineRequests('nonsense')).toThrow(/at least one product/i);
  });

  it('refuses a missing or non-positive quantity', () => {
    expect(() => parseLineRequests([{ productRowId: 1 }])).toThrow(/unit quantity or a number of pallets/);
    expect(() => parseLineRequests([{ productRowId: 1, units: 0 }])).toThrow(/greater than zero/);
    expect(() => parseLineRequests([{ productRowId: 0, units: 5 }])).toThrow(/whole wholesale product id/);
  });
});

describe('buyer load plan', () => {
  it('prices at the highest break the quantity reaches, and says which one', () => {
    const plan = buildBuyerPlan(DATA, { lines: [{ productRowId: 1, units: 1_000 }] });
    expect(plan.lines[0].unitPrice).toBe(16.4);
    expect(plan.lines[0].tierMinUnits).toBe(1_000);
    expect(plan.lines[0].lineValue).toBe(16_400);
    expect(plan.assumptions.join(' ')).toMatch(/1,000-unit price break/);

    const smaller = buildBuyerPlan(DATA, { lines: [{ productRowId: 1, units: 200 }] });
    expect(smaller.lines[0].unitPrice).toBe(17.9);
  });

  it('converts pallets through the product’s own packaging', () => {
    const plan = buildBuyerPlan(DATA, { lines: [{ productRowId: 1, pallets: 2 }] });
    // 9 cartons per layer × 6 layers = 54 cartons per pallet × 4 units = 216 units.
    expect(plan.lines[0].units).toBe(432);
    expect(plan.lines[0].pallets).toBe(2);
    expect(plan.totals.pallets).toBe(2);
  });

  it('reports an unpriced line instead of inventing a price', () => {
    const plan = buildBuyerPlan(DATA, { lines: [{ productRowId: 2, units: 500 }] });
    expect(plan.lines[0].unitPrice).toBeNull();
    expect(plan.totals.indicativeMerchandise).toBeNull();
    expect(plan.totals.hasUnpricedLines).toBe(true);
  });

  it('mixes products and sums the physical totals', () => {
    const plan = buildBuyerPlan(DATA, {
      lines: [
        { productRowId: 1, units: 1_000 },
        { productRowId: 2, units: 500 },
      ],
    });
    expect(plan.lines).toHaveLength(2);
    expect(plan.totals.units).toBe(1_500);
    expect(plan.totals.indicativeMerchandise).toBe(16_400);
    expect(plan.totals.hasUnpricedLines).toBe(true);
    expect(plan.totals.netWeightKg).toBeGreaterThan(0);
    expect(plan.fit.limitingFactor).not.toBe('NONE');
  });

  it('states that the plan is goods only', () => {
    const plan = buildBuyerPlan(DATA, { lines: [{ productRowId: 1, units: 100 }] });
    expect(plan.assumptions.join(' ')).toMatch(/goods only/i);
  });

  it('refuses an unknown product rather than skipping the line', () => {
    expect(() => buildBuyerPlan(DATA, { lines: [{ productRowId: 99, units: 10 }] })).toThrow(/No active wholesale product/);
  });
});
