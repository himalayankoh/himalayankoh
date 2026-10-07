/**
 * Capacity — how much of one product fits on N pallets, or in one container.
 *
 * ## One engine, three questions
 *
 * "How many units fit on two pallets", "how many pallets does a thousand units need"
 * and "how much fits in a 20FT" are three views of the same packing facts, so all three
 * are answered from the existing engine rather than from arithmetic kept beside it:
 *
 *   - the pallet layout (cartons per layer, layers, and the pallet weight ceiling that
 *     may cap the cartons below what the geometry allows) comes from `derivePalletLayout`;
 *   - a quantity expressed as cartons, pallets and weight comes from `computePalletLoad`;
 *   - what a container accepts comes from `containerFit`, the same verdict the
 *     recommendation engine and the quote route use.
 *
 * Nothing here re-derives a carton count from dimensions: a second formula would be a
 * second truth, and the owner would eventually meet two different answers.
 *
 * ## Estimated is not confirmed
 *
 * Every packaging field has a documented default behind it, so a pallet calculation works
 * even with nothing entered. That is useful and dangerous in equal measure: an estimate
 * must never read like a measurement. Each result therefore carries `basis` —
 * `OWNER_CONFIRMED` only when every required field is the owner's own — together with the
 * labels of the fields still blank.
 */

import { containerFit, computePalletLoad, derivePalletLayout } from './engine';
import type { ContainerFit, PalletLayout } from './engine';
import { packagingReadinessFrom } from './packagingReadiness';
import { toWeightLbs } from '@/lib/products/shippingWeight';
import type { ContainerProfile, WholesaleProduct } from './types';

/**
 * The product a capacity is worked out for, plus the one thing the engine cannot infer.
 *
 * `packagingDefaultsUsed` is computed from the *stored* blob by `packagingFromJson` and
 * travels on the record (`WholesaleProductRecord.packagingDefaultsUsed`). It is what makes
 * "estimated" distinguishable from "measured": once a profile is resolved, a field on a
 * default is indistinguishable from a field the owner typed, so it has to arrive beside
 * the profile rather than be rediscovered from it.
 */
export interface CapacityProduct extends WholesaleProduct {
  packagingDefaultsUsed: readonly string[];
}

/** A pallet count has to be a whole number of pallets; these are the bounds we accept. */
export const MIN_PALLET_COUNT = 1;

/**
 * Beyond this a "pallet count" is a typo rather than a load — 100 pallets is four
 * trailer loads. Rejected with a message instead of quietly calculated.
 */
export const MAX_PALLET_COUNT = 100;

/** Requirement A7: whether the numbers are the owner's own or a documented default. */
export interface CapacityBasis {
  basis: 'OWNER_CONFIRMED' | 'ESTIMATE';
  status: 'COMPLETE' | 'NEEDS_REVIEW' | 'INCOMPLETE';
  /** The blank fields, in the packaging form's own words. */
  missingLabels: string[];
}

/**
 * Whether these figures are the owner's own.
 *
 * Reads the packaging the way the worklist and the calculator's own warning do, so a
 * capacity screen labelled "confirmed" cannot disagree with a quotation that says the
 * numbers are estimated.
 */
export function capacityBasis(product: CapacityProduct): CapacityBasis {
  const readiness = packagingReadinessFrom(product.packaging, product.packagingDefaultsUsed);
  return {
    basis: readiness.status === 'COMPLETE' ? 'OWNER_CONFIRMED' : 'ESTIMATE',
    status: readiness.status,
    missingLabels: readiness.missingLabels,
  };
}

export type PalletCountReading =
  | { ok: true; count: number }
  | { ok: false; message: string };

/**
 * Reads a pallet count from whatever the owner typed.
 *
 * Excess is refused rather than clamped: a count the owner did not mean should say so,
 * not silently become a different load. Decimals are refused for the same reason — half
 * a pallet is a pallet, and rounding here would hide a typo.
 */
export function readPalletCount(value: unknown): PalletCountReading {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '' || raw === null || raw === undefined) {
    return { ok: false, message: 'Enter how many pallets to plan for.' };
  }
  const count = Number(raw);
  if (!Number.isFinite(count)) {
    return { ok: false, message: 'A pallet count has to be a number.' };
  }
  if (!Number.isInteger(count)) {
    return { ok: false, message: 'A pallet count has to be a whole number of pallets.' };
  }
  if (count < MIN_PALLET_COUNT) {
    return { ok: false, message: `Plan for at least ${MIN_PALLET_COUNT} pallet.` };
  }
  if (count > MAX_PALLET_COUNT) {
    return { ok: false, message: `At most ${MAX_PALLET_COUNT} pallets can be planned in one go.` };
  }
  return { ok: true, count };
}

/** What N pallets of one product hold, and what stops them holding more. */
export interface PalletCapacity {
  pallets: number;
  /** The engine's own layout, kept whole so the screen can show how it was reached. */
  layout: PalletLayout;
  cartonsPerPallet: number;
  cartonsPerLayer: number;
  layers: number;
  unitsPerCarton: number;
  totalCartons: number;
  totalUnits: number;
  /** The product alone, kg. */
  netWeightKg: number;
  /** Every pallet including its deck, kg — what the load weighs. */
  grossWeightKg: number;
  /** One pallet, deck and cartons, kg. */
  loadedPalletWeightKg: number;
  cbm: number;
  /**
   * Carton volume as a share of the stack the pallets allow (footprint × stack height,
   * deck included). Empty space is the gap between the cartons and that envelope.
   */
  spaceUtilizationPct: number;
  /** Requirement A3: which ceiling capped the pallet first. */
  limitingFactor: 'WEIGHT' | 'STACK_HEIGHT';
  basis: CapacityBasis;
  assumptions: string[];
}

/**
 * The capacity of a whole number of pallets.
 *
 * The cartons per pallet come from the engine, so a pallet capped by its weight ceiling
 * reports the weight-limited count and says which ceiling bound it.
 */
export function palletCapacity(product: CapacityProduct, pallets: number): PalletCapacity {
  const layout = derivePalletLayout(product.packaging);
  const cartonsPerPallet = layout.cartonsPerPallet;
  const totalCartons = cartonsPerPallet * pallets;
  const totalUnits = totalCartons * product.packaging.cartonQty;

  const stackedVolumeCbm =
    (product.packaging.palletLengthCm *
      product.packaging.palletWidthCm *
      product.packaging.maxStackHeightCm) /
    1_000_000;
  const cbm = round(layout.palletCbm * pallets, 4);

  return {
    pallets,
    layout,
    cartonsPerPallet,
    cartonsPerLayer: layout.cartonsPerLayer,
    layers: layout.layers,
    unitsPerCarton: product.packaging.cartonQty,
    totalCartons,
    totalUnits,
    netWeightKg: round(totalUnits * product.netUnitWeightKg, 3),
    grossWeightKg: round(layout.palletGrossWeightKg * pallets, 3),
    loadedPalletWeightKg: layout.palletGrossWeightKg,
    cbm,
    spaceUtilizationPct: stackedVolumeCbm > 0
      ? round(((layout.cartonCbmPerPallet * pallets) / (stackedVolumeCbm * pallets)) * 100, 1)
      : 0,
    // The engine sets `weightLimited` when the pallet's gross-weight ceiling reduced the
    // carton count below what the geometry allowed; otherwise the stack height bound it.
    limitingFactor: layout.weightLimited ? 'WEIGHT' : 'STACK_HEIGHT',
    basis: capacityBasis(product),
    assumptions: layout.assumptions,
  };
}

/** A requested quantity expressed as cartons, pallets and weights. */
export interface QuantityCapacity {
  units: number;
  cartons: number;
  palletsRequired: number;
  fullPallets: number;
  /** Share of the last pallet in use, %. */
  lastPalletUtilizationPct: number;
  netWeightKg: number;
  grossWeightKg: number;
  cbm: number;
  layout: PalletLayout;
  basis: CapacityBasis;
}

/** The reverse question: how many pallets a number of units needs. */
export function quantityCapacity(product: CapacityProduct, units: number): QuantityCapacity {
  const load = computePalletLoad(product, units);
  return {
    units: load.units,
    cartons: load.cartons,
    palletsRequired: load.palletsRequired,
    fullPallets: load.fullPallets,
    lastPalletUtilizationPct: load.partialPalletPct,
    netWeightKg: load.netWeightKg,
    grossWeightKg: load.grossWeightKg,
    cbm: load.cbm,
    layout: load.layout,
    basis: capacityBasis(product),
  };
}

/** Requirement A4: whether the selected pallet count is enough for the quantity asked for. */
export interface PalletCountVerdict {
  requestedUnits: number;
  pallets: number;
  /** What the selected pallets hold. */
  capacityUnits: number;
  /** Capacity minus requested: negative means the load is short. */
  differenceUnits: number;
  verdict: 'FITS' | 'SHORT';
  /** True when the quantity lands exactly on the last pallet's capacity. */
  exact: boolean;
}

export function palletCountVerdict(input: {
  product: CapacityProduct;
  pallets: number;
  requestedUnits: number;
}): PalletCountVerdict {
  const capacity = palletCapacity(input.product, input.pallets);
  const differenceUnits = capacity.totalUnits - input.requestedUnits;
  return {
    requestedUnits: input.requestedUnits,
    pallets: input.pallets,
    capacityUnits: capacity.totalUnits,
    differenceUnits,
    verdict: differenceUnits < 0 ? 'SHORT' : 'FITS',
    exact: differenceUnits === 0,
  };
}

/** How much of one product a container profile accepts. */
export interface ContainerCapacity {
  /** The container this describes. */
  container: { id: string; name: string };
  /** False when not even one carton fits — the reasons are in `warnings`. */
  fits: boolean;
  units: number;
  cartons: number;
  /** Pallets the load comes to, counted as the desk would. */
  pallets: number;
  netWeightKg: number;
  grossWeightKg: number;
  cbm: number;
  practicalCbmLimit: number;
  weightUtilizationPct: number;
  volumeUtilizationPct: number;
  rawVolumeUtilizationPct: number;
  limitingFactor: 'WEIGHT' | 'VOLUME' | 'NONE';
  /** The fit's own warnings, which is how the engine says why it will not fit. */
  warnings: string[];
  basis: CapacityBasis;
}

/**
 * The most cartons of this product the container accepts, according to `containerFit`.
 *
 * The engine decides what fits — the same verdict the recommendation and the quote route
 * use — and this searches for the largest carton count that it does not warn about. A
 * formula of our own could disagree with the engine, and then a capacity screen and a
 * quotation would quote different loads.
 */
export function containerCapacity(
  product: CapacityProduct,
  profile: ContainerProfile,
  ceiling = 20_000
): ContainerCapacity {
  const basis = capacityBasis(product);
  const unitsForCartons = (cartons: number) => cartons * product.packaging.cartonQty;
  const fitForCartons = (cartons: number): ContainerFit => {
    const load = computePalletLoad(product, unitsForCartons(cartons));
    return containerFit(profile, {
      cargoCbm: load.cargoCbm,
      cbm: load.cbm,
      grossWeightKg: load.grossWeightKg,
      pallets: load.palletsRequired,
      packaging: product.packaging,
    });
  };

  // A carton that holds nothing has no carton count to search for, and asking the engine
  // to price a zero-unit load would throw. Report it as the profile problem it is.
  if (product.packaging.cartonQty <= 0) {
    return {
      container: { id: profile.id, name: profile.name },
      fits: false,
      units: 0,
      cartons: 0,
      pallets: 0,
      netWeightKg: 0,
      grossWeightKg: 0,
      cbm: 0,
      practicalCbmLimit: round(profile.usableCbm * profile.practicalVolumeFactor, 3),
      weightUtilizationPct: 0,
      volumeUtilizationPct: 0,
      rawVolumeUtilizationPct: 0,
      limitingFactor: 'NONE',
      warnings: ['Units per carton is not set, so a carton count cannot be worked out.'],
      basis,
    };
  }

  const oneCarton = fitForCartons(1);
  if (oneCarton.warnings.length > 0) {
    return {
      container: { id: profile.id, name: profile.name },
      fits: false,
      units: 0,
      cartons: 0,
      pallets: 0,
      netWeightKg: 0,
      grossWeightKg: 0,
      cbm: 0,
      practicalCbmLimit: oneCarton.practicalCbmLimit,
      weightUtilizationPct: oneCarton.weightUtilizationPct,
      volumeUtilizationPct: oneCarton.volumeUtilizationPct,
      rawVolumeUtilizationPct: oneCarton.rawVolumeUtilizationPct,
      limitingFactor: oneCarton.limitingFactor,
      warnings: oneCarton.warnings,
      basis,
    };
  }

  let low = 1;
  let high = 1;
  // Grow until it stops fitting, then binary-search the boundary.
  while (high < ceiling && fitForCartons(high).warnings.length === 0) {
    low = high;
    high = Math.min(ceiling, high * 2);
  }
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (fitForCartons(middle).warnings.length === 0) low = middle;
    else high = middle - 1;
  }

  const cartons = low;
  const load = computePalletLoad(product, unitsForCartons(cartons));
  const fit = fitForCartons(cartons);

  return {
    container: { id: profile.id, name: profile.name },
    fits: true,
    units: load.units,
    cartons: load.cartons,
    pallets: load.palletsRequired,
    netWeightKg: load.netWeightKg,
    grossWeightKg: load.grossWeightKg,
    cbm: load.cbm,
    practicalCbmLimit: fit.practicalCbmLimit,
    weightUtilizationPct: fit.weightUtilizationPct,
    volumeUtilizationPct: fit.volumeUtilizationPct,
    rawVolumeUtilizationPct: fit.rawVolumeUtilizationPct,
    limitingFactor: fit.limitingFactor,
    warnings: fit.warnings,
    basis,
  };
}

/** Pounds, for the weights the owner reads on a packing list. */
export function kgToLb(kg: number): number {
  return toWeightLbs(kg, 'kg') ?? kg;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
