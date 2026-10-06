/**
 * The wholesale calculation engine.
 *
 * Pure functions over the types in `./types` — no I/O, no database, no clock
 * beyond what the caller passes in. That is deliberate: a container's numbers
 * are the thing an owner signs a contract on, so they must be reproducible from
 * the stored snapshot alone, and testable without a network.
 *
 * Three rules the engine never breaks:
 *   1. It refuses to guess. A missing exchange rate is an error, not 1:1.
 *   2. It states the limiting factor. Weight and volume are both computed, and
 *      whichever binds is named.
 *   3. It never overfills silently. Every ceiling that is crossed comes back as
 *      a warning alongside the numbers.
 */

import type {
  ContainerProfile,
  CostProfile,
  FxSnapshot,
  Incoterm,
  PackagingProfile,
  QuoteLine,
  QuoteTotals,
  WholesalePriceTier,
  WholesaleProduct,
} from './types';

/** A calculation the engine refuses to fake. */
export class WholesaleEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WholesaleEngineError';
  }
}

const CM3_PER_CBM = 1_000_000;
const round = (value: number, places = 4) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/* ------------------------------------------------------------------ */
/* Pallets                                                             */
/* ------------------------------------------------------------------ */

export interface PalletLayout {
  /** Cartons that fit on one layer, in the better of the two orientations. */
  cartonsPerLayer: number;
  /** Layers that fit under the stack height. */
  layers: number;
  cartonsPerPallet: number;
  unitsPerPallet: number;
  /** Gross weight of a full pallet, kg. */
  palletGrossWeightKg: number;
  /** Loaded cargo volume of a full pallet, CBM. */
  cartonCbmPerPallet: number;
  /** Total volume a pallet occupies, CBM (cargo + deck footprint). */
  palletCbm: number;
  /** True when the weight ceiling, not the stack height, capped the pallet. */
  weightLimited: boolean;
  assumptions: string[];
}

function cartonCbm(profile: PackagingProfile): number {
  return (profile.cartonLengthCm * profile.cartonWidthCm * profile.cartonHeightCm) / CM3_PER_CBM;
}

function deckCbm(profile: PackagingProfile): number {
  return (profile.palletLengthCm * profile.palletWidthCm * profile.palletDeckHeightCm) / CM3_PER_CBM;
}

/**
 * How many cartons and units a pallet holds.
 *
 * When the owner has supplied `cartonsPerLayer`/`layers` those are used as
 * given; otherwise they are derived from the carton and pallet dimensions in
 * both orientations, and from the stack height. A pallet gross-weight ceiling,
 * when set, caps the carton count and the result says so.
 */
export function derivePalletLayout(profile: PackagingProfile): PalletLayout {
  const assumptions: string[] = [];
  const cartonCbmEach = cartonCbm(profile);

  const alongLength = Math.floor(profile.palletLengthCm / profile.cartonLengthCm)
    * Math.floor(profile.palletWidthCm / profile.cartonWidthCm);
  const rotated = Math.floor(profile.palletLengthCm / profile.cartonWidthCm)
    * Math.floor(profile.palletWidthCm / profile.cartonLengthCm);
  const derivedPerLayer = Math.max(alongLength, rotated, 0);

  const cartonsPerLayer = profile.cartonsPerLayer && profile.cartonsPerLayer > 0
    ? Math.floor(profile.cartonsPerLayer)
    : derivedPerLayer;
  if (!profile.cartonsPerLayer) {
    assumptions.push(
      `Cartons per layer derived from the footprint: ${cartonsPerLayer} (${profile.palletLengthCm}×${profile.palletWidthCm} cm pallet, ${profile.cartonLengthCm}×${profile.cartonWidthCm} cm carton, better orientation).`
    );
  }

  const stackableHeight = Math.max(profile.maxStackHeightCm - profile.palletDeckHeightCm, 0);
  const derivedLayers = Math.floor(stackableHeight / profile.cartonHeightCm);
  const layers = profile.layers && profile.layers > 0 ? Math.floor(profile.layers) : derivedLayers;
  if (!profile.layers) {
    assumptions.push(
      `Layers derived from the stack height: ${layers} (${profile.maxStackHeightCm} cm limit − ${profile.palletDeckHeightCm} cm deck, ÷ ${profile.cartonHeightCm} cm carton).`
    );
  }

  if (cartonsPerLayer <= 0 || layers <= 0) {
    throw new WholesaleEngineError(
      'This packaging profile cannot hold a single carton: check the carton and pallet dimensions and the stack height.'
    );
  }

  let cartonsPerPallet = cartonsPerLayer * layers;
  let weightLimited = false;
  const ceiling = profile.maxPalletGrossWeightKg;
  if (ceiling && ceiling > 0) {
    const byWeight = Math.floor(Math.max(ceiling - profile.palletTareKg, 0) / profile.cartonGrossWeightKg);
    if (byWeight < cartonsPerPallet) {
      cartonsPerPallet = byWeight;
      weightLimited = true;
      assumptions.push(
        `Reduced to ${cartonsPerPallet} cartons by the ${ceiling} kg pallet gross-weight ceiling (deck ${profile.palletTareKg} kg + ${cartonsPerPallet} × ${profile.cartonGrossWeightKg} kg carton).`
      );
    }
  }
  if (cartonsPerPallet <= 0) {
    throw new WholesaleEngineError(
      'The pallet weight ceiling leaves no room for a single carton: check the carton gross weight and the pallet ceiling.'
    );
  }

  return {
    cartonsPerLayer,
    layers,
    cartonsPerPallet,
    unitsPerPallet: cartonsPerPallet * profile.cartonQty,
    palletGrossWeightKg: round(profile.palletTareKg + cartonsPerPallet * profile.cartonGrossWeightKg, 3),
    cartonCbmPerPallet: round(cartonsPerPallet * cartonCbmEach, 4),
    palletCbm: round(cartonsPerPallet * cartonCbmEach + deckCbm(profile), 4),
    weightLimited,
    assumptions,
  };
}

export interface PalletLoad {
  productId: string;
  name: string;
  units: number;
  cartons: number;
  /** Whole pallets, filled to the pallet's own capacity. */
  fullPallets: number;
  /** The last, part-loaded pallet is still a pallet on a truck. */
  palletsRequired: number;
  unitsOnLastPallet: number;
  netWeightKg: number;
  grossWeightKg: number;
  /** Loaded cargo volume, CBM. */
  cargoCbm: number;
  /** Cargo plus the pallet decks it stands on, CBM. */
  cbm: number;
  layout: PalletLayout;
  merchandiseCost: number;
  assumptions: string[];
  /** Decimal representation of pallets (e.g., 1.25) */
  palletEquivalent: number;
  /** Percentage of the last pallet used (0-100), 0 if none or full. */
  partialPalletPct: number;
}

/**
 * A quantity of one product expressed as cartons, pallets, weight and volume.
 *
 * `units` is the authoritative input. Callers that start from pallets convert
 * first (`unitsFromPallets`) so there is one path through the math.
 */
export function computePalletLoad(product: WholesaleProduct, units: number): PalletLoad {
  if (!Number.isFinite(units) || units <= 0) {
    throw new WholesaleEngineError(`${product.name}: the quantity must be a positive number of units.`);
  }
  const layout = derivePalletLayout(product.packaging);
  const cartons = Math.ceil(units / product.packaging.cartonQty);
  const fullPallets = Math.floor(cartons / layout.cartonsPerPallet);
  const remainderCartons = cartons % layout.cartonsPerPallet;
  const palletsRequired = fullPallets + (remainderCartons > 0 ? 1 : 0);
  const unitsOnLastPallet = remainderCartons > 0 ? remainderCartons * product.packaging.cartonQty : 0;

  return {
    productId: product.id,
    name: product.name,
    units,
    cartons,
    fullPallets,
    palletsRequired,
    unitsOnLastPallet,
    netWeightKg: round(units * product.netUnitWeightKg, 3),
    grossWeightKg: round(cartons * product.packaging.cartonGrossWeightKg + palletsRequired * product.packaging.palletTareKg, 3),
    cargoCbm: round(cartons * cartonCbm(product.packaging), 4),
    cbm: round(cartons * cartonCbm(product.packaging) + palletsRequired * deckCbm(product.packaging), 4),
    layout,
    merchandiseCost: round(units * product.exFactoryCost, 2),
    assumptions: layout.assumptions,
    palletEquivalent: round(fullPallets + (remainderCartons / layout.cartonsPerPallet), 2),
    partialPalletPct: remainderCartons > 0 ? round((remainderCartons / layout.cartonsPerPallet) * 100, 1) : 0,
  };
}

/** Units implied by a whole number of pallets of one product. */
export function unitsFromPallets(product: WholesaleProduct, pallets: number): number {
  if (!Number.isFinite(pallets) || pallets <= 0) {
    throw new WholesaleEngineError(`${product.name}: the pallet count must be a positive number.`);
  }
  return Math.floor(pallets) * derivePalletLayout(product.packaging).unitsPerPallet;
}

/** The price tier that applies at a quantity, or null when none is defined. */
export function priceTierFor(tiers: WholesalePriceTier[], productId: string, units: number): WholesalePriceTier | null {
  const applicable = tiers
    .filter((tier) => tier.productId === productId && units >= tier.minUnits)
    .sort((a, b) => b.minUnits - a.minUnits);
  return applicable[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Containers                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* How many pallets a container actually holds                         */
/* ------------------------------------------------------------------ */

export interface PalletCapacity {
  /** Pallet footprints that fit on the container floor, in the better orientation. */
  positions: number;
  /** Loaded pallets that may be stacked on each footprint. */
  tiers: number;
  /** Floor positions × tiers. */
  byFloor: number;
  /** Loaded pallets the cargo weight ceiling allows. */
  byWeight: number;
  /** The answer: the tightest of the ceilings above. */
  capacity: number;
  /** Which ceiling binds, or `ASSUMED` when the box's inside was never measured. */
  limitingFactor: 'FLOOR' | 'TIERS' | 'WEIGHT' | 'ASSUMED';
  /** Height of one loaded pallet, cm (deck + the cartons on it). */
  loadedHeightCm: number;
  /** Gross weight of one loaded pallet, kg. */
  palletGrossWeightKg: number;
  assumptions: string[];
}

/**
 * How many pallets of one product a container holds.
 *
 * Counting pallets by cubic metres alone is the mistake this exists to remove: a load
 * can sit comfortably inside a container's volume and still not fit on its floor, and a
 * load can fit on the floor and still be too heavy, or too tall to double-stack. So
 * three ceilings are computed — floor positions, stacking height, cargo weight — and the
 * smallest one is the answer, named.
 *
 * No overhang is assumed: a pallet that does not fit inside the box is not counted.
 * That makes the figure lower than a brochure's "21 pallets" in the 40ft case, and it is
 * the figure a loading plan can actually be built on.
 *
 * When the container's internal dimensions are not recorded, there is nothing honest to
 * count: the profile's own `palletCapacity` is returned and labelled `ASSUMED`.
 */
export function containerPalletCapacity(
  container: ContainerProfile,
  packaging: PackagingProfile
): PalletCapacity {
  const layout = derivePalletLayout(packaging);
  const loadedHeightCm = round(packaging.palletDeckHeightCm + layout.layers * packaging.cartonHeightCm, 1);
  const palletGrossWeightKg = layout.palletGrossWeightKg;
  const assumptions: string[] = [];

  if (!container.internalLengthCm || !container.internalWidthCm || !container.internalHeightCm) {
    const assumed = container.palletCapacity ?? 0;
    return {
      positions: 0,
      tiers: 0,
      byFloor: 0,
      byWeight: Math.floor(container.maxCargoWeightKg / Math.max(palletGrossWeightKg, 0.001)),
      capacity: assumed,
      limitingFactor: 'ASSUMED',
      loadedHeightCm,
      palletGrossWeightKg,
      assumptions: [
        `No internal dimensions are recorded for ${container.name}, so the pallet count is the profile's assumed ${assumed} rather than a counted figure. Enter the box's inside length, width and height to have it worked out.`,
      ],
    };
  }

  const alongLength =
    Math.floor(container.internalLengthCm / packaging.palletLengthCm) *
    Math.floor(container.internalWidthCm / packaging.palletWidthCm);
  const rotated =
    Math.floor(container.internalLengthCm / packaging.palletWidthCm) *
    Math.floor(container.internalWidthCm / packaging.palletLengthCm);
  const positions = Math.max(alongLength, rotated, 0);
  const tiers = Math.max(Math.floor(container.internalHeightCm / loadedHeightCm), 0);
  const byFloor = positions * tiers;
  const byWeight = Math.floor(container.maxCargoWeightKg / Math.max(palletGrossWeightKg, 0.001));

  // What caps the count, said plainly: weight before the floor, the floor when nothing
  // can be stacked on it (one tier), or the stacking itself when it can.
  const limitingFactor: PalletCapacity['limitingFactor'] =
    byWeight <= byFloor ? 'WEIGHT' : tiers <= 1 ? 'FLOOR' : 'TIERS';
  const capacity = Math.min(byFloor, byWeight);

  assumptions.push(
    `Counted from the box's inside: ${positions} pallet position(s) on the floor (${packaging.palletLengthCm}×${packaging.palletWidthCm} cm pallet in a ${container.internalLengthCm}×${container.internalWidthCm} cm box, no overhang) × ${tiers} tier(s) at ${loadedHeightCm} cm loaded against ${container.internalHeightCm} cm of height.`
  );
  if (limitingFactor === 'WEIGHT') {
    assumptions.push(
      `Weight binds before the floor does: ${container.maxCargoWeightKg} kg of payload ÷ ${palletGrossWeightKg} kg per loaded pallet = ${byWeight} pallet(s).`
    );
  }
  if (tiers <= 1) {
    assumptions.push(
      `Only one tier fits (${loadedHeightCm} cm loaded against ${container.internalHeightCm} cm inside), so the floor count is the capacity. Every pallet must be reachable from the doors.`
    );
  }
  if (tiers > 1) {
    assumptions.push(
      `${tiers} tiers are possible because a loaded pallet is ${loadedHeightCm} cm against ${container.internalHeightCm} cm of internal height — check the door height with the forwarder before loading this way.`
    );
  }

  return { positions, tiers, byFloor, byWeight, capacity, limitingFactor, loadedHeightCm, palletGrossWeightKg, assumptions };
}

export interface ContainerFit {
  container: ContainerProfile;
  /** Volume the owner should plan against: usable CBM × practical factor. */
  practicalCbmLimit: number;
  cargoCbm: number;
  grossWeightKg: number;
  weightUtilizationPct: number;
  /** Against the practical volume ceiling. */
  volumeUtilizationPct: number;
  /** Against the container's raw usable volume, for reference. */
  rawVolumeUtilizationPct: number;
  /** Which ceiling binds first. */
  limitingFactor: 'WEIGHT' | 'VOLUME' | 'NONE';
  remainingWeightKg: number;
  remainingCbm: number;
  pallets: number;
  palletCapacity: number | null;
  /**
   * The counted pallet capacity for this load's pallet footprint, when the box's inside
   * dimensions are known — how many pallets it really holds, and what limits that.
   */
  palletLimit: PalletCapacity | null;
  /** Owner-actionable problems, in the order they would bite. */
  warnings: string[];
}

export function containerFit(
  container: ContainerProfile,
  load: { cargoCbm: number; cbm: number; grossWeightKg: number; pallets: number; packaging?: PackagingProfile }
): ContainerFit {
  const practicalCbmLimit = round(container.usableCbm * container.practicalVolumeFactor, 3);
  const weightUtilizationPct = round((load.grossWeightKg / container.maxCargoWeightKg) * 100, 1);
  const volumeUtilizationPct = round((load.cbm / practicalCbmLimit) * 100, 1);
  const rawVolumeUtilizationPct = round((load.cbm / container.usableCbm) * 100, 1);

  const warnings: string[] = [];
  let limitingFactor: ContainerFit['limitingFactor'] = 'NONE';
  if (load.cbm > 0 || load.grossWeightKg > 0) {
    limitingFactor = weightUtilizationPct >= volumeUtilizationPct ? 'WEIGHT' : 'VOLUME';
  }
  if (load.grossWeightKg > container.maxCargoWeightKg) {
    warnings.push(
      `Over the weight limit by ${round(load.grossWeightKg - container.maxCargoWeightKg, 1)} kg (${round(weightUtilizationPct, 1)}% of ${container.maxCargoWeightKg} kg).`
    );
  }
  if (load.cbm > container.usableCbm) {
    warnings.push(
      `Over the container's usable volume of ${container.usableCbm} CBM. This load cannot ship as one ${container.name}.`
    );
  } else if (load.cbm > practicalCbmLimit) {
    warnings.push(
      `Above the practical loading volume (${practicalCbmLimit} CBM at ${Math.round(container.practicalVolumeFactor * 100)}% of ${container.usableCbm} CBM). It may not physically fit with pallets.`
    );
  }
  // The pallet check is the *counted* one when the box and the pallet are both known:
  // floor positions × stackable tiers, or the weight ceiling, whichever binds. The
  // profile's `palletCapacity` is only consulted when nothing can be counted, and then
  // it is called an assumption.
  const palletLimit = load.packaging ? containerPalletCapacity(container, load.packaging) : null;
  if (palletLimit && palletLimit.capacity > 0 && load.pallets > palletLimit.capacity) {
    warnings.push(
      `Holds ${load.pallets} pallets against ${palletLimit.capacity} that fit: ${palletLimit.positions} position(s) on the floor × ${palletLimit.tiers} tier(s)` +
        (palletLimit.limitingFactor === 'WEIGHT' ? `, or ${palletLimit.byWeight} by weight` : '') +
        `. It needs more than one container.`
    );
  } else if (!palletLimit && container.palletCapacity && load.pallets > container.palletCapacity) {
    warnings.push(`Holds ${load.pallets} pallets against an assumed capacity of ${container.palletCapacity}.`);
  }

  return {
    container,
    practicalCbmLimit,
    cargoCbm: round(load.cargoCbm, 3),
    grossWeightKg: round(load.grossWeightKg, 3),
    weightUtilizationPct,
    volumeUtilizationPct,
    rawVolumeUtilizationPct,
    limitingFactor,
    remainingWeightKg: round(container.maxCargoWeightKg - load.grossWeightKg, 1),
    remainingCbm: round(container.usableCbm - load.cbm, 3),
    pallets: load.pallets,
    palletCapacity: container.palletCapacity,
    palletLimit,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Mixed loads                                                         */
/* ------------------------------------------------------------------ */

export interface MixedLoadInput {
  product: WholesaleProduct;
  /** Either a unit quantity or a whole number of pallets — not both. */
  units?: number;
  pallets?: number;
}

export interface MixedLoad {
  lines: PalletLoad[];
  totals: {
    units: number;
    cartons: number;
    pallets: number;
    netWeightKg: number;
    grossWeightKg: number;
    cargoCbm: number;
    cbm: number;
    merchandiseCost: number;
  };
  fit: ContainerFit;
  warnings: string[];
}

/**
 * A container of several products.
 *
 * Every line is computed by the same pallet math as a single-product load, then
 * summed. Nothing is packed "to fill the box": the caller's quantities are the
 * input, and a load that does not fit says so.
 */
export function buildMixedLoad(
  container: ContainerProfile,
  items: MixedLoadInput[]
): MixedLoad {
  if (!items.length) {
    throw new WholesaleEngineError('A mixed load needs at least one product.');
  }
  const lines = items.map((item) => {
    if (item.units && item.pallets) {
      throw new WholesaleEngineError(`${item.product.name}: give either units or pallets, not both.`);
    }
    const units = item.pallets ? unitsFromPallets(item.product, item.pallets) : (item.units ?? 0);
    return computePalletLoad(item.product, units);
  });

  const sum = (pick: (line: PalletLoad) => number) => round(lines.reduce((total, line) => total + pick(line), 0), 4);
  const totals = {
    units: lines.reduce((total, line) => total + line.units, 0),
    cartons: lines.reduce((total, line) => total + line.cartons, 0),
    pallets: lines.reduce((total, line) => total + line.palletsRequired, 0),
    netWeightKg: sum((line) => line.netWeightKg),
    grossWeightKg: sum((line) => line.grossWeightKg),
    cargoCbm: sum((line) => line.cargoCbm),
    cbm: sum((line) => line.cbm),
    merchandiseCost: round(sum((line) => line.merchandiseCost), 2),
  };

  // A pallet count can only be counted from one footprint. When every line stands on
  // the same pallet size, the box's floor can be counted against it; a genuinely mixed
  // pallet load falls back to the profile's assumption, and says so rather than
  // pretending one product's footprint describes the others.
  const palletKey = (packaging: PackagingProfile) => `${packaging.palletLengthCm}×${packaging.palletWidthCm}`;
  const keys = new Set(items.map((item) => palletKey(item.product.packaging)));
  const common = keys.size === 1 ? items[0].product.packaging : undefined;

  const fit = containerFit(container, { ...totals, packaging: common });
  const mixed: string[] = [...fit.warnings];
  if (!common) {
    mixed.push(
      'These lines stand on different pallet footprints, so the container’s floor positions cannot be counted from one of them. The pallet figure here is the profile’s assumption.'
    );
  }
  return { lines, totals, fit, warnings: mixed };
}

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert with an explicit snapshot.
 *
 * Returns null when no rate was supplied: the caller must decide, because
 * treating an unknown rate as 1:1 is how a PKR cost becomes a dollar cost.
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  snapshots: FxSnapshot[]
): number | null {
  if (from === to) return round(amount, 4);
  const direct = snapshots.find((snap) => snap.from === from && snap.to === to);
  if (direct) return round(amount * direct.rate, 4);
  const inverse = snapshots.find((snap) => snap.from === to && snap.to === from);
  if (inverse && inverse.rate !== 0) return round(amount / inverse.rate, 4);
  return null;
}

/** Convert or fail loudly, naming the pair the quote is missing. */
export function requireConversion(amount: number, from: string, to: string, snapshots: FxSnapshot[]): number {
  const converted = convertAmount(amount, from, to, snapshots);
  if (converted === null) {
    throw new WholesaleEngineError(
      `No ${from}→${to} exchange rate was supplied for this quote. Add the rate (or override it) rather than assuming one.`
    );
  }
  return converted;
}

/* ------------------------------------------------------------------ */
/* Incoterms & landed cost                                             */
/* ------------------------------------------------------------------ */

/** One cost component, and whether the chosen basis includes it. */
export interface CostLine {
  key: string;
  label: string;
  amount: number;
  /** True when this basis (EXW…CIF) already carries the charge. */
  included: boolean;
  /** True when the charge is beyond the chosen basis and shown for context. */
  beyondBasis: boolean;
  note?: string;
}

export interface LandedCostInput {
  lines: QuoteLine[];
  containers: number;
  cartons: number;
  pallets: number;
  netWeightKg: number;
  costProfile: CostProfile;
  incoterm: Incoterm;
  freight: { oceanFreight: number; surcharges: Array<{ label: string; amount: number }>; currency: string } | null;
  /** Rate snapshots; every non-quote-currency amount is converted with these. */
  fx: FxSnapshot[];
  currency: string;
  /** The owner may add destination-side costs to the displayed total. */
  includeDestination?: boolean;
  includeDuty?: boolean;
}

/**
 * Merchandise plus every configured charge, with the chosen basis deciding what
 * the quoted total carries.
 *
 * EXW carries the goods and the packaging surcharge. FOB adds the origin side up
 * to and including the port. CFR adds the ocean freight. CIF adds insurance.
 * Destination charges and duty are shown as context and are only in the total
 * when the owner asks for them — they are not universal truths.
 */
export function buildCostLines(input: LandedCostInput): { lines: CostLine[]; totals: QuoteTotals; assumptions: string[] } {
  const { costProfile, incoterm, containers, currency, fx } = input;
  const assumptions: string[] = [];
  const merchandise = input.lines.reduce((total, line) => total + line.units * line.exFactoryUnitCost, 0);

  // A product with no ex-factory cost is *missing data*, not free goods. Left unsaid,
  // the merchandise line reads zero and the quote shows a margin that is arithmetic
  // rather than trade — the one thing this module refuses to do silently. (A product
  // can be created before it is priced, so this is reachable from the console: type a
  // name, save, and quote it.)
  const withoutCost = input.lines.filter((line) => !(line.exFactoryUnitCost > 0));
  if (withoutCost.length) {
    assumptions.push(
      `No ex-factory cost is recorded for ${withoutCost
        .map((line) => line.name || 'a line')
        .join(', ')}, so the goods are counted as free. That is missing data, not a price — set the cost on the product before this quote is sent.`
    );
  }
  const convert = (amount: number, from: string, label: string) => {
    try {
      return requireConversion(amount, from, currency, fx);
    } catch (error) {
      throw new WholesaleEngineError(`${label}: ${(error as Error).message}`);
    }
  };

  const packaging = convert(costProfile.packagingSurcharge * containers, costProfile.currency, 'Packaging surcharge');
  const inland = convert(costProfile.inlandTransport * containers, costProfile.currency, 'Inland transport');
  const stuffing = convert(costProfile.stuffing * containers, costProfile.currency, 'Stuffing/loading');
  const documentation = convert(costProfile.documentation * containers, costProfile.currency, 'Export documentation');
  const originTerminal = convert(costProfile.originTerminal * containers, costProfile.currency, 'Origin terminal');
  const originCustoms = convert(costProfile.originCustoms * containers, costProfile.currency, 'Origin customs');
  const inspection = convert(costProfile.inspection * containers, costProfile.currency, 'Inspection');
  const forwarding = convert(costProfile.forwarding * containers, costProfile.currency, 'Forwarding');
  const other = convert(costProfile.otherAmount * containers, costProfile.currency, costProfile.otherLabel || 'Other charge');

  const freightBase = input.freight ? convert(input.freight.oceanFreight * containers, input.freight.currency, 'Ocean freight') : 0;
  const surchargeTotal = input.freight
    ? input.freight.surcharges.reduce((total, charge) => total + convert(charge.amount * containers, input.freight!.currency, `Surcharge ${charge.label}`), 0)
    : 0;
  const oceanFreight = round(freightBase + surchargeTotal, 2);
  if (!input.freight) {
    assumptions.push('No ocean freight is attached to this quote, so CFR and CIF would be incomplete. Add a rate or use EXW/FOB.');
  }

  const originCharges = round(stuffing + documentation + originTerminal + originCustoms + inspection + forwarding + other, 2);

  const baseForInsurance = merchandise + inland + originCharges + oceanFreight;
  const insurance = round((costProfile.insurancePct / 100) * baseForInsurance, 2);

  const destinationCharges = round(convert(
    (costProfile.destinationTerminal
      + costProfile.destinationHandling
      + costProfile.destinationCustomsBroker
      + costProfile.destinationDelivery
      + costProfile.destinationWarehouse
      + costProfile.destinationOther) * containers,
    costProfile.currency,
    'Destination charges'
  ), 2);

  const dutiable = merchandise + inland + originCharges + oceanFreight + insurance;
  const duty = round((costProfile.dutyPct / 100) * dutiable, 2);
  if (costProfile.dutyPct === 0) {
    assumptions.push('Duty/tax is 0% on this cost profile, so the landed total excludes it. Set the rate on the cost profile when you know it.');
  }

  const carriesFreight = incoterm === 'CFR' || incoterm === 'CIF';
  const carriesInsurance = incoterm === 'CIF';
  const carriesOrigin = incoterm !== 'EXW';

  const lines: CostLine[] = [
    { key: 'merchandise', label: 'Merchandise (ex-factory)', amount: round(merchandise, 2), included: true, beyondBasis: false },
    { key: 'packaging', label: 'Packaging surcharge', amount: packaging, included: true, beyondBasis: false },
    { key: 'inland', label: 'Inland transport', amount: inland, included: carriesOrigin, beyondBasis: false },
    { key: 'stuffing', label: 'Stuffing / loading', amount: stuffing, included: carriesOrigin, beyondBasis: false },
    { key: 'documentation', label: 'Export documentation', amount: documentation, included: carriesOrigin, beyondBasis: false },
    { key: 'originTerminal', label: 'Origin terminal / port', amount: originTerminal, included: carriesOrigin, beyondBasis: false },
    { key: 'originCustoms', label: 'Origin customs / export handling', amount: originCustoms, included: carriesOrigin, beyondBasis: false },
    { key: 'inspection', label: 'Inspection', amount: inspection, included: carriesOrigin, beyondBasis: false },
    { key: 'forwarding', label: 'Forwarding', amount: forwarding, included: carriesOrigin, beyondBasis: false },
    { key: 'other', label: costProfile.otherLabel || 'Other charge', amount: other, included: carriesOrigin, beyondBasis: false },
    { key: 'oceanFreight', label: 'Ocean freight', amount: oceanFreight, included: carriesFreight, beyondBasis: false },
    { key: 'insurance', label: `Insurance (${costProfile.insurancePct}% of merchandise + freight)`, amount: insurance, included: carriesInsurance, beyondBasis: false },
    {
      key: 'destination',
      label: 'Destination-side charges',
      amount: destinationCharges,
      included: false,
      beyondBasis: true,
      note: 'Beyond CIF: duty and destination charges depend on the buyer and the destination, so they are shown, not included.',
    },
    { key: 'duty', label: `Duty/tax (${costProfile.dutyPct}% of customs value)`, amount: duty, included: false, beyondBasis: true, note: 'Owner-set rate; set it to 0 when unknown.' },
  ];

  const total = round(
    lines.filter((line) => line.included).reduce((sum, line) => sum + line.amount, 0)
      + (input.includeDestination ? destinationCharges : 0)
      + (input.includeDuty ? duty : 0),
    2
  );

  const units = input.lines.reduce((sum, line) => sum + line.units, 0);
  const totals: QuoteTotals = {
    merchandise: round(merchandise, 2),
    packaging,
    inlandTransport: inland,
    originCharges,
    oceanFreight,
    insurance,
    destinationCharges,
    duty,
    total,
    perUnit: units > 0 ? round(total / units, 4) : 0,
    perCarton: input.cartons > 0 ? round(total / input.cartons, 2) : 0,
    perPallet: input.pallets > 0 ? round(total / input.pallets, 2) : 0,
    perKg: input.netWeightKg > 0 ? round(total / input.netWeightKg, 4) : 0,
    perContainer: input.containers > 0 ? round(total / input.containers, 2) : 0,
    currency,
  };

  assumptions.push(
    `Basis ${incoterm}: ${lines.filter((line) => line.included).map((line) => line.label).join(', ')}.`,
  );
  return { lines, totals, assumptions };
}

/* ------------------------------------------------------------------ */
/* Sell side                                                           */
/* ------------------------------------------------------------------ */

export interface SellSide {
  costPerUnit: number;
  sellPricePerUnit: number;
  marginPct: number;
  markupPct: number;
  grossProfitPerUnit: number;
}

/** Margin against the sell price, and markup against the cost — not the same number. */
export function computeSellSide(totals: QuoteTotals, sellPricePerUnit: number): SellSide {
  if (sellPricePerUnit <= 0) {
    throw new WholesaleEngineError('A sell price must be greater than zero.');
  }
  const costPerUnit = totals.perUnit;
  const grossProfitPerUnit = round(sellPricePerUnit - costPerUnit, 4);
  return {
    costPerUnit,
    sellPricePerUnit,
    marginPct: round((grossProfitPerUnit / sellPricePerUnit) * 100, 2),
    markupPct: costPerUnit > 0 ? round((grossProfitPerUnit / costPerUnit) * 100, 2) : 0,
    grossProfitPerUnit,
  };
}

/* ------------------------------------------------------------------ */
/* Sourcing model                                                      */
/* ------------------------------------------------------------------ */

export interface SourcingLaneInput {
  originCountry?: string | null;
  originPort?: string | null;
  destinationCountry?: string | null;
  destinationPort?: string | null;
}

export interface SourcingResolution {
  sourcingOriginCountry: string;
  physicalDestinationCountry: string;
  billingCountry: string;
  billedAsUsDelivery: boolean;
  valid: boolean;
  error?: string;
  note: string;
}

export function normalizeCountry(country?: string | null): string {
  const c = (country ?? '').trim().toLowerCase();
  if (/^(pakistan|pk|khewra|karachi)$/.test(c)) return 'Pakistan';
  if (/^(china|cn|shanghai)$/.test(c)) return 'China';
  if (/^(united kingdom|uk|gb|great britain|england|scotland|wales)$/.test(c)) return 'United Kingdom';
  if (/^(united states|usa|us|u\.s\.|america)$/.test(c)) return 'United States';
  return (country ?? '').trim();
}

/**
 * Himalayan Koh Sourcing Model:
 * - Goods are sourced from Pakistan (PKKHI) and China (CNSHA) and delivered to the USA.
 * - UK customers are served out of Pakistan, but MUST be billed as a USA delivery.
 * - UK delivery sourced from China is rejected by the sourcing model.
 */
export function resolveSourcingLane(input: SourcingLaneInput): SourcingResolution {
  const originHint = input.originCountry
    || (input.originPort?.toUpperCase().startsWith('PK') ? 'Pakistan' : input.originPort?.toUpperCase().startsWith('CN') ? 'China' : null);
  const destHint = input.destinationCountry
    || (input.destinationPort?.toUpperCase().startsWith('GB') ? 'United Kingdom' : input.destinationPort?.toUpperCase().startsWith('US') ? 'United States' : null);

  const normOrigin = normalizeCountry(originHint);
  const normDest = normalizeCountry(destHint);

  // UK destination rule: must be served out of Pakistan and billed as a USA delivery
  if (normDest === 'United Kingdom') {
    if (normOrigin === 'China') {
      return {
        sourcingOriginCountry: 'China',
        physicalDestinationCountry: 'United Kingdom',
        billingCountry: 'United States',
        billedAsUsDelivery: true,
        valid: false,
        error: 'UK customers must be served out of Pakistan, not China.',
        note: 'UK fulfillment rejected: goods for UK delivery must originate in Pakistan.',
      };
    }
    return {
      sourcingOriginCountry: 'Pakistan',
      physicalDestinationCountry: 'United Kingdom',
      billingCountry: 'United States',
      billedAsUsDelivery: true,
      valid: true,
      note: 'UK customer served out of Pakistan and billed as a USA delivery.',
    };
  }

  // USA or other destination
  return {
    sourcingOriginCountry: normOrigin || 'Pakistan',
    physicalDestinationCountry: normDest || 'United States',
    billingCountry: normDest === 'United States' || !normDest ? 'United States' : normDest,
    billedAsUsDelivery: false,
    valid: true,
    note: `Delivery to ${normDest || 'United States'} sourced from ${normOrigin || 'Pakistan'}.`,
  };
}

/* ------------------------------------------------------------------ */
/* LCL & Shipment Mode Intelligence                                    */
/* ------------------------------------------------------------------ */

import type { ShipmentMode, FreightRate, PackagingCompleteness } from './types';

export interface ShipmentRecommendation {
  mode: ShipmentMode;
  reason: string;
  isLclRecommended: boolean;
}

export function recommendShipmentMode(
  load: { cargoCbm: number; cbm: number; grossWeightKg: number; pallets: number },
  profiles: ContainerProfile[],
  freightRates: FreightRate[] = []
): ShipmentRecommendation {
  // If no cargo, default to AUTO (effectively wait for input)
  if (load.cbm === 0 && load.grossWeightKg === 0) {
    return { mode: 'AUTO', reason: 'No cargo added yet.', isLclRecommended: false };
  }

  // Calculate fits for all available container profiles
  const fits = profiles.map(profile => containerFit(profile, load));
  const validFits = fits.filter(fit => fit.warnings.length === 0);

  // Find LCL rates vs FCL rates
  const lclRates = freightRates.filter(r => r.containerType === 'LCL');
  const fclRates = freightRates.filter(r => r.containerType !== 'LCL');

  const lowestLcl = lclRates.length ? Math.min(...lclRates.map(r => r.oceanFreight)) : null;
  
  // If economics exist, they trump physical utilization, assuming it fits in an FCL.
  if (lowestLcl !== null && validFits.length > 0) {
    const validFclProfiles = validFits.map(f => f.container.id);
    const applicableFclRates = fclRates.filter(r => validFclProfiles.includes(r.containerType));
    
    if (applicableFclRates.length > 0) {
      const lowestFcl = Math.min(...applicableFclRates.map(r => r.oceanFreight));
      if (lowestLcl < lowestFcl) {
        return {
          mode: 'LCL',
          reason: `LCL is economically cheaper (${lowestLcl}) than the best FCL option (${lowestFcl}).`,
          isLclRecommended: true
        };
      } else {
        // FCL is cheaper despite perhaps being underutilized
        const cheapestFclRate = applicableFclRates.find(r => r.oceanFreight === lowestFcl);
        return {
          mode: cheapestFclRate!.containerType as ShipmentMode,
          reason: `FCL (${cheapestFclRate!.containerType}) is economically cheaper (${lowestFcl}) than LCL (${lowestLcl}), despite unused physical capacity.`,
          isLclRecommended: false
        };
      }
    }
  }

  // Fallback to purely physical thresholds if no economics are available
  // Typical LCL threshold is ~13-15 CBM or very low weight
  if (load.cbm < 13 && load.grossWeightKg < 10000) {
    return {
      mode: 'LCL',
      reason: `Shipment volume (${load.cbm} CBM) and weight are well below a full container threshold. LCL is physically recommended.`,
      isLclRecommended: true
    };
  }

  if (validFits.length === 0) {
    return {
      mode: 'AUTO', // Will be ignored by caller but indicates failure to fit
      reason: 'Shipment is too large for any single standard container.',
      isLclRecommended: false
    };
  }

  // Pick the smallest container that fits
  const sortedFits = validFits.sort((a, b) => a.container.usableCbm - b.container.usableCbm);
  const bestFit = sortedFits[0];

  return {
    mode: bestFit.container.id as ShipmentMode,
    reason: `${bestFit.container.name} provides the most efficient physical fit (${bestFit.volumeUtilizationPct}% volume, ${bestFit.weightUtilizationPct}% weight).`,
    isLclRecommended: false
  };
}

export function computeMultiContainerComparison(
  load: { cargoCbm: number; cbm: number; grossWeightKg: number; pallets: number; packaging?: PackagingProfile },
  profiles: ContainerProfile[]
): ContainerFit[] {
  return profiles.map(profile => containerFit(profile, load));
}

/* ------------------------------------------------------------------ */
/* Packaging Completeness                                              */
/* ------------------------------------------------------------------ */

export function packagingCompleteness(profile: PackagingProfile): PackagingCompleteness {
  const missing: string[] = [];
  
  if (!profile.cartonLengthCm || !profile.cartonWidthCm || !profile.cartonHeightCm) {
    missing.push('Carton Dimensions (L/W/H)');
  }
  if (!profile.cartonGrossWeightKg) missing.push('Carton Gross Weight');
  if (!profile.cartonQty) missing.push('Units per Carton');
  if (!profile.packagedUnitWeightKg) missing.push('Packaged Unit Weight');
  if (!profile.palletLengthCm || !profile.palletWidthCm) missing.push('Pallet Footprint (L/W)');
  if (!profile.maxStackHeightCm) missing.push('Max Stack Height');
  
  // Optional but recommended for wholesale precision
  if (!profile.unitLengthCm || !profile.unitWidthCm || !profile.unitHeightCm) {
    missing.push('Unit Dimensions (L/W/H)');
  }
  
  if (missing.length === 0) {
    return { status: 'COMPLETE', missingFields: [] };
  } else if (missing.length <= 2) {
    return { status: 'NEEDS_REVIEW', missingFields: missing };
  }
  
  return { status: 'INCOMPLETE', missingFields: missing };
}

