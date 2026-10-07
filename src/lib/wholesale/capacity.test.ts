// ============================================================================
// Capacity — pallet, reverse-quantity and container questions
//
// The capacity screen tells an owner how much fits on two pallets and how many
// pallets a thousand units need. Both answers have to come from the packing engine,
// so these tests pin the contract against the engine's own numbers: the layout it
// derives, the weight ceiling that caps a pallet below its geometry, the pallet count
// a quantity needs, and the container ceiling the fit verdict produces. Invalid input
// must read as a message, never as NaN or a confident zero.
// ============================================================================
import { describe, expect, it } from 'vitest';

import {
  MAX_PALLET_COUNT,
  capacityBasis,
  containerCapacity,
  kgToLb,
  palletCapacity,
  palletCountVerdict,
  quantityCapacity,
  readPalletCount,
} from './capacity';
import { derivePalletLayout } from './engine';
import { packagingFromJson } from './mapping';
import type { CapacityProduct } from './capacity';
import type { ContainerProfile, PackagingProfile } from './types';

/** A fully measured carton and pallet profile: 6 units a carton, 41×31×25 cm. */
const MEASURED: PackagingProfile = {
  cartonQty: 6,
  packagedUnitWeightKg: 12.5,
  cartonLengthCm: 41,
  cartonWidthCm: 31,
  cartonHeightCm: 25,
  cartonGrossWeightKg: 12.1,
  palletLengthCm: 122,
  palletWidthCm: 102,
  maxStackHeightCm: 182,
  palletDeckHeightCm: 15,
  palletTareKg: 22,
  unitLengthCm: 30,
  unitWidthCm: 20,
  unitHeightCm: 12,
};

function product(overrides: Partial<PackagingProfile> = {}): CapacityProduct {
  return {
    id: 'P1',
    name: 'Test product',
    wholesaleSku: 'SKU-1',
    exFactoryCost: 0,
    netUnitWeightKg: 12.5,
    // The measured profile with nothing added to it, so a capacity result is
    // OWNER_CONFIRMED. `packagingDefaultsUsed` is what the readiness check reads.
    packaging: { ...MEASURED, ...overrides },
    packagingDefaultsUsed: [],
  } as unknown as CapacityProduct;
}

const CONTAINER_20FT: ContainerProfile = {
  id: '20FT',
  name: '20ft standard',
  usableCbm: 33,
  maxCargoWeightKg: 28_000,
  practicalVolumeFactor: 0.9,
  internalLengthCm: 589,
  internalWidthCm: 235,
  internalHeightCm: 239,
  palletCapacity: null,
  notes: null,
};

describe('palletCapacity', () => {
  it('scales one pallet to N pallets without recalculating the layout', () => {
    const layout = derivePalletLayout(MEASURED);
    for (const pallets of [1, 2, 3, 7, 26]) {
      const capacity = palletCapacity(product(), pallets);
      expect(capacity.pallets, String(pallets)).toBe(pallets);
      expect(capacity.cartonsPerPallet).toBe(layout.cartonsPerPallet);
      expect(capacity.cartonsPerLayer).toBe(layout.cartonsPerLayer);
      expect(capacity.layers).toBe(layout.layers);
      expect(capacity.totalCartons).toBe(layout.cartonsPerPallet * pallets);
      expect(capacity.totalUnits).toBe(layout.cartonsPerPallet * pallets * MEASURED.cartonQty);
      expect(capacity.grossWeightKg).toBeCloseTo(layout.palletGrossWeightKg * pallets, 3);
      expect(Number.isFinite(capacity.totalUnits)).toBe(true);
    }
  });

  it('reports a weight-limited pallet as weight-limited, at the engine’s count', () => {
    // 260 kg ceiling: the geometry would allow more cartons than the pallet may weigh.
    const geometry = palletCapacity(product(), 1);
    const limited = palletCapacity(product({ maxPalletGrossWeightKg: 260 }), 1);
    expect(geometry.limitingFactor).toBe('STACK_HEIGHT');
    expect(limited.limitingFactor).toBe('WEIGHT');
    expect(limited.cartonsPerPallet).toBeLessThan(geometry.cartonsPerPallet);
    expect(limited.layout.weightLimited).toBe(true);
    // (260 − 22) kg deck ÷ 12.1 kg a carton = 19 cartons, not the geometric count.
    expect(limited.cartonsPerPallet).toBe(19);
    expect(limited.assumptions.join(' ')).toContain('260 kg pallet gross-weight ceiling');
  });

  it('names the stack height as the limit when the weight ceiling is not what capped it', () => {
    const capacity = palletCapacity(product(), 1);
    expect(capacity.limitingFactor).toBe('STACK_HEIGHT');
    expect(capacity.spaceUtilizationPct).toBeGreaterThan(0);
    expect(capacity.spaceUtilizationPct).toBeLessThanOrEqual(100);
  });

  it('marks a product with blank packaging as an estimate and names every defaulted field', () => {
    // Exactly what `packagingFromJson` returns for a product with nothing stored: the
    // documented defaults, and the list of fields those defaults came from.
    const { profile, defaultsUsed } = packagingFromJson({});
    const blank = product();
    blank.packaging = profile;
    blank.packagingDefaultsUsed = defaultsUsed;

    const capacity = palletCapacity(blank, 2);
    expect(capacity.basis.basis).toBe('ESTIMATE');
    expect(capacity.basis.status).toBe('INCOMPLETE');
    // Every defaulted field is named, not just the unit dimensions the resolved profile
    // happens not to have — a defaulted carton must not read as a measurement.
    expect(defaultsUsed.length).toBeGreaterThan(0);
    expect(capacity.basis.missingLabels.length).toBeGreaterThanOrEqual(defaultsUsed.length);
    expect(capacity.basis.missingLabels).toContain('Units per carton');
    // The numbers are still produced — the owner asked for a capacity, and the estimate
    // is labelled rather than hidden.
    expect(capacity.totalUnits).toBeGreaterThan(0);
  });

  it('calls a fully measured profile confirmed', () => {
    expect(palletCapacity(product(), 1).basis.basis).toBe('OWNER_CONFIRMED');
  });
});

describe('quantityCapacity', () => {
  it('turns a quantity into cartons, pallets and the last pallet’s fill', () => {
    const capacity = quantityCapacity(product(), 1_000);
    expect(capacity.units).toBe(1_000);
    expect(capacity.cartons).toBe(Math.ceil(1_000 / MEASURED.cartonQty));
    const perPallet = derivePalletLayout(MEASURED).cartonsPerPallet;
    expect(capacity.fullPallets).toBe(Math.floor(capacity.cartons / perPallet));
    expect(capacity.palletsRequired).toBe(Math.ceil(capacity.cartons / perPallet));
    expect(capacity.lastPalletUtilizationPct).toBeGreaterThan(0);
    expect(capacity.lastPalletUtilizationPct).toBeLessThanOrEqual(100);
  });

  it('needs no partial pallet when the quantity lands exactly on whole pallets', () => {
    const perPallet = derivePalletLayout(MEASURED).cartonsPerPallet;
    const exactUnits = perPallet * MEASURED.cartonQty;
    const capacity = quantityCapacity(product(), exactUnits);
    expect(capacity.cartons).toBe(perPallet);
    expect(capacity.palletsRequired).toBe(1);
    expect(capacity.lastPalletUtilizationPct).toBe(0);
    expect(palletCountVerdict({ product: product(), pallets: 1, requestedUnits: exactUnits }).exact).toBe(
      true
    );
  });
});

describe('palletCountVerdict', () => {
  it('says short when the selected pallets cannot hold the quantity', () => {
    const verdict = palletCountVerdict({ product: product(), pallets: 2, requestedUnits: 100_000 });
    expect(verdict.verdict).toBe('SHORT');
    expect(verdict.differenceUnits).toBeLessThan(0);
  });

  it('reports the spare capacity when the selected pallets are not full', () => {
    const verdict = palletCountVerdict({ product: product(), pallets: 4, requestedUnits: 100 });
    expect(verdict.verdict).toBe('FITS');
    expect(verdict.differenceUnits).toBeGreaterThan(0);
    // The spare room is exactly what the pallets hold beyond the request.
    expect(verdict.capacityUnits - verdict.requestedUnits).toBe(verdict.differenceUnits);
  });
});

describe('readPalletCount', () => {
  it('accepts whole positive pallet counts, as text or number', () => {
    for (const value of [1, 2, 26, '3', ' 12 ']) {
      const reading = readPalletCount(value);
      expect(reading.ok, String(value)).toBe(true);
      if (reading.ok) expect(Number.isInteger(reading.count)).toBe(true);
    }
    const max = readPalletCount(MAX_PALLET_COUNT);
    expect(max.ok).toBe(true);
  });

  it('refuses zero, negatives, decimals, blanks and absurd counts with a message', () => {
    for (const value of [0, -1, 2.5, '', 'abc', null, undefined, MAX_PALLET_COUNT + 1]) {
      const reading = readPalletCount(value);
      expect(reading.ok, String(value)).toBe(false);
      if (!reading.ok) expect(reading.message.length).toBeGreaterThan(0);
    }
  });
});

describe('containerCapacity', () => {
  it('finds the most cartons the container accepts, per the engine’s own verdict', () => {
    const capacity = containerCapacity(product(), CONTAINER_20FT);
    expect(capacity.fits).toBe(true);
    expect(capacity.cartons).toBeGreaterThan(0);
    expect(capacity.units).toBe(capacity.cartons * MEASURED.cartonQty);
    expect(capacity.warnings).toEqual([]);
    expect(capacity.weightUtilizationPct).toBeLessThanOrEqual(100);
    expect(capacity.volumeUtilizationPct).toBeLessThanOrEqual(100);
    expect(capacity.basis.basis).toBe('OWNER_CONFIRMED');
  });

  it('will not exceed the ceiling it was given', () => {
    const capacity = containerCapacity(product(), CONTAINER_20FT, 20);
    expect(capacity.cartons).toBeLessThanOrEqual(20);
  });

  it('says which ceiling stopped the load', () => {
    const capacity = containerCapacity(product(), CONTAINER_20FT);
    expect(['WEIGHT', 'VOLUME']).toContain(capacity.limitingFactor);
    // One more carton than the answer must not fit, or the answer is not a capacity.
    const bigger = containerCapacity(product(), CONTAINER_20FT, capacity.cartons + 1);
    expect(bigger.cartons).toBeLessThan(capacity.cartons + 1);
  });

  it('refuses to answer when not even one carton fits, and says why', () => {
    const tiny: ContainerProfile = { ...CONTAINER_20FT, usableCbm: 0.01, practicalVolumeFactor: 0.5 };
    const capacity = containerCapacity(product(), tiny);
    expect(capacity.fits).toBe(false);
    expect(capacity.cartons).toBe(0);
    expect(capacity.warnings.length).toBeGreaterThan(0);
  });

  it('reports an unset carton quantity instead of inventing a carton count', () => {
    const zero = product({ cartonQty: 0 });
    // A carton holding nothing cannot be counted; the profile must be fixed first.
    const capacity = containerCapacity(zero, CONTAINER_20FT);
    expect(capacity.fits).toBe(false);
    expect(capacity.warnings.join(' ')).toMatch(/Units per carton/);
  });
});

describe('capacityBasis', () => {
  it('reads the stored packaging the same way the readiness worklist does', () => {
    const blank = product();
    const stored = packagingFromJson({});
    blank.packaging = stored.profile;
    blank.packagingDefaultsUsed = stored.defaultsUsed;
    expect(capacityBasis(blank).basis).toBe('ESTIMATE');
    expect(capacityBasis(product()).basis).toBe('OWNER_CONFIRMED');
  });

  it('trusts the defaulted-field list rather than the resolved profile', () => {
    // The danger this guards: a resolved profile with every core field filled looks
    // complete, so without the list the screen would call an estimate a measurement.
    const stored = packagingFromJson({});
    const asIfMeasured = product();
    asIfMeasured.packaging = stored.profile;
    asIfMeasured.packagingDefaultsUsed = stored.defaultsUsed;
    expect(capacityBasis(asIfMeasured).status).toBe('INCOMPLETE');

    asIfMeasured.packagingDefaultsUsed = [];
    expect(capacityBasis(asIfMeasured).status).not.toBe('INCOMPLETE');
  });
});

describe('kgToLb', () => {
  it('converts for the owner’s packing list', () => {
    expect(kgToLb(1000)).toBe(2204.62);
    expect(kgToLb(0)).toBe(0);
  });
});
