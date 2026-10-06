import { describe, expect, it } from 'vitest';

import {
  WholesaleEngineError,
  buildCostLines,
  buildMixedLoad,
  computePalletLoad,
  computeSellSide,
  containerFit,
  containerPalletCapacity,
  convertAmount,
  derivePalletLayout,
  priceTierFor,
  requireConversion,
  unitsFromPallets,
} from './engine';
import { compareRates, isRateUsable, manualRatesProvider, preferredRate, rateFreshness, rateTotal } from './freight';
import type {
  ContainerProfile,
  CostProfile,
  FxSnapshot,
  PackagingProfile,
  QuoteLine,
  WholesaleProduct,
} from './types';

/* ------------------------------------------------------------------ */
/* Fixtures — a 2 kg unit in 4-unit cartons on a 1.2 × 1.0 m pallet.   */
/* ------------------------------------------------------------------ */

const PACKAGING: PackagingProfile = {
  cartonQty: 4,
  packagedUnitWeightKg: 2.72,
  cartonLengthCm: 40,
  cartonWidthCm: 30,
  cartonHeightCm: 24,
  cartonGrossWeightKg: 11.3,
  palletLengthCm: 120,
  palletWidthCm: 100,
  maxStackHeightCm: 180,
  palletDeckHeightCm: 14,
  palletTareKg: 20,
  maxPalletGrossWeightKg: 1_000,
};

const PRODUCT: WholesaleProduct = {
  id: 'p-fine',
  wooProductId: 2494,
  name: 'Himalayan Salt Fine Grain — 45 lbs',
  wholesaleSku: 'HK-WS-FINE-45',
  packaging: PACKAGING,
  moq: 4,
  exFactoryCost: 18.5,
  currency: 'USD',
  originId: 'pk-karachi',
  supplierId: 'sup-1',
  leadTimeDays: 21,
  netUnitWeightKg: 2.5,
  active: true,
};

// Published dry-van internal dimensions: 5.90 × 2.35 × 2.39 m inside a 20ft.
const CONTAINER: ContainerProfile = {
  id: '20FT',
  name: '20ft Standard',
  usableCbm: 33.2,
  maxCargoWeightKg: 28_200,
  practicalVolumeFactor: 0.9,
  internalLengthCm: 589,
  internalWidthCm: 235,
  internalHeightCm: 239,
  palletCapacity: 10,
  notes: null,
};

/** The same box with its insides unrecorded, for the assumption path. */
const UNMEASURED: ContainerProfile = { ...CONTAINER, internalLengthCm: null, internalWidthCm: null, internalHeightCm: null };

const COST_PROFILE: CostProfile = {
  id: 'cost-pk',
  originId: 'pk-karachi',
  supplierId: 'sup-1',
  currency: 'USD',
  inlandTransport: 300,
  stuffing: 150,
  documentation: 90,
  originTerminal: 260,
  originCustoms: 120,
  inspection: 80,
  forwarding: 100,
  packagingSurcharge: 100,
  otherLabel: null,
  otherAmount: 0,
  insurancePct: 0.4,
  destinationTerminal: 500,
  destinationHandling: 200,
  destinationCustomsBroker: 250,
  destinationDelivery: 400,
  destinationWarehouse: 0,
  destinationOther: 0,
  dutyPct: 0,
  notes: null,
};

const FX: FxSnapshot[] = [
  { from: 'PKR', to: 'USD', rate: 1 / 278, source: 'manual', retrievedAt: '2026-09-23T00:00:00.000Z' },
];

const CARGO_LINE: QuoteLine = {
  id: 'line-1',
  productId: PRODUCT.id,
  name: PRODUCT.name,
  wholesaleSku: PRODUCT.wholesaleSku,
  units: 1_000,
  cartonQty: 4,
  exFactoryUnitCost: 18.5,
  packaging: PACKAGING,
};

/* ------------------------------------------------------------------ */
/* Pallets                                                             */
/* ------------------------------------------------------------------ */

describe('pallet layout', () => {
  it('takes the better carton orientation and derives layers from the stack height', () => {
    const layout = derivePalletLayout(PACKAGING);
    // 120/40 × 100/30 = 3 × 3 = 9; rotated 120/30 × 100/40 = 4 × 2 = 8 → 9.
    expect(layout.cartonsPerLayer).toBe(9);
    // (180 − 14) / 24 = 6 layers.
    expect(layout.layers).toBe(6);
    expect(layout.cartonsPerPallet).toBe(54);
    expect(layout.unitsPerPallet).toBe(216);
    expect(layout.weightLimited).toBe(false);
    expect(layout.assumptions.join(' ')).toMatch(/Cartons per layer derived/);
  });

  it('lets a weight ceiling cap the pallet and says that it did', () => {
    const layout = derivePalletLayout({ ...PACKAGING, cartonQty: 4, maxPalletGrossWeightKg: 260 });
    // (260 − 20) / 11.3 = 21 cartons, well under the 54 the height allows.
    expect(layout.cartonsPerPallet).toBe(21);
    expect(layout.weightLimited).toBe(true);
    expect(layout.assumptions.join(' ')).toMatch(/gross-weight ceiling/);
    expect(layout.palletGrossWeightKg).toBeLessThanOrEqual(260);
  });

  it('refuses a profile that cannot hold a single carton', () => {
    // 130 cm in both directions on a 120 × 100 cm pallet fits in neither
    // orientation — narrower than the pallet, so no rotation rescues it.
    expect(() => derivePalletLayout({ ...PACKAGING, cartonLengthCm: 130, cartonWidthCm: 130 })).toThrow(WholesaleEngineError);
  });

  it('finds the rotated orientation when only that one fits', () => {
    // 120/40 × 100/120 = 0; rotated 120/120 × 100/40 = 1 × 2 = 2 cartons.
    const layout = derivePalletLayout({ ...PACKAGING, cartonWidthCm: 120 });
    expect(layout.cartonsPerLayer).toBe(2);
  });

  it('honours an owner-supplied cartons-per-layer and layer count as given', () => {
    const layout = derivePalletLayout({ ...PACKAGING, cartonsPerLayer: 8, layers: 5 });
    expect(layout.cartonsPerLayer).toBe(8);
    expect(layout.layers).toBe(5);
    expect(layout.cartonsPerPallet).toBe(40);
  });
});

describe('quantity → cartons → pallets', () => {
  it('rounds up to whole cartons and keeps the last pallet in the count', () => {
    const load = computePalletLoad(PRODUCT, 500);
    expect(load.cartons).toBe(125);
    expect(load.layout.cartonsPerPallet).toBe(54);
    expect(load.fullPallets).toBe(2);
    expect(load.palletsRequired).toBe(3);
    expect(load.unitsOnLastPallet).toBe(68);
    expect(load.netWeightKg).toBe(1_250);
    expect(load.merchandiseCost).toBe(9_250);
  });

  it('converts pallets back to units with the same layout, so both entry paths agree', () => {
    const fromPallets = unitsFromPallets(PRODUCT, 2);
    expect(fromPallets).toBe(2 * 216);
    const load = computePalletLoad(PRODUCT, fromPallets);
    expect(load.palletsRequired).toBe(2);
    expect(load.fullPallets).toBe(2);
  });

  it('refuses a non-positive quantity rather than returning zeroes', () => {
    expect(() => computePalletLoad(PRODUCT, 0)).toThrow(WholesaleEngineError);
  });
});

describe('price tiers', () => {
  const tiers = [
    { id: 't1', productId: 'p-fine', minUnits: 100, unitPrice: 17.9, currency: 'USD' },
    { id: 't2', productId: 'p-fine', minUnits: 1_000, unitPrice: 16.4, currency: 'USD' },
  ];

  it('picks the highest break the quantity reaches', () => {
    expect(priceTierFor(tiers, 'p-fine', 1_000)?.id).toBe('t2');
    expect(priceTierFor(tiers, 'p-fine', 999)?.id).toBe('t1');
    expect(priceTierFor(tiers, 'p-fine', 10)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Containers                                                          */
/* ------------------------------------------------------------------ */

describe('container fit', () => {
  const load = { cargoCbm: 10, cbm: 12, grossWeightKg: 10_000, pallets: 5 };

  it('reports both utilizations and names the limiting factor', () => {
    const fit = containerFit(CONTAINER, load);
    expect(fit.practicalCbmLimit).toBeCloseTo(29.88, 2);
    expect(fit.weightUtilizationPct).toBeCloseTo(35.5, 1);
    expect(fit.volumeUtilizationPct).toBeCloseTo(40.2, 1);
    expect(fit.limitingFactor).toBe('VOLUME');
    expect(fit.warnings).toEqual([]);
  });

  it('names weight as the limit for a dense load', () => {
    const fit = containerFit(CONTAINER, { cargoCbm: 8, cbm: 9, grossWeightKg: 27_000, pallets: 9 });
    expect(fit.limitingFactor).toBe('WEIGHT');
    expect(fit.remainingWeightKg).toBe(1_200);
  });

  it('warns when a load cannot ship as one container', () => {
    const fit = containerFit(CONTAINER, { cargoCbm: 40, cbm: 44, grossWeightKg: 30_000, pallets: 12 });
    expect(fit.warnings.some((w) => /Over the weight limit/.test(w))).toBe(true);
    expect(fit.warnings.some((w) => /usable volume/.test(w))).toBe(true);
    expect(fit.warnings.some((w) => /assumed capacity/.test(w))).toBe(true);
  });

  it('treats a load above the practical volume but inside the raw volume as a warning, not a failure', () => {
    const fit = containerFit(CONTAINER, { cargoCbm: 31, cbm: 31, grossWeightKg: 5_000, pallets: 4 });
    expect(fit.warnings.some((w) => /practical loading volume/.test(w))).toBe(true);
    expect(fit.warnings.some((w) => /usable volume/.test(w))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Pallet capacity, counted from the box                            */
/* ------------------------------------------------------------------ */

/** 12.03 × 2.35 × 2.69 m inside a 40ft high cube. */
const HIGH_CUBE: ContainerProfile = {
  ...CONTAINER,
  id: '40HC',
  name: '40ft High Cube',
  usableCbm: 76.4,
  maxCargoWeightKg: 26_500,
  internalLengthCm: 1_203,
  internalWidthCm: 235,
  internalHeightCm: 269,
  palletCapacity: 21,
};

describe('pallet capacity', () => {
  it('counts floor positions from the pallet and the box, not from booklet numbers', () => {
    const capacity = containerPalletCapacity(CONTAINER, PACKAGING);
    // 4 pallets along 589 cm × 2 across 235 cm. The rotated layout (5 × 1) is worse.
    expect(capacity.positions).toBe(8);
    // One loaded pallet is 14 cm deck + 6 layers × 24 cm = 158 cm against 239 cm.
    expect(capacity.loadedHeightCm).toBe(158);
    expect(capacity.tiers).toBe(1);
    expect(capacity.byFloor).toBe(8);
    expect(capacity.capacity).toBe(8);
    expect(capacity.limitingFactor).toBe('FLOOR');
    // And it is lower than the profile's own optimistic assumption, which is the point.
    expect(capacity.capacity).toBeLessThan(CONTAINER.palletCapacity!);
  });

  it('fits more pallets in a high cube because the floor is longer', () => {
    const capacity = containerPalletCapacity(HIGH_CUBE, PACKAGING);
    expect(capacity.positions).toBe(20);
    expect(capacity.capacity).toBe(20);
    expect(capacity.limitingFactor).toBe('FLOOR');
  });

  it('stacks when the loaded pallet is short enough, and then weight binds', () => {
    // A low stack: 3 layers on a 100 cm ceiling = 86 cm loaded, so 3 tiers fit in 269 cm.
    const capacity = containerPalletCapacity(HIGH_CUBE, { ...PACKAGING, maxStackHeightCm: 100 });
    expect(capacity.loadedHeightCm).toBe(86);
    expect(capacity.tiers).toBe(3);
    expect(capacity.byFloor).toBe(60);
    // 26,500 kg ÷ (20 + 27 × 11.3 = 325.1 kg) = 81 by weight, so the stacking is what
    // buys the extra pallets — the limit is the tiers, not the floor and not the weight.
    expect(capacity.limitingFactor).toBe('TIERS');
    expect(capacity.capacity).toBe(60);

    // Make the pallet heavy enough and the weight ceiling becomes the answer.
    const heavy = containerPalletCapacity(HIGH_CUBE, { ...PACKAGING, maxStackHeightCm: 100, cartonGrossWeightKg: 33 });
    expect(heavy.byWeight).toBeLessThan(heavy.byFloor);
    expect(heavy.limitingFactor).toBe('WEIGHT');
    expect(heavy.capacity).toBe(heavy.byWeight);
    expect(heavy.assumptions.join(' ')).toMatch(/Weight binds/);
  });

  it('assumes rather than invents when the box was never measured', () => {
    const capacity = containerPalletCapacity(UNMEASURED, PACKAGING);
    expect(capacity.limitingFactor).toBe('ASSUMED');
    expect(capacity.capacity).toBe(10);
    expect(capacity.assumptions.join(' ')).toMatch(/No internal dimensions are recorded/);
  });

  it('warns with the counted figure when a load needs more than one container', () => {
    const fit = containerFit(CONTAINER, { cargoCbm: 10, cbm: 12, grossWeightKg: 10_000, pallets: 9, packaging: PACKAGING });
    expect(fit.palletLimit?.capacity).toBe(8);
    expect(fit.warnings.some((w) => /against 8 that fit/.test(w))).toBe(true);
  });

  it('keeps the profile assumption when the load has no single footprint', () => {
    const fit = containerFit(CONTAINER, { cargoCbm: 10, cbm: 12, grossWeightKg: 10_000, pallets: 12 });
    expect(fit.palletLimit).toBeNull();
    expect(fit.warnings.some((w) => /assumed capacity/.test(w))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Mixed loads                                                         */
/* ------------------------------------------------------------------ */

describe('mixed container', () => {
  const coarse: WholesaleProduct = { ...PRODUCT, id: 'p-coarse', name: 'Himalayan Salt Coarse Grain', exFactoryCost: 19.25 };
  const lick: WholesaleProduct = { ...PRODUCT, id: 'p-lick', name: 'Himalayan Salt Lick', exFactoryCost: 12.4 };

  it('sums pallets, units, weight and CBM across products', () => {
    const mix = buildMixedLoad(CONTAINER, [
      { product: PRODUCT, pallets: 3 },
      { product: coarse, units: 500 },
      { product: lick, pallets: 1 },
    ]);
    expect(mix.lines).toHaveLength(3);
    expect(mix.totals.pallets).toBe(3 + 3 + 1);
    expect(mix.totals.units).toBe(3 * 216 + 500 + 216);
    expect(mix.totals.merchandiseCost).toBeCloseTo(216 * 3 * PRODUCT.exFactoryCost + 500 * coarse.exFactoryCost + 216 * lick.exFactoryCost, 2);
    expect(mix.totals.cbm).toBeGreaterThan(0);
    expect(mix.fit.limitingFactor).not.toBe('NONE');
  });

  it('does not silently overfill: an oversized mix comes back with warnings', () => {
    const mix = buildMixedLoad(CONTAINER, [
      { product: PRODUCT, pallets: 14 },
      { product: lick, pallets: 14 },
    ]);
    expect(mix.warnings.length).toBeGreaterThan(0);
    expect(mix.fit.rawVolumeUtilizationPct).toBeGreaterThan(100);
  });

  it('refuses both units and pallets on one line rather than guessing', () => {
    expect(() => buildMixedLoad(CONTAINER, [{ product: PRODUCT, units: 100, pallets: 2 }])).toThrow(WholesaleEngineError);
  });

  it('refuses an empty mix', () => {
    expect(() => buildMixedLoad(CONTAINER, [])).toThrow(WholesaleEngineError);
  });
});

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

describe('currency', () => {
  it('converts with the supplied snapshot, and back through the inverse', () => {
    expect(convertAmount(278_000, 'PKR', 'USD', FX)).toBeCloseTo(1_000, 2);
    expect(convertAmount(1_000, 'USD', 'PKR', FX)).toBeCloseTo(278_000, 0);
    expect(convertAmount(50, 'USD', 'USD', FX)).toBe(50);
  });

  it('refuses to invent a rate: an unknown pair is null, not 1:1', () => {
    expect(convertAmount(100, 'CNY', 'USD', FX)).toBeNull();
    expect(() => requireConversion(100, 'CNY', 'USD', FX)).toThrow(/No CNY→USD exchange rate/);
  });
});

/* ------------------------------------------------------------------ */
/* Incoterms & landed cost                                             */
/* ------------------------------------------------------------------ */

describe('landed cost by incoterm', () => {
  const base = {
    lines: [CARGO_LINE],
    containers: 1,
    cartons: 250,
    pallets: 5,
    netWeightKg: 2_500,
    costProfile: COST_PROFILE,
    fx: FX,
    currency: 'USD',
    freight: { oceanFreight: 2_400, surcharges: [{ label: 'BAF', amount: 180 }], currency: 'USD' },
  };

  it('EXW carries the goods and packaging only', () => {
    const { lines, totals } = buildCostLines({ ...base, incoterm: 'EXW' });
    const included = lines.filter((line) => line.included).map((line) => line.key);
    expect(included).toEqual(['merchandise', 'packaging']);
    expect(totals.oceanFreight).toBe(2_580);
    // A freight rate may be attached without being part of an EXW price.
    expect(totals.total).toBeLessThan(totals.merchandise + totals.oceanFreight);
  });

  it('FOB adds the origin side up to the port, but not the freight', () => {
    const { lines, totals } = buildCostLines({ ...base, incoterm: 'FOB' });
    const included = lines.filter((line) => line.included).map((line) => line.key);
    expect(included).toContain('inland');
    expect(included).toContain('originTerminal');
    expect(included).not.toContain('oceanFreight');
    expect(totals.total).toBeCloseTo(totals.merchandise + totals.packaging + totals.inlandTransport + totals.originCharges, 2);
  });

  it('CFR adds freight but not insurance, and CIF adds both', () => {
    const cfr = buildCostLines({ ...base, incoterm: 'CFR' });
    const cif = buildCostLines({ ...base, incoterm: 'CIF' });
    expect(cfr.lines.find((line) => line.key === 'oceanFreight')?.included).toBe(true);
    expect(cfr.lines.find((line) => line.key === 'insurance')?.included).toBe(false);
    expect(cif.lines.find((line) => line.key === 'insurance')?.included).toBe(true);
    expect(cif.totals.total).toBeGreaterThan(cfr.totals.total);
  });

  it('keeps destination charges and duty out of the total unless asked', () => {
    const without = buildCostLines({ ...base, incoterm: 'CIF' });
    const with_ = buildCostLines({ ...base, incoterm: 'CIF', includeDestination: true, includeDuty: true });
    expect(without.totals.destinationCharges).toBeGreaterThan(0);
    expect(with_.totals.total - without.totals.total).toBeCloseTo(
      without.totals.destinationCharges + without.totals.duty,
      2
    );
    expect(without.lines.find((line) => line.key === 'duty')?.beyondBasis).toBe(true);
  });

  it('says when goods are counted as free, because a missing cost is not a price', () => {
    // A product can be created in the console before it is priced, so this is
    // reachable: quoting it must not present a 100% margin as a result.
    const { totals, assumptions } = buildCostLines({
      ...base,
      incoterm: 'FOB',
      lines: [{ ...CARGO_LINE, exFactoryUnitCost: 0, name: 'Unpriced salt' }],
    });
    expect(totals.merchandise).toBe(0);
    expect(assumptions.join(' ')).toMatch(/No ex-factory cost is recorded for Unpriced salt/);
    expect(assumptions.join(' ')).toMatch(/missing data, not a price/i);
  });

  it('does not mention a cost that is there', () => {
    const { assumptions } = buildCostLines({ ...base, incoterm: 'FOB' });
    expect(assumptions.join(' ')).not.toMatch(/No ex-factory cost is recorded/);
  });

  it('cuts the total down to per-unit, per-carton, per-pallet and per-kg', () => {
    const { totals } = buildCostLines({ ...base, incoterm: 'CIF' });
    expect(totals.perUnit).toBeCloseTo(totals.total / 1_000, 3);
    expect(totals.perCarton).toBeCloseTo(totals.total / 250, 2);
    expect(totals.perPallet).toBeCloseTo(totals.total / 5, 2);
    expect(totals.perKg).toBeCloseTo(totals.total / 2_500, 3);
    expect(totals.perContainer).toBeCloseTo(totals.total, 2);
  });

  it('multiplies per-container charges by the container count', () => {
    const one = buildCostLines({ ...base, incoterm: 'FOB' });
    const two = buildCostLines({ ...base, incoterm: 'FOB', containers: 2 });
    expect(two.totals.inlandTransport).toBeCloseTo(one.totals.inlandTransport * 2, 2);
    expect(two.totals.originCharges).toBeCloseTo(one.totals.originCharges * 2, 2);
  });

  it('converts an origin-currency cost with the quote’s snapshot', () => {
    const pkrProfile: CostProfile = { ...COST_PROFILE, currency: 'PKR', inlandTransport: 278_000, stuffing: 0, documentation: 0, originTerminal: 0, originCustoms: 0, inspection: 0, forwarding: 0, packagingSurcharge: 0, otherAmount: 0, destinationTerminal: 0, destinationHandling: 0, destinationCustomsBroker: 0, destinationDelivery: 0, destinationWarehouse: 0, destinationOther: 0 };
    const { totals } = buildCostLines({ ...base, incoterm: 'FOB', costProfile: pkrProfile });
    expect(totals.inlandTransport).toBeCloseTo(1_000, 2);
  });

  it('fails loudly when a charge is in a currency the quote has no rate for', () => {
    const cnyProfile: CostProfile = { ...COST_PROFILE, currency: 'CNY' };
    expect(() => buildCostLines({ ...base, incoterm: 'FOB', costProfile: cnyProfile })).toThrow(/No CNY→USD exchange rate/);
  });

  it('says when a basis is incomplete because no freight is attached', () => {
    const { assumptions } = buildCostLines({ ...base, incoterm: 'CFR', freight: null });
    expect(assumptions.join(' ')).toMatch(/No ocean freight is attached/);
  });
});

describe('sell side', () => {
  it('reports margin against sell and markup against cost as different numbers', () => {
    const totals = { perUnit: 30 } as Parameters<typeof computeSellSide>[0];
    const sell = computeSellSide(totals, 42);
    expect(sell.grossProfitPerUnit).toBe(12);
    expect(sell.marginPct).toBeCloseTo(28.57, 1);
    expect(sell.markupPct).toBeCloseTo(40, 1);
  });

  it('refuses a non-positive sell price', () => {
    expect(() => computeSellSide({ perUnit: 10 } as Parameters<typeof computeSellSide>[0], 0)).toThrow(WholesaleEngineError);
  });
});

/* ------------------------------------------------------------------ */
/* Freight                                                             */
/* ------------------------------------------------------------------ */

describe('freight rates', () => {
  const rate = {
    id: 'r1',
    source: 'manual' as const,
    provider: 'Forwarder A',
    originPort: 'KAPE',
    destinationPort: 'USNYC',
    containerType: '20FT',
    carrier: null,
    currency: 'USD',
    oceanFreight: 2_400,
    surcharges: [{ label: 'BAF', amount: 180 }, { label: 'THC', amount: 120 }],
    transitDays: 32,
    retrievedAt: '2026-09-01T00:00:00.000Z',
    validUntil: '2026-10-01T00:00:00.000Z',
    providerReference: 'QA-1',
    notes: null,
  };

  it('totals base plus surcharges, never base alone', () => {
    expect(rateTotal(rate)).toBe(2_700);
  });

  it('labels freshness instead of hiding an expired rate', () => {
    expect(rateFreshness(rate, new Date('2026-09-15T00:00:00.000Z'))).toBe('VALID');
    expect(rateFreshness(rate, new Date('2026-10-05T00:00:00.000Z'))).toBe('EXPIRED');
    expect(isRateUsable({ ...rate, validUntil: null })).toBe(false);
    expect(rateFreshness({ ...rate, validUntil: null })).toBe('UNKNOWN');
  });

  it('only offers a usable same-currency rate as the preferred one', () => {
    const expired = { ...rate, id: 'r2', oceanFreight: 100, validUntil: '2026-08-01T00:00:00.000Z' };
    const at = new Date('2026-09-15T00:00:00.000Z');
    expect(preferredRate([expired, rate], 'USD', at)?.id).toBe('r1');
    expect(preferredRate([rate], 'EUR', at)).toBeNull();
    // Cheapest-first for display, expired included.
    expect(compareRates([rate, expired], at)[0].rate.id).toBe('r2');
  });

  it('returns manual rates for the lane, and nothing for another lane', async () => {
    const provider = manualRatesProvider([rate]);
    expect(provider.configured).toBe(true);
    const hit = await provider.getOceanRates({ originPort: 'KAPE', destinationPort: 'USNYC', containerType: '20FT' });
    expect(hit.map((r) => r.id)).toEqual(['r1']);
    const miss = await provider.getOceanRates({ originPort: 'CNSHA', destinationPort: 'USNYC', containerType: '40HC' });
    expect(miss).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Phase 35 Regressions: LCL/FCL Intelligence & Completeness           */
/* ------------------------------------------------------------------ */

import { recommendShipmentMode, computeMultiContainerComparison, packagingCompleteness } from './engine';

describe('LCL/FCL Intelligence (Phase 35 Regressions)', () => {
  const smallLoad = { cargoCbm: 2.5, cbm: 2.5, grossWeightKg: 1200, pallets: 2 };
  const largeLoad = { cargoCbm: 28, cbm: 28, grossWeightKg: 15000, pallets: 10 };
  const baseRate = {
    source: 'manual' as const,
    provider: 'Forwarder A',
    originPort: 'KAPE',
    destinationPort: 'USNYC',
    carrier: null,
    currency: 'USD',
    transitDays: 32,
    retrievedAt: '2026-09-01T00:00:00.000Z',
    validUntil: '2026-10-01T00:00:00.000Z',
    providerReference: 'QA-1',
    notes: null,
  };
  const freightRates = [
    { ...baseRate, id: 'lcl-rate', containerType: 'LCL', oceanFreight: 300, surcharges: [] },
    { ...baseRate, id: '20ft-rate', containerType: '20FT', oceanFreight: 1500, surcharges: [] },
  ];

  it('1. 1000 units 2 lb product -> correct cartons/pallets, NOT false FCL', () => {
    // 1000 units of fine salt = 250 cartons = 4.63 pallets (5 required)
    const load = computePalletLoad(PRODUCT, 1000);
    expect(load.palletsRequired).toBe(5);
    expect(load.palletEquivalent).toBe(4.63);
    
    // Default threshold recommendation without rates
    const rec = recommendShipmentMode({ cargoCbm: load.cbm, cbm: load.cbm, grossWeightKg: load.grossWeightKg, pallets: load.palletsRequired }, [CONTAINER]);
    expect(rec.mode).toBe('LCL');
    expect(rec.isLclRecommended).toBe(true);
  });

  it('3. partial pallet', () => {
    const load = computePalletLoad(PRODUCT, 1000); // 250 cartons, 54 per pallet = 4 full, 34 remainder
    expect(load.fullPallets).toBe(4);
    expect(load.palletsRequired).toBe(5);
    expect(load.partialPalletPct).toBeCloseTo((34 / 54) * 100, 1);
  });

  it('5. LCL vs FCL economic comparison', () => {
    const recLCL = recommendShipmentMode(smallLoad, [CONTAINER], freightRates);
    expect(recLCL.mode).toBe('LCL');
    expect(recLCL.isLclRecommended).toBe(true);
    expect(recLCL.reason).toMatch(/economically cheaper/);

    const heavyLoad = { cargoCbm: 15, cbm: 15, grossWeightKg: 12000, pallets: 8 };
    const expensiveLclRates = [
      { ...baseRate, id: 'lcl-rate', containerType: 'LCL', oceanFreight: 2000, surcharges: [] },
      { ...baseRate, id: '20ft-rate', containerType: '20FT', oceanFreight: 1500, surcharges: [] },
    ];
    const recFCL = recommendShipmentMode(heavyLoad, [CONTAINER], expensiveLclRates);
    expect(recFCL.mode).toBe('20FT');
    expect(recFCL.isLclRecommended).toBe(false);
    expect(recFCL.reason).toMatch(/economically cheaper.*despite unused physical capacity/);
  });

  it('6, 7, 8. multi-container comparison', () => {
    const comparison = computeMultiContainerComparison(largeLoad, [CONTAINER, HIGH_CUBE]);
    expect(comparison).toHaveLength(2);
    expect(comparison[0].container.id).toBe('20FT');
    expect(comparison[1].container.id).toBe('40HC');
  });

  it('11. missing packaging profile completeness', () => {
    const complete = packagingCompleteness({
      ...PACKAGING,
      unitLengthCm: 10, unitWidthCm: 10, unitHeightCm: 10
    });
    expect(complete.status).toBe('COMPLETE');

    const incomplete = packagingCompleteness({
      ...PACKAGING,
      cartonGrossWeightKg: 0,
      maxStackHeightCm: 0
    });
    expect(incomplete.status).toBe('INCOMPLETE');
    expect(incomplete.missingFields).toContain('Carton Gross Weight');
    expect(incomplete.missingFields).toContain('Max Stack Height');
  });
});
