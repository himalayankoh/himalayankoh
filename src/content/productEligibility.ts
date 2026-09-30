// Shared, fail-closed public PDP contract. Admin records are never affected.
import { RISK_FLAG_PATTERN } from '../features/catalog/commerceReadiness';

export interface PublicProductFacts { id?: string | null; slug?: string | null; name?: string | null; status?: string | null; description?: string | null; short_description?: string | null; shortDesc?: string | null; price?: number | null; image_url?: string | null; images?: string[] | null; product_images?: Array<{ url?: string | null; public_url?: string | null }> | null; commerce_readiness?: string | null; commerceReadiness?: string | null; supplier_source?: string | null; supplierSource?: string | null; source_type?: string | null; sourceType?: string | null; cost_price?: number | null; us_inventory?: boolean | null; usInventory?: boolean | null; stock_status?: string | null; stockStatus?: string | null; inventory_qty?: number | null; stock?: number | null; risk_flags?: string[] | null; riskFlags?: string[] | null; safety_review_status?: string | null; safetyReviewStatus?: string | null; }
const text = (v: unknown) => String(v || '').replace(/\s+/g, ' ').trim();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const isOfficialOrManufacturerSource = (p: PublicProductFacts) => /\bofficial\b|\bmanufacturer\b/i.test(text(p.supplier_source || p.supplierSource));
/**
 * An unresolved risk flag: a flagged ingestible/medical/battery/IP product stays
 * off the storefront until an admin records an explicit approval.
 *
 * Checked *before* the declared-readiness short-circuit on purpose. The stored
 * stamp is written by the readiness engine, which already refuses to stamp a
 * flagged product COMMERCE_READY — but the stamp is data on the store, and a
 * product whose stamp was ever set (or edited) to COMMERCE_READY must still not
 * be served while its risk flag stands unapproved. The flag is the hold; the
 * stamp is only what clears it. `safetyReviewStatus: APPROVED_FOR_SALE` is the
 * one recorded human decision that does.
 */
export function hasUnresolvedRiskFlag(p: PublicProductFacts): boolean {
  const flags = [...(p.risk_flags || []), ...(p.riskFlags || [])].filter(Boolean);
  if (!flags.some((flag) => RISK_FLAG_PATTERN.test(String(flag)))) return false;
  return text(p.safety_review_status || p.safetyReviewStatus) !== 'APPROVED_FOR_SALE';
}

/**
 * The storefront's commerce gate.
 *
 * Himalayan Koh sells its own stock. The owner sets the retail price, the shop's
 * physical inventory is the supply, and shipping is priced at checkout by
 * Shippo/USPS. So there is no supplier-provenance or supplier-cost fact for a
 * *customer-facing* listing to prove: those figures are the owner's own
 * bookkeeping, and the readiness engine keeps computing them so the console can
 * still show what is missing (see `features/catalog/commerceReadiness.ts`).
 *
 * What is left here are the two rules that genuinely protect the shop:
 *
 *  - a manufacturer/official page is reference material, never stock to sell;
 *  - an unapproved risk hold stays off the storefront until an admin records the
 *    decision.
 *
 * The earlier version also withheld any product whose stored stamp was
 * SOURCE_PENDING / ECONOMICS_PENDING / FULFILLMENT_PENDING. That promoted an
 * internal bookkeeping column into a 404 on products the owner had already
 * priced, imaged, stocked and published, and it is what produced the
 * "NOT PUBLIC — commerce readiness incomplete" on every imported product: an
 * import carries a supplier stamp from the importer and no supplier cost at all,
 * so it sat withheld for a number that does not exist. The ready/pending word is
 * still recorded and still shown in the console; it no longer hides the listing.
 */
export function isCommerceReadyForPublicListing(p: PublicProductFacts): boolean {
  // Manufacturer pages are reference material, not an independently verified
  // commerce supply. Evaluate this before stored readiness so an accidental
  // COMMERCE_READY stamp cannot make an official-source row public.
  if (isOfficialOrManufacturerSource(p)) return false;
  // An unapproved risk hold is likewise evaluated first: no stamp clears it.
  if (hasUnresolvedRiskFlag(p)) return false;
  // A stored risk hold is a hold even when this read carries no flags for it:
  // the console shows the row as "Risk Review", so the storefront must not serve
  // it. An approval clears it here too, and the readiness reconciliation rewrites
  // the stamp to COMMERCE_READY on the next save.
  if (text(p.commerce_readiness || p.commerceReadiness) === 'RISK_REVIEW'
    && text(p.safety_review_status || p.safetyReviewStatus) !== 'APPROVED_FOR_SALE') return false;
  return true;
}
export function hasKnownProductContradiction(p: PublicProductFacts): boolean {
  const h = text([p.slug, p.name, p.description, p.short_description, p.shortDesc].join(' ')).toLowerCase();
  return (/(trough|water bladder)/.test(h) && /\b30[- ]?gallon\b/.test(h) && /water bladder/.test(h));
}
export function publicProductIneligibilityReason(p: PublicProductFacts): string | null {
  if (!['active', 'published'].includes(text(p.status).toLowerCase())) return 'status is draft';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(text(p.slug))) return 'missing canonical slug';
  if (text(p.name).length < 3 || /^(product|item|test)(\s|$)/i.test(text(p.name))) return 'insufficient product identity';
  if (num(p.price) <= 0) return 'missing required price';
  const isUsableImg = (u: unknown) => {
    const s = text(u);
    return /^https?:\/\//i.test(s) || /^\/(?:images|assets|uploads)\//i.test(s) || /^\/[a-zA-Z0-9_\-\/.]+\.(?:webp|jpg|jpeg|png|svg|avif)$/i.test(s);
  };
  if (!(isUsableImg(p.image_url) || (p.images || []).some(isUsableImg) || (p.product_images || []).some((x) => isUsableImg(x?.url || x?.public_url)))) return 'missing usable product image';
  if (text(p.description).length + text(p.short_description || p.shortDesc).length < 30) return 'insufficient verified product content';
  if (!isCommerceReadyForPublicListing(p)) return 'commerce readiness incomplete';
  if (hasKnownProductContradiction(p)) return 'known contradictory product facts';
  return null;
}
export function isPubliclyListableProduct(p: PublicProductFacts): boolean { return publicProductIneligibilityReason(p) === null; }
