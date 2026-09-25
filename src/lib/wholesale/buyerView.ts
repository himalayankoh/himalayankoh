/**
 * What a wholesale buyer is allowed to see, derived in one place.
 *
 * ## Why this module exists rather than returning the stored row
 *
 * A stored quote carries the *cost side*: ex-factory merchandise, inland haulage,
 * terminal charges, the freight rate and its provider, the FX snapshot, the
 * margin. None of that is the buyer's business, and returning the row and hiding
 * fields in a component would put that promise in the least reliable place — a
 * `delete obj.cost` in JSX is one refactor away from shipping a supplier's price to
 * a customer. So the projection happens **on the server, before the response is
 * built**: the browser never receives a field it may not show, which is the only
 * version of this rule that cannot be undone by a front-end mistake.
 *
 * What a buyer does get is the load plan they asked about (units, cartons, pallets,
 * weight, CBM), the price they were quoted, and how firm that price is.
 *
 * ## Firmness is stated, never implied
 *
 * `confidence` is derived from the lifecycle state and the validity date together:
 * a `QUOTED` price past its `validUntil` reads `EXPIRED` even before anyone flips a
 * status, and an RFQ that has not been priced reads `INDICATIVE`. There is no state
 * in which an unpriced or expired number is presented as a confirmed one.
 *
 * Pure and isomorphic — no credentials, no I/O — so a test can pin every state.
 */

import { isQuoteExpired } from './quoteLifecycle';
import type { QuoteConfidence, QuoteStatus } from './types';

/* ------------------------------------------------------------------ */
/* Row readers (tolerant: a stored row is JSON, not a typed object)     */
/* ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return typeof value === 'string' ? value : String(value);
}

function orNull(value: unknown): string | null {
  const text = str(value);
  return text === '' ? null : text;
}

function numb(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(str(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function obj(value: unknown): Row {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Row;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Row) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function list(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter((entry) => entry && typeof entry === 'object') as Row[];
  return [];
}

/* ------------------------------------------------------------------ */
/* Firmness                                                            */
/* ------------------------------------------------------------------ */

/**
 * True when a stored validity date has passed. An absent date is not a promise.
 *
 * The rule itself lives in `quoteLifecycle` so the buyer's portal, the console and the
 * printed quotation all agree on whether day X is still inside the window — including
 * the fact that a date-only value lasts to the *end* of that day rather than to its
 * midnight.
 */
export function isExpired(validUntil: string | null, now: Date = new Date()): boolean {
  return isQuoteExpired(validUntil, now);
}

/**
 * How firm the price on this quote is.
 *
 * `DRAFT` is the owner's own working state, so a buyer never sees `CONFIRMED`
 * before the quote was actually sent — `SUBMITTED` and `UNDER_REVIEW` are
 * indicative by definition, because nobody has priced them yet.
 */
export function buyerConfidence(status: string, validUntil: string | null, now: Date = new Date()): QuoteConfidence {
  const state = status.toUpperCase() as QuoteStatus;
  if (isExpired(validUntil, now) && (state === 'QUOTED' || state === 'ACCEPTED')) return 'EXPIRED';
  switch (state) {
    case 'ACCEPTED':
    case 'CONVERTED_TO_ORDER':
    case 'QUOTED':
      return 'CONFIRMED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'UNDER_REVIEW':
      return 'UNDER_REVIEW';
    default:
      return 'INDICATIVE';
  }
}

/** The sentence a buyer reads next to the number. One per state, no double talk. */
export function confidenceNote(confidence: QuoteConfidence): string {
  switch (confidence) {
    case 'CONFIRMED':
      return 'Confirmed quotation. Prices are held for the validity period shown.';
    case 'EXPIRED':
      return 'This quotation has passed its validity date. Ask us to re-price it against current freight.';
    case 'UNDER_REVIEW':
      return 'Under review by our wholesale team. The figures shown are indicative until we confirm them.';
    default:
      return 'Indicative only. Ocean freight, insurance and destination charges are confirmed when we quote.';
  }
}

/* ------------------------------------------------------------------ */
/* Quote                                                               */
/* ------------------------------------------------------------------ */

export interface BuyerQuoteLine {
  name: string;
  wholesaleSku: string;
  units: number;
  cartons: number;
  pallets: number;
  /** The buyer's price per unit at this line, when the quote has been priced. */
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface BuyerQuoteView {
  id: number;
  reference: string;
  status: string;
  confidence: QuoteConfidence;
  confidenceNote: string;
  incoterm: string;
  containers: number;
  currency: string;
  destinationCountry: string;
  destinationPort: string;
  lines: BuyerQuoteLine[];
  totals: {
    units: number;
    cartons: number;
    pallets: number;
    netWeightKg: number;
    /** What the buyer pays, when the quote has been priced. */
    quotedTotal: number | null;
    perUnit: number | null;
  };
  /** True while nobody has priced the RFQ yet. */
  awaitingQuotation: boolean;
  validUntil: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
}

/**
 * A stored quote as the buyer may see it.
 *
 * The cost breakdown in `totals` (merchandise, freight, charges, insurance, duty)
 * is deliberately dropped: the only money a buyer is told is `sell_total`, divided
 * across the units it covers. The load plan stays, because the buyer supplied the
 * quantities and needs to see the pallets and CBM they imply.
 */
export function buyerQuoteView(row: Row, now: Date = new Date()): BuyerQuoteView {
  const status = str(row.status, 'SUBMITTED').toUpperCase();
  const validUntil = orNull(row.valid_until);
  const confidence = buyerConfidence(status, validUntil, now);

  const lines = list(row.lines);
  const units = lines.reduce((total, line) => total + numb(line.units), 0);
  const cartons = lines.reduce((total, line) => total + numb(line.cartons), 0);
  const pallets = lines.reduce((total, line) => total + numb(line.pallets), 0);
  const netWeightKg = lines.reduce((total, line) => total + numb(line.netWeightKg), 0);

  const priced = status === 'QUOTED' || status === 'ACCEPTED' || status === 'CONVERTED_TO_ORDER';
  const sellTotal = priced ? numb(row.sell_total) : 0;
  const perUnit = priced && units > 0 ? Math.round((sellTotal / units) * 10_000) / 10_000 : null;

  return {
    id: numb(row.id),
    reference: str(row.ref),
    status,
    confidence,
    confidenceNote: confidenceNote(confidence),
    incoterm: str(row.incoterm, 'EXW').toUpperCase(),
    containers: Math.max(1, numb(row.containers, 1)),
    currency: str(row.currency, 'USD'),
    destinationCountry: str(row.destination_country),
    destinationPort: str(row.destination_port),
    lines: lines.map((line) => ({
      name: str(line.name),
      wholesaleSku: str(line.wholesaleSku),
      units: numb(line.units),
      cartons: numb(line.cartons),
      pallets: numb(line.pallets),
      unitPrice: priced ? perUnit : null,
      lineTotal: priced ? Math.round(numb(line.units) * (perUnit ?? 0) * 100) / 100 : null,
    })),
    totals: {
      units,
      cartons,
      pallets,
      netWeightKg: Math.round(netWeightKg * 100) / 100,
      quotedTotal: priced ? Math.round(sellTotal * 100) / 100 : null,
      perUnit,
    },
    awaitingQuotation: !priced,
    validUntil,
    submittedAt: orNull(row.submitted_at),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    notes: orNull(row.notes),
  };
}

/* ------------------------------------------------------------------ */
/* Order                                                               */
/* ------------------------------------------------------------------ */

export interface BuyerOrderView {
  id: number;
  reference: string;
  status: string;
  incoterm: string;
  currency: string;
  destinationCountry: string;
  destinationPort: string;
  units: number;
  cartons: number;
  pallets: number;
  total: number | null;
  paidAmount: number;
  balanceDue: number | null;
  paymentTerms: string | null;
  depositPct: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A stored wholesale order as the buyer may see it. Never a WooCommerce order. */
export function buyerOrderView(row: Row): BuyerOrderView {
  const plan = obj(row.plan);
  const terms = obj(row.payment_terms);
  const totals = obj(row.totals);
  const total = numb(row.sell_total, numb(totals.sellTotal, 0));
  const paid = numb(row.paid_amount);

  return {
    id: numb(row.id),
    reference: str(row.ref),
    status: str(row.status, 'DRAFT').toUpperCase(),
    incoterm: str(row.incoterm, 'EXW').toUpperCase(),
    currency: str(row.currency, 'USD'),
    destinationCountry: str(row.destination_country),
    destinationPort: str(row.destination_port),
    units: numb(plan.units),
    cartons: numb(plan.cartons),
    pallets: numb(plan.pallets),
    total: total > 0 ? Math.round(total * 100) / 100 : null,
    paidAmount: Math.round(paid * 100) / 100,
    balanceDue: total > 0 ? Math.round((total - paid) * 100) / 100 : null,
    paymentTerms: orNull(terms.label),
    depositPct: intOrNull(terms.depositPct),
    notes: orNull(row.notes),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

/** One page of the buyer-facing wholesale catalog. */
export interface BuyerCatalogItem {
  id: number;
  name: string;
  wholesaleSku: string;
  /** Live storefront facts, when the product is linked to a WooCommerce product. */
  storefront: {
    productId: number | null;
    name: string | null;
    image: string | null;
    slug: string | null;
  };
  /** Minimum order quantity, in units. */
  moq: number;
  leadTimeDays: number;
  /** The carton/pallet arithmetic a buyer plans with, already resolved. */
  packaging: {
    unitsPerCarton: number;
    cartonsPerPallet: number;
    unitsPerPallet: number;
    palletGrossWeightKg: number;
    palletCbm: number;
  } | null;
  /** Volume breaks, cheapest first. Empty means "price on request". */
  tiers: Array<{ minUnits: number; unitPrice: number; currency: string }>;
  /** The cheapest tier's price, when any tier exists. */
  fromUnitPrice: number | null;
  currency: string;
  /** Stated when the pallet math rests on default packaging rather than measurements. */
  estimateNote: string | null;
}
