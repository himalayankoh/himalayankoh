/**
 * The quote builder — stored cost data in, a frozen quotation out.
 *
 * ## What this module owns
 *
 * Everything between "the owner picked products for a container" and "here is the
 * priced quote, with the inputs that produced it". It is the *only* caller of the
 * engine in the server, so the two rules the pricing has to obey live in one place:
 *
 *  1. **Nothing is guessed.** Every product, container, cost profile and freight
 *     rate is loaded from the wholesale plugin by id. A missing one is an error
 *     naming what is missing, not a default that quietly prices a container.
 *  2. **The quote is a snapshot.** The lines, the fx rates, the freight rate and the
 *     cost profile's numbers are copied onto the quote row. Tomorrow's PKR rate or a
 *     supplier's new ex-factory price cannot move a quote that has already been
 *     given to a buyer — `quoteRowFromCalculation` is where that freezing happens.
 *
 * ## Purity
 *
 * The math itself is `engine.ts`, which is pure and separately tested. This module
 * only fetches rows and maps them, so a pricing bug is either in the engine (and
 * pinned by its tests) or in the fetching (and visible in the row it came from).
 *
 * Server-only: it holds the WordPress credential through `store.ts`.
 */

import {
  buildCostLines,
  buildMixedLoad,
  computeSellSide,
  containerFit,
  priceTierFor,
  unitsFromPallets,
  WholesaleEngineError,
  resolveSourcingLane,
  recommendShipmentMode,
  computeMultiContainerComparison,
  packagingCompleteness,
  type SourcingResolution,
  type CostLine,
  type ContainerFit,
  type MixedLoad,
  type PalletLoad,
  type SellSide,
  type ShipmentRecommendation,
} from './engine';
import {
  containerProfileFromRow,
  costProfileFromRow,
  freightRateFromRow,
  productFromRow,
  priceTierFromRow,
  quoteConfidence,
  type CostProfileRecord,
  type WholesaleProductRecord,
} from './mapping';
import {
  listWholesaleRecords,
  readWholesaleCatalog,
  WHOLESALE_AGGREGATE_TIMEOUT_MS,
  type WholesaleResource,
} from './store';
import type {
  ContainerProfile,
  CostProfile,
  FreightRate,
  FxSnapshot,
  Incoterm,
  QuoteLine,
  QuoteTotals,
  WholesalePriceTier,
  WholesaleProduct,
  PackagingCompleteness,
} from './types';

/* ------------------------------------------------------------------ */
/* Inputs                                                             */
/* ------------------------------------------------------------------ */

/** One requested line: a wholesale product and either units or whole pallets. */
export interface QuoteLineRequest {
  productRowId: number;
  units?: number;
  pallets?: number;
}

export interface QuoteInput {
  /** Wholesale account the quote is for. From a verified session, never a client. */
  accountId: number;
  lines: QuoteLineRequest[];
  /** `hk_wholesale_container_profiles.id`. */
  containerProfileId: number;
  /** How many containers the quote is priced over. Defaults to 1. */
  containers?: number;
  /** `hk_wholesale_cost_profiles.id`. */
  costProfileId: number;
  /** `hk_wholesale_freight_rates.id`, or null to price without ocean freight. */
  freightRateId?: number | null;
  incoterm: Incoterm;
  /** The currency the quote is written in. Defaults to the cost profile's. */
  currency?: string;
  /** Rates used for any amount that is not already in the quote's currency. */
  fx?: FxSnapshot[];
  /** Margin on the sell price, as the owner would state it. */
  marginPct?: number | null;
  /** An explicit sell price per unit, which wins over `marginPct`. */
  sellPricePerUnit?: number | null;
  includeDestination?: boolean;
  includeDuty?: boolean;
  destinationCountry?: string;
  destinationPort?: string;
  /** Where a snapshot's rates came from, kept on the stored quote. */
  fxSource?: 'manual' | 'api';
}

/** One product line as the engine and the stored quote both see it. */
export interface ResolvedQuoteLine {
  input: QuoteLineRequest;
  product: WholesaleProductRecord;
  load: PalletLoad;
  /** Cost per unit used for this quote: the tier price when the volume earns one. */
  unitCost: number;
  tier: WholesalePriceTier | null;
  /** Packaging fields that fell back to the documented default, if any. */
  packagingDefaultsUsed: string[];
  completeness: PackagingCompleteness;
}

export interface QuoteCalculation {
  lines: ResolvedQuoteLine[];
  mixed: MixedLoad;
  fit: ContainerFit;
  costLines: CostLine[];
  totals: QuoteTotals;
  /** The engine's stated assumptions, plus any labelled estimate. */
  assumptions: string[];
  container: ContainerProfile & { rowId: number };
  costProfile: CostProfileRecord;
  freight: (FreightRate & { rowId: number }) | null;
  incoterm: Incoterm;
  currency: string;
  containers: number;
  fx: FxSnapshot[];
  sell: SellSide | null;
  sourcing?: SourcingResolution;
  recommendation?: ShipmentRecommendation;
  comparisons?: ContainerFit[];
}

/* ------------------------------------------------------------------ */
/* Loading                                                            */
/* ------------------------------------------------------------------ */

export interface WholesaleData {
  products: WholesaleProductRecord[];
  tiers: WholesalePriceTier[];
  containers: Array<ContainerProfile & { rowId: number }>;
  costProfiles: CostProfileRecord[];
  freightRates: Array<FreightRate & { rowId: number }>;
}

/**
 * Everything a quote can be built from, in one read each.
 *
 * Active-only for products and container/cost profiles: a retired product must not
 * be priceable into a new quote, while a historical quote keeps its own copy and is
 * unaffected by that retirement.
 */
export async function loadWholesaleData(): Promise<WholesaleData> {
  // Four round trips that a screen waits on together (the quote builder, the pallet
  // calculator, the profit view's order read): the aggregate ceiling, not the
  // single-record one.
  const long = { timeoutMs: WHOLESALE_AGGREGATE_TIMEOUT_MS };
  const [catalog, containers, costProfiles, freightRates] = await Promise.all([
    readWholesaleCatalog({ activeOnly: true }),
    listWholesaleRecords('container_profiles', { limit: 100 }, long),
    listWholesaleRecords('cost_profiles', { limit: 200 }, long),
    listWholesaleRecords('freight_rates', { limit: 300, order: 'id' }, long),
  ]);

  return {
    products: catalog.products.map(productFromRow),
    tiers: catalog.tiers.map(priceTierFromRow),
    containers: containers.map(containerProfileFromRow),
    costProfiles: costProfiles.map(costProfileFromRow),
    freightRates: freightRates.map(freightRateFromRow),
  };
}

/* ------------------------------------------------------------------ */
/* The calculation                                                    */
/* ------------------------------------------------------------------ */

/**
 * Prices a proposed container.
 *
 * The order of operations is the order the numbers are derived in: units (from
 * pallets when the owner thinks in pallets) → cartons → pallets → weight and CBM →
 * container fit → merchandise → charges → landed total → sell side. Every step is
 * the engine's, so a quantity the owner typed has one path through the math.
 */
export function calculateQuote(data: WholesaleData, input: QuoteInput): QuoteCalculation {
  const container = data.containers.find((entry) => entry.rowId === input.containerProfileId);
  if (!container) {
    throw new WholesaleEngineError(
      `No container profile with id ${input.containerProfileId}. Create or pick one — the calculator will not assume a container size.`
    );
  }

  const costProfile = data.costProfiles.find((entry) => entry.rowId === input.costProfileId);
  if (!costProfile) {
    throw new WholesaleEngineError(
      `No cost profile with id ${input.costProfileId}. A quote needs an origin cost set — it will not price freight with no origin charges.`
    );
  }

  const currency = (input.currency || costProfile.currency || 'USD').toUpperCase();
  const containers = Math.max(1, Math.trunc(input.containers ?? 1));

  const freight = input.freightRateId
    ? data.freightRates.find((entry) => entry.rowId === input.freightRateId) ?? null
    : null;
  if (input.freightRateId && !freight) {
    throw new WholesaleEngineError(
      `No freight rate with id ${input.freightRateId}. Add the rate, or price the quote without one.`
    );
  }

  if (!input.lines.length) {
    throw new WholesaleEngineError('A quote needs at least one product line.');
  }

  // Products are resolved first so each line's volume is known, then the load is
  // built once: `buildMixedLoad` is the only place units become cartons and
  // pallets, and running it per line as well would be the same math twice.
  const requests = input.lines.map((line) => {
    const product = data.products.find((entry) => entry.rowId === line.productRowId);
    if (!product) {
      throw new WholesaleEngineError(
        `No active wholesale product with id ${line.productRowId}. Add it to the wholesale catalog first.`
      );
    }
    if (line.units && line.pallets) {
      throw new WholesaleEngineError(`${product.name}: give either units or pallets, not both.`);
    }
    const units = line.pallets ? unitsFromPallets(product, line.pallets) : (line.units ?? 0);
    return { line, product, units };
  });

  const mixed = buildMixedLoad(
    container,
    requests.map((entry) =>
      entry.line.pallets ? { product: entry.product, pallets: entry.line.pallets } : { product: entry.product, units: entry.units }
    )
  );

  const resolved: ResolvedQuoteLine[] = requests.map((entry, index) => {
    // The tier price is the cost of goods for *this volume* when the volume earns
    // a break; the product's ex-factory cost is the price at no break. A tier is
    // never applied silently — `priceTierFor` decides on the unit count.
    const tier = priceTierFor(data.tiers, entry.product.id, entry.units);
    return {
      input: entry.line,
      product: entry.product,
      load: mixed.lines[index],
      unitCost: tier ? tier.unitPrice : entry.product.exFactoryCost,
      tier,
      packagingDefaultsUsed: entry.product.packagingDefaultsUsed,
      completeness: packagingCompleteness(entry.product.packaging),
    };
  });

  const quoteLines: QuoteLine[] = resolved.map((entry) => ({
    id: `line-${entry.product.rowId}`,
    productId: entry.product.id,
    name: entry.product.name,
    wholesaleSku: entry.product.wholesaleSku,
    units: entry.load.units,
    cartonQty: entry.product.packaging.cartonQty,
    exFactoryUnitCost: entry.unitCost,
    packaging: entry.product.packaging,
  }));

  const fx = input.fx ?? [];
  const priced = buildCostLines({
    lines: quoteLines,
    containers,
    cartons: mixed.totals.cartons,
    pallets: mixed.totals.pallets,
    netWeightKg: mixed.totals.netWeightKg,
    costProfile,
    incoterm: input.incoterm,
    freight: freight
      ? { oceanFreight: freight.oceanFreight, surcharges: freight.surcharges, currency: freight.currency }
      : null,
    fx,
    currency,
    includeDestination: input.includeDestination ?? costProfile.includeDestination,
    includeDuty: input.includeDuty ?? costProfile.dutyInLanded,
  });

  const assumptions = [...priced.assumptions, ...mixed.warnings];
  for (const entry of resolved) {
    if (entry.packagingDefaultsUsed.length) {
      assumptions.push(
        `${entry.product.name}: pallet math uses the default packaging for ${entry.packagingDefaultsUsed.join(', ')}. Set the factory's own carton and pallet figures on the wholesale product to remove this estimate.`
      );
    }
    if (entry.tier) {
      assumptions.push(
        `${entry.product.name}: ${entry.load.units.toLocaleString('en-US')} units reached the ${entry.tier.minUnits.toLocaleString('en-US')}-unit price break.`
      );
    }
  }
  if (!freight) {
    assumptions.push('No freight rate is attached, so the ocean leg is priced at zero and any CFR/CIF total is incomplete.');
  }

  const sourcing = resolveSourcingLane({
    originPort: freight?.originPort,
    destinationCountry: input.destinationCountry,
    destinationPort: input.destinationPort,
  });
  if (!sourcing.valid && sourcing.error) {
    throw new WholesaleEngineError(sourcing.error);
  }
  if (sourcing.billedAsUsDelivery || (input.destinationCountry && input.destinationCountry.trim())) {
    assumptions.push(sourcing.note);
  }

  const sellPrice = resolveSellPrice(priced.totals, input);
  const sell = sellPrice ? computeSellSide(priced.totals, sellPrice) : null;

  const allContainers = data.containers;
  const loadForComparison = {
    cargoCbm: mixed.totals.cargoCbm,
    cbm: mixed.totals.cbm,
    grossWeightKg: mixed.totals.grossWeightKg,
    pallets: mixed.totals.pallets,
  };
  
  const recommendation = recommendShipmentMode(loadForComparison, allContainers, data.freightRates);
  const comparisons = computeMultiContainerComparison(loadForComparison, allContainers);

  return {
    lines: resolved,
    mixed,
    fit: containerFit(container, mixed.totals),
    costLines: priced.lines,
    totals: priced.totals,
    assumptions,
    container,
    costProfile,
    freight,
    incoterm: input.incoterm,
    currency,
    containers,
    fx,
    sell,
    sourcing,
    recommendation,
    comparisons,
  };
}

/**
 * The sell price per unit, from an explicit price or from a margin.
 *
 * A margin the owner states is a margin on the *sell* price, which is the number a
 * trader means; the conversion is here rather than in the screen so the two ways of
 * naming a price produce the same stored total.
 */
function resolveSellPrice(totals: QuoteTotals, input: QuoteInput): number | null {
  if (input.sellPricePerUnit && input.sellPricePerUnit > 0) {
    return round4(input.sellPricePerUnit);
  }
  const margin = input.marginPct;
  if (typeof margin === 'number' && Number.isFinite(margin) && margin > 0 && margin < 100 && totals.perUnit > 0) {
    return round4(totals.perUnit / (1 - margin / 100));
  }
  return null;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/* ------------------------------------------------------------------ */
/* Expected sell value (what the buyer sees when no price is set)      */
/* ------------------------------------------------------------------ */

/**
 * What a catalog line would cost a buyer at a given quantity.
 *
 * Used by the wholesale catalog and the quote builder's preview, so the tier a
 * buyer is shown is the tier the quote engine would use — one `priceTierFor`
 * call, not a second rule in a component.
 */
export function indicativeUnitPrice(
  product: WholesaleProduct,
  tiers: WholesalePriceTier[],
  units: number
): { unitPrice: number; tier: WholesalePriceTier | null; basis: 'TIER' | 'BASE' } {
  const tier = priceTierFor(tiers, product.id, units);
  if (tier) return { unitPrice: tier.unitPrice, tier, basis: 'TIER' };
  return { unitPrice: product.exFactoryCost, tier: null, basis: 'BASE' };
}

/* ------------------------------------------------------------------ */
/* Persistence                                                        */
/* ------------------------------------------------------------------ */

/** What a stored quote row carries. JSON columns are objects, not strings. */
export interface QuoteRowInput {
  accountId: number;
  calculation: QuoteCalculation;
  status: string;
  notes?: string | null;
  createdBy?: string;
  /** The owner's sell price per unit, when set. */
  sellPricePerUnit?: number | null;
  marginPct?: number | null;
  validUntil?: string | null;
  pricingBasis?: string;
  destinationCountry?: string;
  destinationPort?: string;
}

/**
 * The quote as a row — the snapshot, written once.
 *
 * This is the freezing step. The lines carry their own cost and packaging, the fx
 * array is the rate list that was used, and the freight object is the rate as it
 * read at that moment. Nothing on this row is a reference into the live tables, so
 * an accepted quote cannot change its total because a supplier raised a price.
 */
export function quoteRowFromCalculation(input: QuoteRowInput): Record<string, unknown> {
  const { calculation } = input;

  return {
    account_id: input.accountId,
    status: input.status,
    incoterm: calculation.incoterm,
    destination_country: input.destinationCountry ?? '',
    destination_port: input.destinationPort ?? '',
    container_profile_id: calculation.container.rowId,
    containers: calculation.containers,
    currency: calculation.currency,
    fx: calculation.fx,
    cost_profile_id: calculation.costProfile.rowId,
    freight: calculation.freight
      ? {
          id: calculation.freight.id,
          rowId: calculation.freight.rowId,
          source: calculation.freight.source,
          provider: calculation.freight.provider,
          carrier: calculation.freight.carrier,
          currency: calculation.freight.currency,
          oceanFreight: calculation.freight.oceanFreight,
          surcharges: calculation.freight.surcharges,
          transitDays: calculation.freight.transitDays,
          validUntil: calculation.freight.validUntil,
          retrievedAt: calculation.freight.retrievedAt,
        }
      : {},
    lines: calculation.lines.map((entry) => ({
      id: `line-${entry.product.id}`,
      productId: entry.product.id,
      name: entry.product.name,
      wholesaleSku: entry.product.wholesaleSku,
      units: entry.load.units,
      cartons: entry.load.cartons,
      pallets: entry.load.palletsRequired,
      cartonQty: entry.product.packaging.cartonQty,
      exFactoryUnitCost: entry.unitCost,
      tierMinUnits: entry.tier?.minUnits ?? null,
      netWeightKg: entry.load.netWeightKg,
      grossWeightKg: entry.load.grossWeightKg,
      cbm: entry.load.cbm,
      packaging: entry.product.packaging,
    })),
    assumptions: calculation.assumptions,
    totals: calculation.totals,
    margin_pct: input.marginPct ?? calculation.sell?.marginPct ?? 0,
    sell_total: calculation.sell ? round4(calculation.sell.sellPricePerUnit * unitsIn(calculation)) : 0,
    pricing_basis: input.pricingBasis ?? 'SYSTEM_CALCULATED',
    valid_until: input.validUntil ?? '',
    notes: input.notes ?? '',
    created_by: input.createdBy ?? '',
  };
}

function unitsIn(calculation: QuoteCalculation): number {
  return calculation.lines.reduce((total, entry) => total + entry.load.units, 0);
}

/* ------------------------------------------------------------------ */
/* Account-scoped reads                                               */
/* ------------------------------------------------------------------ */

/**
 * A buyer's own quotes, or one of them.
 *
 * The account filter is applied here, on the server, from a verified session's
 * account id — never from a query parameter. A buyer asking for someone else's
 * quote id gets "not found", because the row it is filtered out before the id is
 * even compared.
 */
export async function readBuyerQuotes(accountId: number): Promise<WholesaleRowList> {
  return listWholesaleRecords('quotes', { account_id: accountId, limit: 200 });
}

export async function readBuyerOrders(accountId: number): Promise<WholesaleRowList> {
  return listWholesaleRecords('orders', { account_id: accountId, limit: 200 });
}

export async function readBuyerQuote(accountId: number, quoteId: number): Promise<WholesaleRow | null> {
  const rows = await listWholesaleRecords('quotes', { id: quoteId, account_id: accountId, limit: 1 });
  return rows[0] ?? null;
}

export async function readBuyerOrder(accountId: number, orderId: number): Promise<WholesaleRow | null> {
  const rows = await listWholesaleRecords('orders', { id: orderId, account_id: accountId, limit: 1 });
  return rows[0] ?? null;
}

type WholesaleRow = Record<string, unknown>;
type WholesaleRowList = WholesaleRow[];

/** Re-exported so a route can name a resource without importing the store twice. */
export type { WholesaleResource };
export { quoteConfidence };
