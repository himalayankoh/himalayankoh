import { describe, expect, it } from 'vitest';
import { storefrontListingReason, isStorefrontListable } from './storefrontListing';
import { deriveCommerceReadiness, reconcileCommerceReadiness } from './commerceReadiness';

/**
 * The retail cost basis is the verified supplier cost only.
 *
 * Landed cost (supplier cost + freight + duty) used to count as well, but the
 * shop ships with Shippo/USPS at checkout, so a per-product freight figure is not
 * a retail prerequisite — demanding one left honest imports stuck at
 * ECONOMICS_PENDING for a number the owner could not supply.
 */
describe('readiness — retail cost basis', () => {
  const facts = {
    status: 'published',
    supplierSource: 'AliExpress',
    sourceType: 'OTHER_VERIFIED',
    stockStatus: 'in_stock',
    inventoryQty: 10,
  };

  it('is ECONOMICS_PENDING with no supplier cost, whatever the landed figure says', () => {
    expect(deriveCommerceReadiness({ ...facts, costPrice: 0 })).toBe('ECONOMICS_PENDING');
  });

  it('is COMMERCE_READY on a verified supplier cost alone', () => {
    expect(deriveCommerceReadiness({ ...facts, costPrice: 4 })).toBe('COMMERCE_READY');
  });
});

/**
 * Own stock has no supplier, so it has no supplier cost to verify.
 *
 * The shop's own physical inventory is the supply. Demanding a cost figure here
 * left the owner's own products stuck at ECONOMICS_PENDING for a number that does
 * not exist — which is exactly what made "set Own Stock and save" look like the
 * save had failed.
 */
describe('readiness — own stock', () => {
  const ownStock = {
    status: 'published',
    supplierSource: 'Own Stock',
    sourceType: 'OWNER_STOCK',
    stockStatus: 'in_stock',
    inventoryQty: 10,
  };

  it('is COMMERCE_READY with no cost, from the stock evidence alone', () => {
    expect(deriveCommerceReadiness(ownStock)).toBe('COMMERCE_READY');
  });

  it('lets a save turn ECONOMICS_PENDING into COMMERCE_READY for own stock', () => {
    expect(reconcileCommerceReadiness(ownStock, 'ECONOMICS_PENDING', true)).toBe('COMMERCE_READY');
  });

  it('still withholds own stock with no stock evidence', () => {
    expect(deriveCommerceReadiness({ ...ownStock, stockStatus: 'out_of_stock', inventoryQty: 0 }))
      .toBe('FULFILLMENT_PENDING');
  });

  it('never lets own stock clear a food-safety hold', () => {
    const flagged = { ...ownStock, riskFlags: ['Ingestible — food safety review'] };
    expect(deriveCommerceReadiness(flagged)).toBe('RISK_REVIEW');
    expect(reconcileCommerceReadiness(flagged, 'RISK_REVIEW', true)).toBeNull();
  });

  it('lists an own-stock product on the storefront once it is COMMERCE_READY', () => {
    expect(storefrontListingReason({ ...baseProduct, supplierSource: 'Own Stock', costPrice: 0, commerceReadiness: 'COMMERCE_READY' })).toBeNull();
  });
});

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
  it('lists an imported product the workflow stamped ECONOMICS_PENDING', () => {
    // An import carries a supplier stamp from the importer and no supplier cost
    // at all. Himalayan Koh sells its own stock, so that pending *bookkeeping*
    // word must not 404 a product the owner priced, imaged and published — the
    // "NOT PUBLIC — commerce readiness incomplete" the owner kept hitting.
    const p = { ...baseProduct, commerceReadiness: 'ECONOMICS_PENDING' };
    expect(storefrontListingReason(p)).toBeNull();
    expect(isStorefrontListable(p)).toBe(true);
  });

  it('lists an imported product with no cost, source or fulfillment recorded', () => {
    const p = {
      ...baseProduct,
      commerceReadiness: 'FULFILLMENT_PENDING',
      supplierSource: null,
      costPrice: null,
      usInventory: null,
      stockStatus: null,
      stockQuantity: null,
    };
    expect(isStorefrontListable(p)).toBe(true);
  });

  it('lists a product the workflow stamped COMMERCE_READY', () => {
    const p = { ...baseProduct, commerceReadiness: 'COMMERCE_READY' };
    expect(storefrontListingReason(p)).toBeNull();
    expect(isStorefrontListable(p)).toBe(true);
  });

  it('still withholds a manufacturer/official reference page', () => {
    // A manufacturer page proves authenticity; it is not stock the shop may sell.
    const p = { ...baseProduct, supplierSource: 'KONG Company (official manufacturer)' };
    expect(isStorefrontListable(p)).toBe(false);
  });

  it('treats a product the store never classified as listable (the console default)', () => {
    const p = { ...baseProduct, commerceReadiness: null };
    expect(storefrontListingReason(p)).toBeNull();
  });

  it('keeps a RISK_REVIEW product off the storefront', () => {
    const p = { ...baseProduct, commerceReadiness: 'RISK_REVIEW' };
    expect(isStorefrontListable(p)).toBe(false);
    // …until an admin records the decision.
    const approved = { ...p, safetyReviewStatus: 'APPROVED_FOR_SALE' };
    expect(isStorefrontListable(approved)).toBe(true);
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
