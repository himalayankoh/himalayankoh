/**
 * The container plan a buyer asks about, and the one place a line request is parsed.
 *
 * ## Why the buyer's calculation stops at merchandise
 *
 * A buyer planning a container needs the physical facts — cartons, pallets, kilos,
 * CBM, whether the mix fits — plus an *indicative* merchandise value at their tier
 * prices. They do not get the landed cost: ocean freight, origin charges and the
 * margin are internal until the owner quotes a firm price, and a screen that showed
 * them would publish the business's negotiation. So this module deliberately cannot
 * reach `buildCostLines`; the landed-cost engine is only exercisable through the
 * admin route.
 *
 * ## One parser
 *
 * Buyer RFQ, buyer indicative quote and the admin calculator all accept the same
 * line shape (`units` xor `pallets`), so the validation is here rather than copied
 * three times — a route that accepted "both" while another rejected it would let a
 * buyer create a request the calculator then refuses.
 *
 * Server-only (it reads stored products through `pricing.ts`).
 */

import { WholesaleEngineError, buildMixedLoad, containerFit, priceTierFor, unitsFromPallets } from './engine';
import type { ContainerFit } from './engine';
import type { QuoteLineRequest, WholesaleData } from './pricing';
import type { PalletLoad } from './engine';

/** The most lines one request may carry, so a body cannot become a database scan. */
const MAX_LINES = 40;

/**
 * Reads line requests from a request body.
 *
 * Rejects the whole request on the first malformed line rather than skipping it: a
 * quantity silently dropped from a container quote changes the answer, and the
 * buyer would have no way to know which line went missing.
 */
export function parseLineRequests(value: unknown): QuoteLineRequest[] {
  if (!Array.isArray(value) || !value.length) {
    throw new WholesaleEngineError('Add at least one product to the quote.');
  }
  if (value.length > MAX_LINES) {
    throw new WholesaleEngineError(`A quote may carry at most ${MAX_LINES} product lines.`);
  }

  return value.map((entry, index) => {
    const row = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const productRowId = Math.trunc(Number(row.productRowId ?? row.product_id ?? 0));
    if (!Number.isFinite(productRowId) || productRowId <= 0) {
      throw new WholesaleEngineError(`Line ${index + 1}: a whole wholesale product id is required.`);
    }

    const units = row.units === undefined || row.units === null || row.units === '' ? undefined : Number(row.units);
    const pallets = row.pallets === undefined || row.pallets === null || row.pallets === '' ? undefined : Number(row.pallets);

    if (units === undefined && pallets === undefined) {
      throw new WholesaleEngineError(`Line ${index + 1}: give a unit quantity or a number of pallets.`);
    }
    if (units !== undefined && (!Number.isFinite(units) || units <= 0)) {
      throw new WholesaleEngineError(`Line ${index + 1}: the unit quantity must be greater than zero.`);
    }
    if (pallets !== undefined && (!Number.isFinite(pallets) || pallets <= 0)) {
      throw new WholesaleEngineError(`Line ${index + 1}: the pallet count must be greater than zero.`);
    }

    return {
      productRowId,
      ...(units !== undefined ? { units: Math.trunc(units) } : {}),
      ...(pallets !== undefined ? { pallets: Math.trunc(pallets) } : {}),
    };
  });
}

/** One line of a buyer's plan: the physical facts, and nothing commercial. */
export interface PlanLine {
  productRowId: number;
  name: string;
  wholesaleSku: string;
  units: number;
  cartons: number;
  pallets: number;
  palletsFull: number;
  unitsOnLastPallet: number;
  netWeightKg: number;
  grossWeightKg: number;
  cbm: number;
  /** The buyer's price per unit at this volume, or null when no tier covers it. */
  unitPrice: number | null;
  tierMinUnits: number | null;
  /** `unitPrice × units`, or null when there is no tier price. */
  lineValue: number | null;
}

export interface BuyerPlan {
  lines: PlanLine[];
  totals: {
    units: number;
    cartons: number;
    pallets: number;
    netWeightKg: number;
    grossWeightKg: number;
    cbm: number;
    /** Sum of the lines that have a tier price. Null when none do. */
    indicativeMerchandise: number | null;
    /** True when at least one line has no configured tier price. */
    hasUnpricedLines: boolean;
  };
  fit: ContainerFit;
  warnings: string[];
  assumptions: string[];
  container: { id: number; code: string; name: string };
  containers: number;
}

/**
 * Builds the plan for a proposed mix.
 *
 * `containerProfileId` is optional: a buyer who has not chosen a box yet gets the
 * first configured one, and the plan states which one it used rather than silently
 * assuming a size.
 */
export function buildBuyerPlan(
  data: WholesaleData,
  input: { lines: QuoteLineRequest[]; containerProfileId?: number | null; containers?: number }
): BuyerPlan {
  const container = input.containerProfileId
    ? data.containers.find((entry) => entry.rowId === input.containerProfileId)
    : data.containers[0];

  if (!container) {
    throw new WholesaleEngineError(
      input.containerProfileId
        ? `No container profile with id ${input.containerProfileId}.`
        : 'No container profile is configured, so a plan cannot be worked out yet.'
    );
  }

  const resolved = input.lines.map((line) => {
    const product = data.products.find((entry) => entry.rowId === line.productRowId);
    if (!product) {
      throw new WholesaleEngineError(
        `No active wholesale product with id ${line.productRowId}. The catalog may have changed — reload it and try again.`
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
    resolved.map((entry) =>
      entry.line.pallets ? { product: entry.product, pallets: entry.line.pallets } : { product: entry.product, units: entry.units }
    )
  );

  const assumptions: string[] = [];
  const lines: PlanLine[] = resolved.map((entry, index) => {
    const load: PalletLoad = mixed.lines[index];
    const tier = priceTierFor(data.tiers, entry.product.id, entry.units);
    if (tier) {
      assumptions.push(
        `${entry.product.name}: ${entry.units.toLocaleString('en-US')} units reached the ${tier.minUnits.toLocaleString('en-US')}-unit price break.`
      );
    }
    if (entry.product.packagingDefaultsUsed.length) {
      assumptions.push(
        `${entry.product.name}: pallet math uses default packaging for ${entry.product.packagingDefaultsUsed.join(', ')}.`
      );
    }

    return {
      productRowId: entry.product.rowId,
      name: entry.product.name,
      wholesaleSku: entry.product.wholesaleSku,
      units: load.units,
      cartons: load.cartons,
      pallets: load.palletsRequired,
      palletsFull: load.fullPallets,
      unitsOnLastPallet: load.unitsOnLastPallet,
      netWeightKg: load.netWeightKg,
      grossWeightKg: load.grossWeightKg,
      cbm: load.cbm,
      unitPrice: tier ? tier.unitPrice : null,
      tierMinUnits: tier ? tier.minUnits : null,
      lineValue: tier ? Math.round(tier.unitPrice * load.units * 100) / 100 : null,
    };
  });

  const priced = lines.filter((line) => line.lineValue !== null);
  const indicativeMerchandise = priced.length
    ? Math.round(priced.reduce((total, line) => total + (line.lineValue ?? 0), 0) * 100) / 100
    : null;

  assumptions.push(
    'This plan covers goods only: ocean freight, insurance, port charges and duty are confirmed on our quotation.'
  );

  return {
    lines,
    totals: {
      units: mixed.totals.units,
      cartons: mixed.totals.cartons,
      pallets: mixed.totals.pallets,
      netWeightKg: mixed.totals.netWeightKg,
      grossWeightKg: mixed.totals.grossWeightKg,
      cbm: mixed.totals.cbm,
      indicativeMerchandise,
      hasUnpricedLines: priced.length !== lines.length,
    },
    fit: containerFit(container, mixed.totals),
    warnings: mixed.warnings,
    assumptions,
    container: { id: container.rowId, code: container.id, name: container.name },
    containers: Math.max(1, Math.trunc(input.containers ?? 1)),
  };
}
