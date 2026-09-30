// ============================================================================
// LUXEDGE V2 — COMMERCE READINESS MODEL (Commerce Truth Fix)
//
// A single deterministic model that classifies every catalog product:
//
//   commerce_readiness
//     COMMERCE_READY       — genuine supplier + cost basis + fulfillment
//     SOURCE_PENDING       — no verified purchasing path (retail-ref only)
//     ECONOMICS_PENDING    — supplier exists but cost/landed unknown
//     FULFILLMENT_PENDING  — cost known but stock/shipping not verified
//     RISK_REVIEW          — unresolved critical risk (battery/IP/regulatory)
//     DRAFT                — not storefront-eligible lifecycle status
//
//   source_type
//     CJ_DROPSHIPPING / AUTHORIZED_WHOLESALE / MANUFACTURER_DIRECT /
//     RETAIL_REFERENCE_ONLY / OWNER_STOCK / OTHER_VERIFIED / UNKNOWN
//
//   inventory_source
//     SUPPLIER_VERIFIED / INTERNAL_STOCK / UNTRACKED / UNKNOWN
//
// TRUTH RULES: never guess. UNKNOWN stays UNKNOWN. Manufacturer retail
// reference proves authenticity — it does NOT prove a purchasing path.
// ============================================================================

export type CommerceReadiness =
  | 'COMMERCE_READY'
  | 'SOURCE_PENDING'
  | 'ECONOMICS_PENDING'
  | 'FULFILLMENT_PENDING'
  | 'RISK_REVIEW'
  | 'DRAFT';

export type SourceType =
  | 'CJ_DROPSHIPPING'
  | 'AUTHORIZED_WHOLESALE'
  | 'MANUFACTURER_DIRECT'
  | 'RETAIL_REFERENCE_ONLY'
  | 'OWNER_STOCK'
  | 'OTHER_VERIFIED'
  | 'UNKNOWN';

export type InventorySource = 'SUPPLIER_VERIFIED' | 'INTERNAL_STOCK' | 'UNTRACKED' | 'UNKNOWN';

export interface ReadinessFacts {
  status?: string;
  /** supplier_source free-text, e.g. 'CJ' or 'KONG Company (official manufacturer)'. */
  supplierSource?: string | null;
  supplierProductRef?: string | null;
  supplierUrl?: string | null;
  /** A stored, already-validated source type; preferred over re-deriving it. */
  sourceType?: string | null;
  costPrice?: number;
  shippingCost?: number;
  freeShipping?: boolean;
  deliveryMinDays?: number | null;
  deliveryMaxDays?: number | null;
  usInventory?: boolean;
  stockStatus?: string | null;
  inventoryQty?: number;
  riskFlags?: string[];
  /**
   * The explicit safety review outcome for a product that carries risk flags.
   *
   * A risk flag is a hold, not a score: the only thing that clears it is an
   * authorised human decision recorded here (`APPROVED_FOR_SALE`). This is the
   * Admin-only acknowledgement step — nothing about the product's economics can
   * silently satisfy it (see `deriveCommerceReadiness`).
   */
  safetyReviewStatus?: string | null;
}

/**
 * The risk-flag terms that hold a product for review.
 *
 * Deliberately broader than the battery/IP set the engine used to carry: the
 * importer (`deriveImportReadiness`) already raised `Ingestible — food safety
 * review`, so a flag the importer wrote could be one this engine did *not*
 * recognise — and once economics were entered the row would have flipped itself
 * COMMERCE_READY with the food-safety flag still attached. One pattern now
 * covers both, word-bounded so it matches flag tokens and not substrings of
 * unrelated words.
 */
export const RISK_FLAG_PATTERN =
  /\b(battery|batteries|electric|counterfeit|replica|branded copy|knockoff|trademark|copyright|licen[cs]ing|regulatory|compliance|medicine|medicinal|supplement|vitamin|pharmaceutical|weapon|medical|therapeutic|ingestible|unsafe|safety review|food safety|food-safety|regulatory review)\b/i;

/** True when a product carries a risk flag that requires an explicit review. */
export function hasUnresolvedRisk(f: ReadinessFacts): boolean {
  const flagged = (f.riskFlags || []).some((flag) => RISK_FLAG_PATTERN.test(String(flag)));
  if (!flagged) return false;
  // An explicit, recorded human approval is the only thing that clears the hold.
  return f.safetyReviewStatus !== 'APPROVED_FOR_SALE';
}

const SOURCE_TYPES: readonly SourceType[] = [
  'CJ_DROPSHIPPING', 'AUTHORIZED_WHOLESALE', 'MANUFACTURER_DIRECT',
  'RETAIL_REFERENCE_ONLY', 'OWNER_STOCK', 'OTHER_VERIFIED', 'UNKNOWN',
];

/** Derive source_type from persisted evidence. Manufacturer pages = retail reference only. */
export function deriveSourceType(f: ReadinessFacts): SourceType {
  // A stored value is a recorded decision; trust it before re-deriving so a
  // classification an admin set cannot be silently overruled by a rename.
  const stored = String(f.sourceType ?? '').trim() as SourceType;
  if (SOURCE_TYPES.includes(stored)) return stored;
  const src = String(f.supplierSource || '').toLowerCase();
  const ref = String(f.supplierProductRef || '').toLowerCase();
  const url = String(f.supplierUrl || '').toLowerCase();
  if (src.includes('cj') || ref.startsWith('cj') || /cjdropshipping/.test(url)) return 'CJ_DROPSHIPPING';
  if (/kong|official manufacturer|manufacturer page/i.test(src)) return 'RETAIL_REFERENCE_ONLY';
  if (src) return 'OTHER_VERIFIED';
  return 'UNKNOWN';
}

/** Derive inventory_source truthfully. Internal qty is NOT supplier stock. */
export function deriveInventorySource(f: ReadinessFacts): InventorySource {
  // Supplier-verified only when there is real supplier stock evidence.
  if (f.usInventory === true && f.stockStatus === 'in_stock') return 'SUPPLIER_VERIFIED';
  if (f.stockStatus && f.stockStatus !== 'unknown' && f.stockStatus !== 'out_of_stock') return 'INTERNAL_STOCK';
  return 'UNKNOWN';
}

/** A product is storefront-eligible only when it is genuinely COMMERCE_READY. */
export function isCommerceReady(f: ReadinessFacts): boolean {
  return deriveCommerceReadiness(f) === 'COMMERCE_READY';
}

/**
 * Deterministic readiness from persisted facts.
 * - Lifecycle not active/published → DRAFT.
 * - No verified purchasing path (retail-ref only or unknown source) → SOURCE_PENDING.
 * - No cost/landed basis → ECONOMICS_PENDING.
 * - Cost known but no stock/shipping evidence → FULFILLMENT_PENDING.
 * - Unresolved critical risk flags → RISK_REVIEW.
 * - Otherwise COMMERCE_READY.
 */
export function deriveCommerceReadiness(f: ReadinessFacts): CommerceReadiness {
  if (f.status && f.status !== 'active' && f.status !== 'published') return 'DRAFT';

  const sourceType = deriveSourceType(f);
  if (sourceType === 'RETAIL_REFERENCE_ONLY' || sourceType === 'UNKNOWN') return 'SOURCE_PENDING';

  // Own stock is not bought from a supplier, so it has no supplier cost to
  // verify — the shop's own physical inventory *is* the supply. Demanding a cost
  // figure here left the owner's own products stuck at ECONOMICS_PENDING for a
  // number that does not exist, which is what made "set Own Stock" look like it
  // had done nothing.
  const ownStock = sourceType === 'OWNER_STOCK' || /^\s*own\s*stock\s*$/i.test(String(f.supplierSource || ''));

  // Otherwise the retail cost basis is the verified **supplier cost**, and
  // nothing else. Landed cost (supplier cost + freight + duty) was the other half
  // of this check, but Himalayan Koh ships with Shippo/USPS at checkout, so a
  // per-product freight figure is not a retail prerequisite.
  const hasCost = (f.costPrice ?? 0) > 0;
  if (!ownStock && !hasCost) return 'ECONOMICS_PENDING';

  // USA fulfillment/stock evidence: real list-level US inventory (or a real
  // supplier in_stock state). Per-product shipping cost is handled by the
  // storewide checkout model (calculated at checkout), so it does not block
  // readiness by itself — but a missing US fulfillment basis does.
  const hasFulfillment = f.usInventory === true ||
    (f.stockStatus === 'in_stock' && (f.inventoryQty ?? 0) > 0);
  if (!hasFulfillment) return 'FULFILLMENT_PENDING';

  // Unresolved risk outranks readiness. `hasUnresolvedRisk` already treats a
  // recorded `APPROVED_FOR_SALE` as the clearance, so an ingestible product
  // stays RISK_REVIEW from import time until an admin explicitly approves it —
  // entering economics can never do it.
  if (hasUnresolvedRisk(f)) return 'RISK_REVIEW';

  return 'COMMERCE_READY';
}

/** Fields a write must have touched for a readiness reconciliation to be allowed. */
export const READINESS_RELEVANT_FIELDS: readonly string[] = [
  'status',
  'costPrice',
  'supplierSource',
  'supplierProductRef',
  'supplierUrl',
  'usInventory',
  'stockStatus',
  'stockQuantity',
  'inventoryQty',
  'manageStock',
  'riskFlags',
  'safetyReviewStatus',
  'sourceType',
];

/**
 * The readiness value a write should persist, or `null` to leave it unchanged.
 *
 * This is the missing half of the workflow: the readiness engine existed but
 * nothing re-ran it, so a product stamped `ECONOMICS_PENDING` at import kept
 * that stamp forever — even after genuine economics were entered — and the
 * public contract (which reads the *stored* value) never saw the upgrade.
 *
 * The rules, in order:
 *
 * 1. **No stored value means no reconciliation.** A row the store never
 *    classified (own-stock lines like the 16 oz jar) is public by the console's
 *    own default; writing a value here would hide a product nobody flagged.
 * 2. **An unresolved risk hold is never auto-cleared.** While a risk flag stands
 *    without a recorded approval, the stored `RISK_REVIEW` is kept verbatim.
 * 3. **Climb toward ready on a relevant change.** When the write touched a
 *    readiness-relevant field, the freshly derived value is written — so
 *    supplying a verified cost turns `ECONOMICS_PENDING` into `COMMERCE_READY`.
 * 4. **Do not downgrade on an unrelated edit.** Flipping a merchandising flag
 *    must not silently unlist a ready product; a downgrade needs a write that
 *    actually removed a prerequisite.
 */
export function reconcileCommerceReadiness(
  facts: ReadinessFacts,
  stored: string | null | undefined,
  relevantChange: boolean,
): CommerceReadiness | null {
  const declared = String(stored ?? '').trim();
  if (!declared) return null;
  if (declared === 'RISK_REVIEW' && hasUnresolvedRisk(facts)) return null;

  const derived = deriveCommerceReadiness(facts);
  if (derived === declared) return null;

  const upgrading = derived === 'COMMERCE_READY';
  if (!upgrading && !relevantChange) return null;
  return derived;
}

export const COMMERCE_READINESS_LABELS: Record<CommerceReadiness, string> = {
  COMMERCE_READY: 'Commerce Ready',
  SOURCE_PENDING: 'Source Pending',
  ECONOMICS_PENDING: 'Economics Pending',
  FULFILLMENT_PENDING: 'Fulfillment Pending',
  RISK_REVIEW: 'Risk Review',
  DRAFT: 'Draft',
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  CJ_DROPSHIPPING: 'CJ Dropshipping',
  AUTHORIZED_WHOLESALE: 'Authorized Wholesale',
  MANUFACTURER_DIRECT: 'Manufacturer Direct',
  RETAIL_REFERENCE_ONLY: 'Retail Reference Only',
  OWNER_STOCK: 'Owner Stock',
  OTHER_VERIFIED: 'Other Verified',
  UNKNOWN: 'Unknown',
};

export const INVENTORY_SOURCE_LABELS: Record<InventorySource, string> = {
  SUPPLIER_VERIFIED: 'Supplier Verified',
  INTERNAL_STOCK: 'Internal Stock',
  UNTRACKED: 'Untracked',
  UNKNOWN: 'Unknown',
};
