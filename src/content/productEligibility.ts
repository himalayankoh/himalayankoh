// Shared, fail-closed public PDP contract. Admin records are never affected.
import { RISK_FLAG_PATTERN } from '../features/catalog/commerceReadiness';

export interface PublicProductFacts { id?: string | null; slug?: string | null; name?: string | null; status?: string | null; description?: string | null; short_description?: string | null; shortDesc?: string | null; price?: number | null; image_url?: string | null; images?: string[] | null; product_images?: Array<{ url?: string | null; public_url?: string | null }> | null; commerce_readiness?: string | null; commerceReadiness?: string | null; supplier_source?: string | null; supplierSource?: string | null; cost_price?: number | null; us_inventory?: boolean | null; usInventory?: boolean | null; stock_status?: string | null; stockStatus?: string | null; inventory_qty?: number | null; stock?: number | null; risk_flags?: string[] | null; riskFlags?: string[] | null; safety_review_status?: string | null; safetyReviewStatus?: string | null; }
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

export function isCommerceReadyForPublicListing(p: PublicProductFacts): boolean {
  // Manufacturer pages are reference material, not an independently verified
  // commerce supply. Evaluate this before stored readiness so an accidental
  // COMMERCE_READY stamp cannot make an official-source row public.
  if (isOfficialOrManufacturerSource(p)) return false;
  // An unapproved risk hold is likewise evaluated first: no stamp clears it.
  if (hasUnresolvedRiskFlag(p)) return false;
  const declared = text(p.commerce_readiness || p.commerceReadiness);
  if (declared) return declared === 'COMMERCE_READY';
  const source = text(p.supplier_source || p.supplierSource).toLowerCase();
  return !!source && num(p.cost_price) > 0 &&
    (p.us_inventory === true || p.usInventory === true || (text(p.stock_status || p.stockStatus) === 'in_stock' && num(p.inventory_qty ?? p.stock) > 0));
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
