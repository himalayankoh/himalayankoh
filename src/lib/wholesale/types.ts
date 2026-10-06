/**
 * Wholesale domain types.
 *
 * This module is the vocabulary the pricing engine, the WordPress plugin and the
 * screens all speak. It is deliberately separate from the retail catalog types:
 * a wholesale product is a *reference* to a WooCommerce product plus its own
 * packaging, MOQ and B2B price tiers, and nothing here can change a retail
 * price.
 *
 * Money is stored as a number in the quote's own currency. There are no
 * implicit conversions anywhere: a rate must be supplied (or a snapshot
 * carried), because a silently-applied today-rate is how a historical quote
 * changes its answer tomorrow.
 */

/* ------------------------------------------------------------------ */
/* Products & packaging                                                */
/* ------------------------------------------------------------------ */

/** A carton and pallet profile. Every field is owner-editable data. */
export interface PackagingProfile {
  /** Units in one carton. */
  cartonQty: number;
  /** One unit as sold, packaged, in kg. */
  packagedUnitWeightKg: number;
  /** Carton outer dimensions, cm. */
  cartonLengthCm: number;
  cartonWidthCm: number;
  cartonHeightCm: number;
  /** Carton gross weight (product + carton), kg. */
  cartonGrossWeightKg: number;
  /** Pallet footprint, cm. */
  palletLengthCm: number;
  palletWidthCm: number;
  /** Height a pallet may be stacked to, cm (including pallet deck). */
  maxStackHeightCm: number;
  /** Pallet deck height, cm — included in the stack height. */
  palletDeckHeightCm: number;
  /** Pallet tare weight, kg. */
  palletTareKg: number;
  /** Maximum gross weight this pallet may carry, kg. Optional. */
  maxPalletGrossWeightKg?: number;
  /** Cartons per layer. When absent it is derived from the footprint. */
  cartonsPerLayer?: number;
  /** Layers per pallet. When absent it is derived from the stack height. */
  layers?: number;
  /** Optional enrichments for LCL and completeness */
  unitLengthCm?: number;
  unitWidthCm?: number;
  unitHeightCm?: number;
  unitsPerInnerPack?: number;
  cartonNetWeightKg?: number;
  stackable?: boolean;
  maxStackedPallets?: number;
  rotationAllowed?: boolean;
  handlingNotes?: string;
}

export interface PackagingCompleteness {
  status: 'COMPLETE' | 'INCOMPLETE' | 'NEEDS_REVIEW';
  missingFields: string[];
}

/** A wholesale product: a reference to a retail product plus its B2B data. */
export interface WholesaleProduct {
  id: string;
  /** The WooCommerce product this is sold as. Never written to by this module. */
  wooProductId: number | null;
  name: string;
  /** The wholesale reference (may differ from the retail SKU). */
  wholesaleSku: string;
  packaging: PackagingProfile;
  /** Minimum order quantity, in units. */
  moq: number;
  /** Ex-factory cost per unit, in `currency`. */
  exFactoryCost: number;
  currency: string;
  /** Origin this cost was quoted from — see `WholesaleOrigin`. */
  originId: string | null;
  supplierId: string | null;
  /** Production lead time, days. */
  leadTimeDays: number;
  /** Net weight of one unit, kg (cargo weight, used for container math). */
  netUnitWeightKg: number;
  /** Owner-facing notes. Never rendered as a customer promise. */
  notes?: string | null;
  active: boolean;
}

/** Quantity break. `minUnits` is inclusive. */
export interface WholesalePriceTier {
  id: string;
  productId: string;
  minUnits: number;
  /** Price per unit at this break. */
  unitPrice: number;
  currency: string;
}

/* ------------------------------------------------------------------ */
/* Origins, suppliers, cost profiles                                   */
/* ------------------------------------------------------------------ */

export interface WholesaleSupplier {
  id: string;
  name: string;
  country: string;
  city: string | null;
  contact: string | null;
  notes: string | null;
}

export interface WholesaleOrigin {
  id: string;
  country: string;
  city: string | null;
  /** The load port used for FOB and beyond. */
  port: string;
  /** Port code when known (e.g. KAPE for Karachi). */
  portCode: string | null;
  /** The currency this origin's costs are quoted in. */
  currency: string;
  notes: string | null;
}

/**
 * Everything charged before the goods are on the ship, plus the ones this app
 * knows are configurable. Values are per container unless the name says
 * otherwise; the engine never invents a value.
 */
export interface CostProfile {
  id: string;
  originId: string;
  supplierId: string | null;
  currency: string;
  /** Inland transport from factory to port. */
  inlandTransport: number;
  /** Stuffing / loading. */
  stuffing: number;
  /** Export documentation. */
  documentation: number;
  /** Origin terminal / port charges. */
  originTerminal: number;
  /** Customs / export handling at origin. */
  originCustoms: number;
  /** Inspection (e.g. third-party QC). */
  inspection: number;
  /** Forwarding fee. */
  forwarding: number;
  /** Packaging surcharge (when not inside the ex-factory cost). */
  packagingSurcharge: number;
  /** Anything else, with the owner's own label. */
  otherLabel: string | null;
  otherAmount: number;
  /** Insurance, quoted as a percentage of (merchandise + freight). */
  insurancePct: number;
  /** Destination-side charges, when a basis includes them. */
  destinationTerminal: number;
  destinationHandling: number;
  destinationCustomsBroker: number;
  destinationDelivery: number;
  destinationWarehouse: number;
  destinationOther: number;
  /** Duty/tax, as a percentage of the customs value. Owner-set, never assumed. */
  dutyPct: number;
  notes: string | null;
}

/* ------------------------------------------------------------------ */
/* Freight                                                             */
/* ------------------------------------------------------------------ */

/** A container type. Every number here is owner-editable configuration. */
export interface ContainerProfile {
  id: string;
  /** e.g. 20FT, 40FT, 40HC. */
  name: string;
  /** Usable internal volume, CBM. */
  usableCbm: number;
  /** Maximum cargo weight the container may carry, kg. */
  maxCargoWeightKg: number;
  /**
   * Practical loading ceiling as a fraction of `usableCbm` (1 = use it all).
   * Loading a container to its theoretical volume is not achievable with real
   * pallets, so the engine compares against this instead of the raw volume.
   */
  practicalVolumeFactor: number;
  /**
   * Internal length / width / height in centimetres.
   *
   * These are what make a pallet count *counted* rather than assumed: how many
   * pallets fit on the floor, and how many may be stacked, follow from the box's own
   * inside dimensions against the pallet's. Null when the owner has not supplied them,
   * in which case the engine falls back to `palletCapacity` and says that it is an
   * assumption rather than a measurement.
   */
  internalLengthCm: number | null;
  internalWidthCm: number | null;
  internalHeightCm: number | null;
  /** How many of this store's standard pallets fit, when known. A fallback, not a fact. */
  palletCapacity: number | null;
  notes: string | null;
}

/** One ocean-freight offer, from a provider or typed in by the owner. */
export interface FreightRate {
  id: string;
  /** Where the number came from. Manual and API rates are never mixed silently. */
  source: 'manual' | 'api';
  provider: string;
  originPort: string;
  destinationPort: string;
  containerType: string;
  carrier: string | null;
  currency: string;
  /** Base ocean freight, per container. */
  oceanFreight: number;
  /** Itemised surcharges when the provider reports them. */
  surcharges: Array<{ label: string; amount: number }>;
  transitDays: number | null;
  /** When the provider was asked. ISO. */
  retrievedAt: string;
  /** How long this rate may be relied on. ISO date, or null when unknown. */
  validUntil: string | null;
  /** The provider's own reference, for tracing a number back to its source. */
  providerReference: string | null;
  notes: string | null;
}

export type ShipmentMode = 'LCL' | '20FT' | '40FT' | '40HC' | 'AUTO';

/* ------------------------------------------------------------------ */
/* Quotes                                                              */
/* ------------------------------------------------------------------ */

/** The incoterm a quote is built on. Only these four are supported. */
export type Incoterm = 'EXW' | 'FOB' | 'CFR' | 'CIF';

export type QuoteStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONVERTED_TO_ORDER';

/** How firm a price is, in the wholesaler's own words. */
export type QuoteConfidence = 'INDICATIVE' | 'CONFIRMED' | 'EXPIRED' | 'UNDER_REVIEW';

/** How a line's value was arrived at. */
export type ValueOrigin = 'SYSTEM_CALCULATED' | 'MANUAL_OVERRIDE';

/** One product line of a quote, with the snapshot of what it cost that day. */
export interface QuoteLine {
  id: string;
  productId: string;
  name: string;
  wholesaleSku: string;
  units: number;
  /** Units per carton at quote time. */
  cartonQty: number;
  /** Cost per unit at quote time. */
  exFactoryUnitCost: number;
  /** The packaging profile's numbers, snapshotted. */
  packaging: PackagingProfile;
}

/** A stored exchange rate. A quote carries the one it was priced with. */
export interface FxSnapshot {
  from: string;
  to: string;
  rate: number;
  source: 'manual' | 'api';
  retrievedAt: string;
}

/** The cost inputs a quote froze when it was priced. */
export interface CostSnapshot {
  incoterm: Incoterm;
  costProfile: CostProfile;
  freight: FreightRate | null;
  fx: FxSnapshot[];
  /** Anything the owner typed over the engine's number. */
  overrides: Array<{ field: string; from: number; to: number; reason: string | null; at: string }>;
}

export interface WholesaleQuote {
  id: string;
  reference: string;
  accountId: string;
  status: QuoteStatus;
  confidence: QuoteConfidence;
  incoterm: Incoterm;
  originPort: string;
  destinationPort: string;
  destinationCountry: string;
  containerType: string;
  currency: string;
  lines: QuoteLine[];
  /** Frozen inputs. Historical quotes are never repriced automatically. */
  snapshot: CostSnapshot;
  /** The engine's totals, in `currency`. */
  totals: QuoteTotals | null;
  /** The owner's sell side. */
  sellPricePerUnit: number | null;
  marginPct: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteTotals {
  merchandise: number;
  packaging: number;
  inlandTransport: number;
  originCharges: number;
  oceanFreight: number;
  insurance: number;
  destinationCharges: number;
  duty: number;
  total: number;
  perUnit: number;
  perCarton: number;
  perPallet: number;
  perKg: number;
  perContainer: number;
  currency: string;
}

/* ------------------------------------------------------------------ */
/* Accounts & applications                                             */
/* ------------------------------------------------------------------ */

export type ApplicationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'MORE_INFO_REQUIRED'
  | 'SUSPENDED';

export type WholesaleRole = 'wholesale_pending' | 'wholesale_customer';

export type BusinessType = 'reseller' | 'distributor' | 'importer' | 'business' | 'other';

export interface WholesaleApplication {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  country: string;
  address: string;
  website: string | null;
  businessType: BusinessType;
  expectedMonthlyVolume: string | null;
  expectedAnnualVolume: string | null;
  interestedProducts: string | null;
  loadPreference: 'pallet' | 'container' | 'either' | null;
  destinationCountry: string;
  destinationPort: string | null;
  notes: string | null;
  status: ApplicationStatus;
  reviewerNotes: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface WholesaleAccount {
  id: string;
  applicationId: string | null;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  country: string;
  address: string | null;
  website: string | null;
  businessType: BusinessType | null;
  destinationCountry: string | null;
  destinationPort: string | null;
  role: WholesaleRole;
  status: 'ACTIVE' | 'SUSPENDED';
  /** Payment terms, in the owner's words. */
  depositPct: number | null;
  balancePct: number | null;
  paymentTerms: string | null;
  createdAt: string;
}

/** A wholesale order. Deliberately NOT a WooCommerce retail order. */
export interface WholesaleOrder {
  id: string;
  reference: string;
  accountId: string;
  quoteId: string;
  status: 'DRAFT' | 'AWAITING_DEPOSIT' | 'CONFIRMED' | 'IN_PRODUCTION' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  currency: string;
  totals: QuoteTotals | null;
  shippingBasis: Incoterm;
  destinationCountry: string;
  destinationPort: string | null;
  paymentTerms: string | null;
  notes: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

/**
 * Container profiles that ship with the app.
 *
 * These are ordinary guide figures for the standard boxes, and they are stored
 * as data precisely so the owner can correct them: the app never treats them as
 * a business rule it cannot change. `practicalVolumeFactor` exists because a
 * container is packed with pallets, not poured full — the engine reports both
 * the raw and the practical comparison.
 */
export const DEFAULT_CONTAINER_PROFILES: ContainerProfile[] = [
  {
    id: '20FT',
    name: '20ft Standard',
    usableCbm: 33.2,
    maxCargoWeightKg: 28_200,
    practicalVolumeFactor: 0.9,
    internalLengthCm: 589,
    internalWidthCm: 235,
    internalHeightCm: 239,
    palletCapacity: 10,
    notes: 'Guide figures for a standard 20ft dry container, inside dimensions included. Editable.',
  },
  {
    id: '40FT',
    name: '40ft Standard',
    usableCbm: 67.7,
    maxCargoWeightKg: 28_800,
    practicalVolumeFactor: 0.9,
    internalLengthCm: 1_203,
    internalWidthCm: 235,
    internalHeightCm: 239,
    palletCapacity: 20,
    notes: 'Guide figures for a standard 40ft dry container, inside dimensions included. Editable.',
  },
  {
    id: '40HC',
    name: '40ft High Cube',
    usableCbm: 76.4,
    maxCargoWeightKg: 28_600,
    practicalVolumeFactor: 0.9,
    internalLengthCm: 1_203,
    internalWidthCm: 235,
    internalHeightCm: 269,
    palletCapacity: 20,
    notes: 'Guide figures with inside dimensions. The extra height usually buys CBM, not weight. Editable.',
  },
];

/**
 * A starting pallet/packaging profile for a bulk salt product.
 *
 * Offered as a copyable default so a new product is not blocked on data entry;
 * every number is meant to be replaced with the factory's own carton and pallet
 * measurements.
 */
export const DEFAULT_PACKAGING_PROFILE: PackagingProfile = {
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
