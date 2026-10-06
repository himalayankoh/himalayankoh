/**
 * The one place a wholesale plugin row becomes a domain object, and back.
 *
 * ## Why this exists
 *
 * The plugin speaks SQL: snake_case columns, JSON blobs for anything variable, ids
 * as integers. The engine, the screens and the quote snapshot speak the domain
 * vocabulary in `./types`. If each caller did its own `row.packaging.cartonQty ??
 * 30`, that conversion would exist six times and drift the first time one of them
 * was edited — and a drifted carton count is a wrong pallet count, which is a wrong
 * freight quote. So there is exactly one conversion per entity, here.
 *
 * ## Missing packaging fields fall back, and say so
 *
 * A wholesale product created before its carton measurements are known must still
 * price (the calculator's job is to show what is missing, not to refuse), so an
 * absent packaging field takes the documented default from `DEFAULT_PACKAGING_PROFILE`
 * — and the names of the fields that fell back travel with the product in
 * `packagingDefaultsUsed`, so a quote can state that its pallet math rests on
 * assumptions instead of a factory measurement. Nothing is silently invented: an
 * estimate that is not labelled is what this field exists to prevent.
 *
 * ## Ids
 *
 * Domain ids are strings (the engine's maps are keyed by them); the plugin's ids
 * are integers. The bridge is `String(row.id)`, and `rowId` keeps the integer so a
 * write can address the same row it read.
 */

import type {
  ApplicationStatus,
  BusinessType,
  ContainerProfile,
  CostProfile,
  FreightRate,
  PackagingProfile,
  QuoteConfidence,
  QuoteLine,
  QuoteStatus,
  QuoteTotals,
  WholesaleAccount,
  WholesaleApplication,
  WholesaleOrder,
  WholesalePriceTier,
  WholesaleProduct,
  WholesaleQuote,
  WholesaleRole,
  Incoterm,
  FxSnapshot,
} from './types';
import { DEFAULT_PACKAGING_PROFILE } from './types';
import { effectiveQuoteStatus, isQuoteExpired } from './quoteLifecycle';
import type { WholesaleRow } from './store';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function text(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return typeof value === 'string' ? value : String(value);
}

function orNull(value: unknown): string | null {
  const t = text(value);
  return t === '' ? null : t;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intOrNull(value: unknown): number | null {
  const n = num(value, NaN);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/** A positive measurement, or null. A container's insides are either known or not. */
function numOrNull(value: unknown): number | null {
  const n = num(value, NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function bool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return text(value) === '1' || text(value).toLowerCase() === 'true';
}

/** A JSON column as an object. A malformed blob is an empty object, never a crash. */
function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

/* ------------------------------------------------------------------ */
/* Packaging                                                           */
/* ------------------------------------------------------------------ */

export interface PackagingConversion {
  profile: PackagingProfile;
  /** Fields that fell back to the documented default. Empty when measured. */
  defaultsUsed: string[];
}

const PACKAGING_FIELDS: ReadonlyArray<keyof PackagingProfile> = [
  'cartonQty',
  'packagedUnitWeightKg',
  'cartonLengthCm',
  'cartonWidthCm',
  'cartonHeightCm',
  'cartonGrossWeightKg',
  'palletLengthCm',
  'palletWidthCm',
  'maxStackHeightCm',
  'palletDeckHeightCm',
  'palletTareKg',
];

/**
 * Unit dimensions are optional enrichments — never defaulted, and only written
 * when the owner actually measured them (see `packagingCompleteness`, which
 * lists them as missing until they exist).
 */
const UNIT_DIMENSION_FIELDS = ['unitLengthCm', 'unitWidthCm', 'unitHeightCm'] as const;

/** A stored packaging blob → the engine's profile, with fallbacks named. */
export function packagingFromJson(value: unknown): PackagingConversion {
  const raw = jsonObject(value);
  const defaultsUsed: string[] = [];
  const profile: PackagingProfile = { ...DEFAULT_PACKAGING_PROFILE };

  for (const field of PACKAGING_FIELDS) {
    const stored = raw[field];
    if (stored === undefined || stored === null || stored === '' || num(stored, 0) <= 0) {
      defaultsUsed.push(field);
      continue;
    }
    (profile as unknown as Record<string, number>)[field] = num(stored);
  }

  // Optional fields are only set when the owner supplied them: an absent ceiling
  // means "no ceiling known", which is not the same as a ceiling of zero.
  const ceiling = raw.maxPalletGrossWeightKg;
  if (ceiling !== undefined && ceiling !== null && ceiling !== '' && num(ceiling, 0) > 0) {
    profile.maxPalletGrossWeightKg = num(ceiling);
  }
  const perLayer = raw.cartonsPerLayer;
  if (perLayer !== undefined && perLayer !== null && num(perLayer, 0) > 0) {
    profile.cartonsPerLayer = Math.trunc(num(perLayer));
  }
  const layers = raw.layers;
  if (layers !== undefined && layers !== null && num(layers, 0) > 0) {
    profile.layers = Math.trunc(num(layers));
  }

  // Unit dimensions are an enrichment the completeness check names, but they
  // have no default to fall back to: kept only when the owner supplied them.
  for (const field of UNIT_DIMENSION_FIELDS) {
    const stored = raw[field];
    if (stored !== undefined && stored !== null && stored !== '' && num(stored, 0) > 0) {
      profile[field] = num(stored);
    }
  }

  return { profile, defaultsUsed };
}

/** The profile as it is stored: only the fields the schema knows. */
export function packagingToJson(profile: PackagingProfile): Record<string, number> {
  const out: Record<string, number> = {};
  for (const field of PACKAGING_FIELDS) {
    out[field] = num((profile as unknown as Record<string, unknown>)[field]);
  }
  if (profile.maxPalletGrossWeightKg) out.maxPalletGrossWeightKg = profile.maxPalletGrossWeightKg;
  if (profile.cartonsPerLayer) out.cartonsPerLayer = profile.cartonsPerLayer;
  if (profile.layers) out.layers = profile.layers;
  for (const field of UNIT_DIMENSION_FIELDS) {
    if (profile[field]) out[field] = profile[field]!;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Products & tiers                                                    */
/* ------------------------------------------------------------------ */

/** A wholesale product as stored, plus the two facts the engine needs beside it. */
export interface WholesaleProductRecord extends WholesaleProduct {
  /** The plugin's own row id — what a write addresses. */
  rowId: number;
  packagingDefaultsUsed: string[];
  createdAt: string;
  updatedAt: string;
}

export function productFromRow(row: WholesaleRow): WholesaleProductRecord {
  const packaging = packagingFromJson(row.packaging);
  return {
    rowId: num(row.id),
    id: String(row.id ?? ''),
    wooProductId: intOrNull(row.woo_product_id),
    name: text(row.name),
    wholesaleSku: text(row.wholesale_sku),
    packaging: packaging.profile,
    packagingDefaultsUsed: packaging.defaultsUsed,
    moq: num(row.moq),
    exFactoryCost: num(row.ex_factory_cost),
    currency: text(row.currency, 'USD'),
    originId: intOrNull(row.origin_id) === null ? null : String(row.origin_id),
    supplierId: intOrNull(row.supplier_id) === null ? null : String(row.supplier_id),
    leadTimeDays: num(row.lead_time_days),
    netUnitWeightKg: num(row.net_unit_weight_kg),
    notes: orNull(row.notes),
    active: bool(row.active),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

/** The columns a product write may carry. */
export function productToRow(
  input: {
    wooProductId?: number | null;
    wholesaleSku?: string;
    name?: string;
    moq?: number;
    exFactoryCost?: number;
    currency?: string;
    originId?: number | null;
    supplierId?: number | null;
    leadTimeDays?: number;
    netUnitWeightKg?: number;
    packaging?: PackagingProfile;
    active?: boolean;
    notes?: string | null;
  }
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.wooProductId !== undefined) row.woo_product_id = input.wooProductId ?? 0;
  if (input.wholesaleSku !== undefined) row.wholesale_sku = input.wholesaleSku;
  if (input.name !== undefined) row.name = input.name;
  if (input.moq !== undefined) row.moq = input.moq;
  if (input.exFactoryCost !== undefined) row.ex_factory_cost = input.exFactoryCost;
  if (input.currency !== undefined) row.currency = input.currency;
  if (input.originId !== undefined) row.origin_id = input.originId ?? 0;
  if (input.supplierId !== undefined) row.supplier_id = input.supplierId ?? 0;
  if (input.leadTimeDays !== undefined) row.lead_time_days = input.leadTimeDays;
  if (input.netUnitWeightKg !== undefined) row.net_unit_weight_kg = input.netUnitWeightKg;
  if (input.packaging !== undefined) row.packaging = packagingToJson(input.packaging);
  if (input.active !== undefined) row.active = input.active;
  if (input.notes !== undefined) row.notes = input.notes;
  return row;
}

export function priceTierFromRow(row: WholesaleRow): WholesalePriceTier {
  return {
    id: String(row.id ?? ''),
    productId: String(row.product_id ?? ''),
    minUnits: num(row.min_units),
    unitPrice: num(row.unit_price),
    currency: text(row.currency, 'USD'),
  };
}

export function priceTierToRow(input: {
  productId: number;
  minUnits: number;
  unitPrice: number;
  currency: string;
  notes?: string | null;
}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    product_id: input.productId,
    min_units: input.minUnits,
    unit_price: input.unitPrice,
    currency: input.currency,
  };
  if (input.notes !== undefined) row.notes = input.notes;
  return row;
}

/* ------------------------------------------------------------------ */
/* Suppliers, origins, container profiles                              */
/* ------------------------------------------------------------------ */

export interface SupplierRecord {
  rowId: number;
  name: string;
  country: string;
  city: string | null;
  port: string | null;
  currency: string;
  contact: string | null;
  notes: string | null;
  active: boolean;
}

export function supplierFromRow(row: WholesaleRow): SupplierRecord {
  return {
    rowId: num(row.id),
    name: text(row.name),
    country: text(row.country),
    city: orNull(row.city),
    port: orNull(row.port),
    currency: text(row.currency, 'USD'),
    contact: orNull(row.contact),
    notes: orNull(row.notes),
    active: bool(row.active),
  };
}

export interface OriginRecord {
  rowId: number;
  country: string;
  city: string | null;
  port: string;
  currency: string;
  notes: string | null;
  active: boolean;
}

export function originFromRow(row: WholesaleRow): OriginRecord {
  return {
    rowId: num(row.id),
    country: text(row.country),
    city: orNull(row.city),
    port: text(row.port),
    currency: text(row.currency, 'USD'),
    notes: orNull(row.notes),
    active: bool(row.active),
  };
}

export function containerProfileFromRow(row: WholesaleRow): ContainerProfile & { rowId: number } {
  return {
    rowId: num(row.id),
    id: text(row.code) || String(row.id ?? ''),
    name: text(row.name) || text(row.code),
    usableCbm: num(row.usable_cbm),
    maxCargoWeightKg: num(row.max_cargo_weight_kg),
    practicalVolumeFactor: num(row.practical_volume_factor, 1),
    internalLengthCm: numOrNull(row.internal_length_cm),
    internalWidthCm: numOrNull(row.internal_width_cm),
    internalHeightCm: numOrNull(row.internal_height_cm),
    palletCapacity: intOrNull(row.pallet_capacity),
    notes: orNull(row.notes),
  };
}

/* ------------------------------------------------------------------ */
/* Cost profiles                                                       */
/* ------------------------------------------------------------------ */

/** The origin charge keys the cost profile may carry, in display order. */
export const ORIGIN_CHARGE_KEYS = [
  'inlandTransport',
  'stuffing',
  'documentation',
  'originTerminal',
  'originCustoms',
  'inspection',
  'forwarding',
  'packaging',
  'otherAmount',
] as const;

/** The destination charge keys a quote can include. */
export const DESTINATION_CHARGE_KEYS = [
  'destinationTerminal',
  'destinationHandling',
  'destinationCustomsBroker',
  'destinationDelivery',
  'destinationWarehouse',
  'destinationOther',
] as const;

export interface CostProfileRecord extends CostProfile {
  rowId: number;
  name: string;
  /** True when the stored profile asks for destination charges in its landed cost. */
  includeDestination: boolean;
  /** True when the stored profile's duty percentage is part of the landed cost. */
  dutyInLanded: boolean;
}

export function costProfileFromRow(row: WholesaleRow): CostProfileRecord {
  const charges = jsonObject(row.charges);
  const destination = jsonObject(row.destination);
  const amount = (key: string): number => num(charges[key]);

  return {
    rowId: num(row.id),
    id: String(row.id ?? ''),
    name: text(row.name),
    originId: intOrNull(row.origin_id) === null ? '' : String(row.origin_id),
    supplierId: intOrNull(row.supplier_id) === null ? null : String(row.supplier_id),
    currency: text(row.currency, 'USD'),
    inlandTransport: amount('inlandTransport'),
    stuffing: amount('stuffing'),
    documentation: amount('documentation'),
    originTerminal: amount('originTerminal'),
    originCustoms: amount('originCustoms'),
    inspection: amount('inspection'),
    forwarding: amount('forwarding'),
    packagingSurcharge: amount('packaging'),
    otherLabel: orNull(charges.otherLabel),
    otherAmount: amount('otherAmount'),
    insurancePct: num(row.insurance_pct),
    destinationTerminal: num(destination.destinationTerminal),
    destinationHandling: num(destination.destinationHandling),
    destinationCustomsBroker: num(destination.destinationCustomsBroker),
    destinationDelivery: num(destination.destinationDelivery),
    destinationWarehouse: num(destination.destinationWarehouse),
    destinationOther: num(destination.destinationOther),
    dutyPct: num(row.duty_pct),
    notes: orNull(row.notes),
    includeDestination: bool(row.include_destination),
    dutyInLanded: bool(row.duty_in_landed),
  };
}

export function costProfileToRow(
  profile: CostProfileRecord | (Partial<CostProfileRecord> & { name?: string })
): Record<string, unknown> {
  const p = profile as CostProfileRecord;
  const charges: Record<string, unknown> = {};
  for (const key of ORIGIN_CHARGE_KEYS) {
    charges[key] = num((p as unknown as Record<string, unknown>)[key]);
  }
  charges.otherLabel = p.otherLabel ?? '';

  const destination: Record<string, unknown> = {};
  for (const key of DESTINATION_CHARGE_KEYS) {
    destination[key] = num((p as unknown as Record<string, unknown>)[key]);
  }

  const row: Record<string, unknown> = {
    charges,
    destination,
    insurance_pct: num(p.insurancePct),
    duty_pct: num(p.dutyPct),
    duty_in_landed: Boolean(p.dutyInLanded),
    include_destination: Boolean(p.includeDestination),
  };
  if (p.name !== undefined) row.name = p.name;
  if (p.originId !== undefined) row.origin_id = num(p.originId);
  if (p.supplierId !== undefined) row.supplier_id = num(p.supplierId);
  if (p.currency !== undefined) row.currency = p.currency;
  if (p.notes !== undefined) row.notes = p.notes ?? '';
  return row;
}

/* ------------------------------------------------------------------ */
/* Freight rates                                                       */
/* ------------------------------------------------------------------ */

export function freightRateFromRow(row: WholesaleRow): FreightRate & { rowId: number } {
  const surcharges = Array.isArray(row.surcharges) ? row.surcharges : [];
  return {
    rowId: num(row.id),
    id: String(row.id ?? ''),
    source: text(row.source) === 'api' ? 'api' : 'manual',
    provider: text(row.provider),
    originPort: text(row.origin_port),
    destinationPort: text(row.destination_port),
    containerType: text(row.container_type),
    carrier: orNull(row.carrier),
    currency: text(row.currency, 'USD'),
    oceanFreight: num(row.ocean_freight),
    surcharges: surcharges.map((entry) => {
      const charge = jsonObject(entry);
      return { label: text(charge.label), amount: num(charge.amount) };
    }),
    transitDays: intOrNull(row.transit_days),
    retrievedAt: text(row.retrieved_at),
    validUntil: orNull(row.valid_until),
    providerReference: orNull(row.provider_reference),
    notes: orNull(row.notes),
  };
}

export function freightRateToRow(input: {
  source?: string;
  provider?: string;
  originPort?: string;
  destinationPort?: string;
  containerType?: string;
  carrier?: string | null;
  currency?: string;
  oceanFreight?: number;
  surcharges?: Array<{ label: string; amount: number }>;
  transitDays?: number | null;
  validUntil?: string | null;
  providerReference?: string | null;
  notes?: string | null;
}): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  // A rate with no stated source is the owner's own number. The plugin stores
  // 'manual' and 'api' only, and 'api' is never inferred from the shape of a row:
  // a fetched rate says so because the provider adapter said so.
  if (input.source !== undefined) row.source = input.source === 'api' ? 'api' : 'manual';
  if (input.provider !== undefined) row.provider = input.provider;
  if (input.originPort !== undefined) row.origin_port = input.originPort;
  if (input.destinationPort !== undefined) row.destination_port = input.destinationPort;
  if (input.containerType !== undefined) row.container_type = input.containerType;
  if (input.carrier !== undefined) row.carrier = input.carrier ?? '';
  if (input.currency !== undefined) row.currency = input.currency;
  if (input.oceanFreight !== undefined) row.ocean_freight = input.oceanFreight;
  if (input.surcharges !== undefined) row.surcharges = input.surcharges;
  if (input.transitDays !== undefined) row.transit_days = input.transitDays ?? 0;
  if (input.validUntil !== undefined) row.valid_until = input.validUntil ?? '';
  if (input.providerReference !== undefined) row.provider_reference = input.providerReference ?? '';
  if (input.notes !== undefined) row.notes = input.notes ?? '';
  return row;
}

/* ------------------------------------------------------------------ */
/* Applications & accounts                                             */
/* ------------------------------------------------------------------ */

const BUSINESS_TYPES: readonly BusinessType[] = ['reseller', 'distributor', 'importer', 'business', 'other'];

function businessType(value: unknown): BusinessType {
  const t = text(value).toLowerCase();
  return (BUSINESS_TYPES as readonly string[]).includes(t) ? (t as BusinessType) : 'business';
}

export interface ApplicationRecord extends WholesaleApplication {
  rowId: number;
  /** The plugin's own status vocabulary, kept verbatim for the reviewer's screen. */
  rawStatus: string;
  accountId: number | null;
  /** Who decided, as recorded by the plugin's `decided_by` column. */
  decidedBy: string | null;
}

export function applicationFromRow(row: WholesaleRow): ApplicationRecord {
  const status = text(row.status, 'PENDING').toUpperCase() as ApplicationStatus;
  return {
    rowId: num(row.id),
    id: String(row.id ?? ''),
    companyName: text(row.company),
    contactName: text(row.contact_name),
    email: text(row.email),
    phone: text(row.phone),
    country: text(row.country),
    address: text(row.billing_address),
    website: orNull(row.website),
    businessType: businessType(row.business_type),
    expectedMonthlyVolume: orNull(row.monthly_volume),
    expectedAnnualVolume: orNull(row.annual_volume),
    interestedProducts: orNull(row.interested_products),
    loadPreference:
      text(row.logistics_mode) === 'pallet' || text(row.logistics_mode) === 'container'
        ? (text(row.logistics_mode) as 'pallet' | 'container')
        : text(row.logistics_mode) === 'either'
          ? 'either'
          : null,
    destinationCountry: text(row.destination_country),
    destinationPort: orNull(row.destination_port),
    notes: orNull(row.notes),
    status,
    rawStatus: status,
    accountId: intOrNull(row.account_id),
    decidedBy: orNull(row.decided_by),
    // The plugin stores the decision and who made it; a reviewer's free-text note
    // travels in the audit row for that decision rather than being duplicated here.
    reviewerNotes: null,
    createdAt: text(row.created_at),
    decidedAt: orNull(row.decided_at),
  };
}

export interface AccountRecord extends WholesaleAccount {
  rowId: number;
  wpUserId: number | null;
  ref: string;
  rawStatus: string;
  approvedAt: string | null;
  /** The dealer's standing share of profit on orders they bring, in percent. */
  commissionPct: number;
  /** The commission agreement in the owner's words. */
  commissionTerms: string | null;
}

export function accountFromRow(row: WholesaleRow): AccountRecord {
  const status = text(row.status, 'ACTIVE').toUpperCase();
  return {
    rowId: num(row.id),
    id: String(row.id ?? ''),
    ref: text(row.ref),
    applicationId: null,
    companyName: text(row.company),
    contactName: text(row.contact_name),
    email: text(row.email),
    phone: orNull(row.phone),
    country: text(row.country),
    address: orNull(row.billing_address),
    website: orNull(row.website),
    businessType: text(row.business_type) ? businessType(row.business_type) : null,
    destinationCountry: orNull(row.destination_country),
    destinationPort: orNull(row.destination_port),
    role: (status === 'ACTIVE' ? 'wholesale_customer' : 'wholesale_pending') as WholesaleRole,
    status: status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    rawStatus: status,
    wpUserId: intOrNull(row.wp_user_id),
    commissionPct: num(row.commission_pct),
    commissionTerms: orNull(row.commission_terms),
    depositPct: null,
    balancePct: null,
    paymentTerms: orNull(row.payment_terms),
    approvedAt: orNull(row.approved_at),
    createdAt: text(row.created_at),
  };
}

/* ------------------------------------------------------------------ */
/* Quotes & orders                                                     */
/* ------------------------------------------------------------------ */

/** A stored quote, with its frozen snapshot returned as the domain type. */
export interface StoredQuote extends WholesaleQuote {
  rowId: number;
  containers: number;
  containerProfileId: number | null;
  costProfileId: number | null;
  sellTotal: number | null;
  validUntil: string | null;
  /**
   * The lifecycle word as it was stored, before expiry was applied. The console shows
   * both: a lapsed quote is EXPIRED *and* was QUOTED by the owner, and the second fact
   * is what a revision history is about.
   */
  storedStatus: QuoteStatus;
  /** True when the stored status was a promise that its validity date has overtaken. */
  expired: boolean;
  createdBy: string;
}

function quoteLinesFromJson(value: unknown): QuoteLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const line = jsonObject(entry);
    const packaging = packagingFromJson(line.packaging);
    return {
      id: text(line.id),
      productId: text(line.productId),
      name: text(line.name),
      wholesaleSku: text(line.wholesaleSku),
      units: num(line.units),
      cartonQty: num(line.cartonQty, packaging.profile.cartonQty),
      exFactoryUnitCost: num(line.exFactoryUnitCost),
      packaging: packaging.profile,
    };
  });
}

export function quoteFromRow(row: WholesaleRow, now: Date = new Date()): StoredQuote {
  const totals = jsonObject(row.totals);
  const fx = Array.isArray(row.fx) ? (row.fx as FxSnapshot[]) : [];
  const freight = row.freight && typeof row.freight === 'object' && Object.keys(jsonObject(row.freight)).length
    ? (jsonObject(row.freight) as unknown as FreightRate)
    : null;

  return {
    rowId: num(row.id),
    id: String(row.id ?? ''),
    reference: text(row.ref),
    accountId: String(row.account_id ?? ''),
    status: effectiveQuoteStatus(text(row.status, 'DRAFT'), orNull(row.valid_until), now),
    storedStatus: text(row.status, 'DRAFT').toUpperCase() as QuoteStatus,
    expired: effectiveQuoteStatus(text(row.status, 'DRAFT'), orNull(row.valid_until), now) === 'EXPIRED',
    confidence: quoteConfidence(
      text(row.status, 'DRAFT').toUpperCase() as QuoteStatus,
      orNull(row.valid_until),
      now
    ),
    incoterm: (text(row.incoterm, 'EXW').toUpperCase() as Incoterm),
    originPort: '',
    destinationPort: text(row.destination_port),
    destinationCountry: text(row.destination_country),
    containerType: '',
    currency: text(row.currency, 'USD'),
    lines: quoteLinesFromJson(row.lines),
    snapshot: {
      incoterm: text(row.incoterm, 'EXW').toUpperCase() as Incoterm,
      costProfile: {} as CostProfile,
      freight,
      fx,
      overrides: [],
    },
    totals: Object.keys(totals).length ? (totals as unknown as QuoteTotals) : null,
    sellPricePerUnit: null,
    marginPct: row.margin_pct === null || row.margin_pct === undefined ? null : num(row.margin_pct),
    containers: num(row.containers, 1),
    containerProfileId: intOrNull(row.container_profile_id),
    costProfileId: intOrNull(row.cost_profile_id),
    sellTotal: row.sell_total === null || row.sell_total === undefined ? null : num(row.sell_total),
    validUntil: orNull(row.valid_until),
    createdBy: text(row.created_by),
    notes: orNull(row.notes),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

/**
 * How firm the price is, derived from the lifecycle state — never asserted by hand.
 *
 * A validity date is part of that answer: a quotation that was issued and has since
 * lapsed is not a confirmed price, whether or not anyone has flipped its status. The
 * date `buyerView` and the printed document use is the same one, so the console cannot
 * call a price firm while the buyer's portal is telling them it has expired.
 */
export function quoteConfidence(status: QuoteStatus, validUntil?: string | null, now: Date = new Date()): QuoteConfidence {
  if ((status === 'QUOTED' || status === 'ACCEPTED') && isQuoteExpired(validUntil ?? null, now)) return 'EXPIRED';
  if (status === 'ACCEPTED' || status === 'CONVERTED_TO_ORDER') return 'CONFIRMED';
  if (status === 'QUOTED') return 'CONFIRMED';
  if (status === 'EXPIRED') return 'EXPIRED';
  return 'INDICATIVE';
}

export interface OrderRecord extends WholesaleOrder {
  rowId: number;
  quoteRowId: number | null;
  /** The quotation's reference, so an order can be matched to its document. */
  quoteRef: string | null;
  /** The dealer who brought or receives this order; 0 when it is our own. */
  dealerId: number;
  paidAmount: number;
  plan: Record<string, unknown>;
  paymentTermsDetail: Record<string, unknown>;
  /** The frozen profit record, as stored. Composed by `profit.ts`. */
  costTotal: number;
  freightTotal: number;
  otherCosts: number;
  commissionPct: number;
  commissionAmount: number;
  hkNetProfit: number;
  updatedAt: string;
}

export function orderFromRow(row: WholesaleRow): OrderRecord {
  const totals = jsonObject(row.totals);
  const terms = jsonObject(row.payment_terms);
  return {
    rowId: num(row.id),
    id: String(row.id ?? ''),
    reference: text(row.ref),
    accountId: String(row.account_id ?? ''),
    quoteId: String(row.quote_id ?? ''),
    quoteRowId: intOrNull(row.quote_id),
    quoteRef: orNull(row.quote_ref),
    dealerId: num(row.dealer_id),
    costTotal: num(row.cost_total),
    freightTotal: num(row.freight_total),
    otherCosts: num(row.other_costs),
    commissionPct: num(row.commission_pct),
    commissionAmount: num(row.commission_amount),
    hkNetProfit: num(row.hk_net_profit),
    status: text(row.status, 'DRAFT').toUpperCase() as WholesaleOrder['status'],
    currency: text(row.currency, 'USD'),
    totals: Object.keys(totals).length ? (totals as unknown as QuoteTotals) : null,
    shippingBasis: text(row.incoterm, 'EXW').toUpperCase() as Incoterm,
    destinationCountry: text(row.destination_country),
    destinationPort: orNull(row.destination_port),
    paymentTerms: orNull(terms.label),
    paymentTermsDetail: terms,
    plan: jsonObject(row.plan),
    paidAmount: num(row.paid_amount),
    notes: orNull(row.notes),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export interface AuditRecord {
  rowId: number;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entityId: number;
  detail: Record<string, unknown>;
}

export function auditFromRow(row: WholesaleRow): AuditRecord {
  return {
    rowId: num(row.id),
    at: text(row.at),
    actor: text(row.actor),
    action: text(row.action),
    entity: text(row.entity),
    entityId: num(row.entity_id),
    detail: jsonObject(row.detail),
  };
}
