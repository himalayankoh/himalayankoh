// The admin's per-field readiness checklist.
//
// The console used to answer "why is this product not on the storefront?" with a
// single word — `Economics Pending` — and left the owner to guess which field
// that meant, in which tab, with what value. It meant a missing cost basis, but
// the badge said nothing of the kind, and the other nine prerequisites for a
// public listing were invisible entirely.
//
// This module turns the two policies that actually govern the storefront — the
// shared public contract and the niche guard — into one ordered checklist: every
// prerequisite, whether it is satisfied, and exactly which field blocks the
// listing. It is pure and client-safe so the Product Editor can render it and a
// test can pin it.

import { RISK_FLAG_PATTERN, type CommerceReadiness } from './commerceReadiness';

export type ChecklistState = 'ok' | 'missing' | 'blocked';

export interface ReadinessChecklistItem {
  key: string;
  label: string;
  state: ChecklistState;
  /** What is true now, or which field must change. Shown under the label. */
  detail: string;
  /** True when this item alone blocks a public listing. */
  blocking: boolean;
}

export interface ReadinessChecklistInput {
  status?: string | null;
  slug?: string | null;
  name?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  price?: number | null;
  images?: string[];
  supplierSource?: string | null;
  sourceType?: string | null;
  costPrice?: number | null;
  usInventory?: boolean | null;
  stockStatus?: string | null;
  inventoryQty?: number | null;
  riskFlags?: string[];
  safetyReviewStatus?: string | null;
  commerceReadiness?: CommerceReadiness | null;
  /** The storefront niche guard's verdict for this product, computed server-side. */
  offNiche?: boolean;
}

const text = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
// One risk vocabulary, shared with the readiness engine and the public contract
// so the checklist can never say "clean" about a flag the storefront holds on.
const RISK = RISK_FLAG_PATTERN;

function usableImage(url: string | undefined): boolean {
  const s = text(url);
  return /^https?:\/\//i.test(s) || /^\/(?:images|assets|uploads)\//i.test(s) || /^\/[a-zA-Z0-9_\-/.]+\.(?:webp|jpg|jpeg|png|svg|avif)$/i.test(s);
}

/**
 * Every prerequisite for a public listing, in the order the storefront asks them.
 *
 * `blocking` marks the rows that alone hold the product back; `ready` is true
 * only when none does.
 */
export function commerceReadinessChecklist(input: ReadinessChecklistInput): {
  items: ReadinessChecklistItem[];
  blockers: ReadinessChecklistItem[];
  ready: boolean;
} {
  const items: ReadinessChecklistItem[] = [];
  const push = (item: ReadinessChecklistItem) => items.push(item);

  // ---- Public contract preconditions (evaluated first, as the contract does) ----
  const status = text(input.status).toLowerCase();
  const published = status === 'active' || status === 'published';
  push({
    key: 'status',
    label: 'Listing status',
    state: published ? 'ok' : 'blocked',
    detail: published ? 'Published in the store.' : 'Set the product to Published / Active.',
    blocking: !published,
  });

  const slug = text(input.slug);
  const goodSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug);
  push({
    key: 'slug',
    label: 'Canonical slug',
    state: goodSlug ? 'ok' : 'blocked',
    detail: goodSlug ? slug : 'Set a URL slug (lowercase words separated by hyphens).',
    blocking: !goodSlug,
  });

  const name = text(input.name);
  const goodName = name.length >= 3 && !/^(product|item|test)(\s|$)/i.test(name);
  push({
    key: 'name',
    label: 'Product identity',
    state: goodName ? 'ok' : 'blocked',
    detail: goodName ? 'Named product.' : 'Give the product a real name.',
    blocking: !goodName,
  });

  const price = Number(input.price ?? 0);
  push({
    key: 'price',
    label: 'Retail price',
    state: price > 0 ? 'ok' : 'missing',
    detail: price > 0 ? `$${price.toFixed(2)}` : 'Enter the retail price — Pricing tab.',
    blocking: !(price > 0),
  });

  const hasImage = (input.images || []).some(usableImage);
  push({
    key: 'images',
    label: 'Product image',
    state: hasImage ? 'ok' : 'missing',
    detail: hasImage ? `${(input.images || []).length} image(s).` : 'Attach at least one product image — Images tab.',
    blocking: !hasImage,
  });

  const contentLength = text(input.description).length + text(input.shortDescription).length;
  const hasContent = contentLength >= 30;
  push({
    key: 'content',
    label: 'Verified content',
    state: hasContent ? 'ok' : 'missing',
    detail: hasContent ? `${contentLength} characters of copy.` : 'Write at least a sentence of product copy.',
    blocking: !hasContent,
  });

  // ---- Commerce readiness facts (the ECONOMICS_PENDING family) ----
  //
  // The public contract short-circuits on a *declared* readiness: a product the
  // store already holds as COMMERCE_READY is served without re-checking source,
  // cost or fulfillment (that is how an own-stock line that never went through
  // the workflow stays public). The checklist mirrors that exactly — otherwise
  // it would show an own-stock product as blocked while the storefront serves it,
  // which is the console/storefront disagreement this whole change removes.
  const declaredReady = input.commerceReadiness === 'COMMERCE_READY';
  const heldDetail = 'Not required — the store holds this product as commerce-ready.';

  const source = text(input.supplierSource);
  const sourceType = text(input.sourceType);
  const referenceOnly = sourceType === 'RETAIL_REFERENCE_ONLY' || sourceType === 'UNKNOWN';
  const officialSource = /\bofficial\b|\bmanufacturer\b/i.test(source);
  const sourceOk = !!source && !referenceOnly && !officialSource;
  push({
    key: 'source',
    label: 'Purchasing path (supplier)',
    state: sourceOk || declaredReady ? 'ok' : referenceOnly || officialSource ? 'blocked' : 'missing',
    detail: declaredReady
      ? heldDetail
      : sourceOk
        ? `Sourced from ${source}.`
        : officialSource
          ? 'A manufacturer/official page is reference material, not a verified supply — record the actual supplier.'
          : referenceOnly
            ? 'No verified purchasing path — set the supplier and source type.'
            : 'Record the supplier this product is actually bought from — Commerce tab.',
    blocking: !sourceOk && !declaredReady,
  });

  const cost = Number(input.costPrice ?? 0);
  const hasCost = cost > 0;
  push({
    key: 'cost',
    label: 'Supplier cost (economics)',
    state: hasCost || declaredReady ? 'ok' : 'missing',
    detail: declaredReady
      ? heldDetail
      : hasCost
        ? `Verified supplier cost $${cost.toFixed(2)}.`
        : 'Enter the verified supplier cost — Pricing tab. The supplier list price is not an acquisition cost until you verify it. Shipping is calculated at checkout (Shippo/USPS), so no per-product freight figure is required.',
    blocking: !hasCost && !declaredReady,
  });

  const inventory = Number(input.inventoryQty ?? 0);
  const hasFulfillment = input.usInventory === true || (input.stockStatus === 'in_stock' && inventory > 0);
  push({
    key: 'fulfillment',
    label: 'US stock / fulfillment',
    state: hasFulfillment || declaredReady ? 'ok' : 'missing',
    detail: declaredReady
      ? heldDetail
      : hasFulfillment
        ? input.usInventory === true
          ? 'US inventory confirmed.'
          : `In stock (${inventory} units).`
        : 'Confirm US inventory, or set stock status In stock with a real quantity — Inventory tab.',
    blocking: !hasFulfillment && !declaredReady,
  });

  const flags = (input.riskFlags || []).filter(Boolean);
  const risky = flags.some((f) => RISK.test(String(f)));
  const approved = text(input.safetyReviewStatus) === 'APPROVED_FOR_SALE';
  push({
    key: 'risk',
    label: 'Risk review',
    state: risky && !approved ? 'blocked' : 'ok',
    detail: flags.length === 0
      ? 'No risk flags.'
      : risky
        ? approved
          ? `Approved for sale after review: ${flags.join('; ')}`
          : `Held for review: ${flags.join('; ')}. An admin must explicitly approve this before it can be listed.`
        : `Flagged: ${flags.join('; ')} (no mandatory review).`,
    blocking: risky && !approved,
  });

  // ---- The second storefront policy: the niche guard ----
  const offNiche = input.offNiche === true;
  push({
    key: 'niche',
    label: 'Storefront niche',
    state: offNiche ? 'blocked' : 'ok',
    detail: offNiche
      ? 'Withheld by the storefront policy: the name or copy names the animal-feed trade. Rewrite the copy or record this product against the owner\'s approved SKU list — this is not fixed by readiness.'
      : 'Within the Himalayan pink salt niche.',
    blocking: offNiche,
  });

  const blockers = items.filter((item) => item.blocking);
  return { items, blockers, ready: blockers.length === 0 };
}

/** A one-line answer to "what blocks this listing?", or null when nothing does. */
export function readinessBlockSummary(input: ReadinessChecklistInput): string | null {
  const { blockers } = commerceReadinessChecklist(input);
  if (!blockers.length) return null;
  return blockers.map((b) => b.label).join(', ');
}
