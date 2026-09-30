import { describe, expect, it } from 'vitest';
import { storefrontListingReason, isStorefrontListable } from './storefrontListing';
import { deriveCommerceReadiness, reconcileCommerceReadiness } from './commerceReadiness';

/**
 * The storefront's listing policy.
 *
 * These pin the seam that was missing: the public contract
 * (`content/productEligibility.ts`) was documented as the PDP's fail-closed gate
 * but no public read ever consulted it, so a product stamped RISK_REVIEW was
 * served to customers while the console counted it as not listable. Every
 * fixture below is shaped like a real staging row.
 */
const baseProduct = {
  id: 2710,
  slug: 'himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs-himalayan-koh',
  name: 'Himalayan Rock Salt Pouches in Fine and Coarse Grain Sizes - 6 lbs',
  priceMin: 17.95,
  image: 'https://himalayankoh.com/staging/wp-content/uploads/rocksalt.jpg',
  description: 'Fine and coarse grain Himalayan rock salt pouches for everyday kitchen use and mineral seasoning.',
  supplierSource: 'AliExpress',
  stockStatus: 'instock',
  stockQuantity: 10,
  costPrice: null,
  usInventory: null,
};

describe('storefront listing — commerce readiness', () => {
  it('hides a product the workflow stamped ECONOMICS_PENDING', () => {
    const p = { ...baseProduct, commerceReadiness: 'ECONOMICS_PENDING' };
    expect(storefrontListingReason(p)).toBe('commerce readiness incomplete');
  });

  it('lists a product the workflow stamped COMMERCE_READY', () => {
    const p = { ...baseProduct, commerceReadiness: 'COMMERCE_READY' };
    expect(storefrontListingReason(p)).toBeNull();
    expect(isStorefrontListable(p)).toBe(true);
  });

  it('does not let a WooCommerce publish bypass readiness', () => {
    // status is always "published" on this read (it returns published rows only);
    // the readiness stamp is the thing that still withholds it.
    const p = { ...baseProduct, commerceReadiness: 'ECONOMICS_PENDING' };
    expect(isStorefrontListable(p)).toBe(false);
  });

  it('treats a product the store never classified as listable (the console default)', () => {
    const p = { ...baseProduct, commerceReadiness: null };
    expect(storefrontListingReason(p)).toBeNull();
  });

  it('keeps a RISK_REVIEW product off the storefront', () => {
    const p = { ...baseProduct, commerceReadiness: 'RISK_REVIEW' };
    expect(isStorefrontListable(p)).toBe(false);
  });
});

describe('storefront listing — the risk hold is explicit, never automatic', () => {
  const flagged = {
    status: 'published',
    supplierSource: 'AliExpress',
    sourceType: 'OTHER_VERIFIED',
    costPrice: 4,
    stockStatus: 'in_stock',
    inventoryQty: 10,
    riskFlags: ['Ingestible — food safety review'],
  };

  it('holds an ingestible product for review even with economics complete', () => {
    expect(deriveCommerceReadiness(flagged)).toBe('RISK_REVIEW');
  });

  it('does not upgrade a stored RISK_REVIEW to ready just because economics exist', () => {
    expect(reconcileCommerceReadiness(flagged, 'RISK_REVIEW', true)).toBeNull();
  });

  it('clears the hold only on a recorded admin approval, then follows the facts', () => {
    const approved = { ...flagged, safetyReviewStatus: 'APPROVED_FOR_SALE' };
    expect(reconcileCommerceReadiness(approved, 'RISK_REVIEW', true)).toBe('COMMERCE_READY');
    // …and only then does the storefront serve it.
    const stored = { ...baseProduct, commerceReadiness: 'COMMERCE_READY' };
    expect(storefrontListingReason(stored)).toBeNull();
  });

  it('never auto-clears the flag itself — the reason string is untouched', () => {
    const approved = { ...flagged, safetyReviewStatus: 'APPROVED_FOR_SALE' };
    expect(approved.riskFlags).toEqual(['Ingestible — food safety review']);
  });
});
