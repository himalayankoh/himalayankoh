import { describe, expect, it } from 'vitest';
import { commerceReadinessChecklist, readinessBlockSummary } from './readinessChecklist';

/** A satisfied product, shaped like the one row the storefront already serves. */
const ready = {
  status: 'active',
  slug: 'himalayan-edible-pink-salt-16-oz-jar-fine-grain',
  name: 'Himalayan Edible Pink Salt – 16 oz Jar | Fine Grain',
  description: 'Fine grain Himalayan edible pink salt in a 16 oz jar, ideal for everyday cooking and finishing.',
  price: 9.95,
  images: ['https://himalayankoh.com/staging/wp-content/uploads/jar.jpg'],
  supplierSource: 'Own Stock',
  sourceType: 'OWNER_STOCK',
  costPrice: 3,
  usInventory: true,
  stockStatus: 'in_stock',
  inventoryQty: 4,
  riskFlags: [],
  safetyReviewStatus: null,
  offNiche: false,
};

describe('readiness checklist — the imported products', () => {
  it('does not ask an own-stock product for a supplier cost', () => {
    const { ready: isReady, items } = commerceReadinessChecklist({
      ...ready,
      commerceReadiness: 'ECONOMICS_PENDING',
      supplierSource: 'Own Stock',
      sourceType: 'OWNER_STOCK',
      costPrice: 0,
    });
    expect(items.find((i) => i.key === 'cost')?.state).toBe('ok');
    expect(isReady).toBe(true);
  });

  it('lists an imported product with no supplier cost recorded', () => {
    // The owner's imports have a supplier stamp and no cost figure. Economics are
    // bookkeeping, not a storefront prerequisite — the cost row reports what is
    // missing without blocking the listing.
    const { items, blockers, ready: isReady } = commerceReadinessChecklist({
      ...ready,
      status: 'active',
      costPrice: 0,
      supplierSource: 'AliExpress',
      sourceType: 'OTHER_VERIFIED',
      usInventory: false,
      stockStatus: 'out_of_stock',
      inventoryQty: 0,
    });
    expect(isReady).toBe(true);
    expect(blockers).toHaveLength(0);
    expect(items.find((i) => i.key === 'cost')?.blocking).toBe(false);
    expect(items.find((i) => i.key === 'cost')?.detail).toMatch(/does not wait for it/i);
    expect(items.find((i) => i.key === 'fulfillment')?.blocking).toBe(false);
  });

  it('holds a product the store stamped RISK_REVIEW with no flags on the record', () => {
    const { blockers } = commerceReadinessChecklist({ ...ready, commerceReadiness: 'RISK_REVIEW' });
    expect(blockers.map((b) => b.key)).toEqual(['risk']);
  });

  it('adds the niche blocker independently of readiness', () => {
    const summary = readinessBlockSummary({
      ...ready,
      costPrice: 5,
      name: 'Himalayan Pink Salt Licks for Horses',
      description: 'Himalayan natural licking salt for horses.',
      offNiche: true,
    });
    expect(summary).toContain('Storefront niche');
  });

  it('blocks a flagged ingestible product until an admin approves it', () => {
    const held = commerceReadinessChecklist({
      ...ready,
      riskFlags: ['Ingestible — food safety review'],
      safetyReviewStatus: 'PENDING_REVIEW',
    });
    expect(held.blockers.map((b) => b.key)).toContain('risk');

    const approved = commerceReadinessChecklist({
      ...ready,
      riskFlags: ['Ingestible — food safety review'],
      safetyReviewStatus: 'APPROVED_FOR_SALE',
    });
    expect(approved.blockers.map((b) => b.key)).not.toContain('risk');
    expect(approved.ready).toBe(true);
  });

  it('reports a fully-satisfied product as ready', () => {
    const { ready: isReady, blockers } = commerceReadinessChecklist(ready);
    expect(isReady).toBe(true);
    expect(blockers).toHaveLength(0);
  });

  it('honours a declared COMMERCE_READY product with no cost meta (the own-stock line)', () => {
    const { ready: isReady, blockers } = commerceReadinessChecklist({
      ...ready,
      commerceReadiness: 'COMMERCE_READY',
      supplierSource: 'WooCommerce',
      sourceType: 'MANUFACTURER_DIRECT',
      costPrice: 0,
      usInventory: null,
    });
    expect(isReady).toBe(true);
    expect(blockers).toHaveLength(0);
  });

  it('still blocks a declared-ready product on the niche policy', () => {
    const { blockers } = commerceReadinessChecklist({
      ...ready,
      commerceReadiness: 'COMMERCE_READY',
      costPrice: 0,
      offNiche: true,
    });
    expect(blockers.map((b) => b.key)).toEqual(['niche']);
  });

  it('still blocks a declared-ready product whose risk flag was never approved', () => {
    const { blockers } = commerceReadinessChecklist({
      ...ready,
      commerceReadiness: 'COMMERCE_READY',
      costPrice: 0,
      riskFlags: ['Ingestible — food safety review'],
      safetyReviewStatus: 'PENDING_REVIEW',
    });
    expect(blockers.map((b) => b.key)).toEqual(['risk']);
  });

  it('treats a manufacturer/official source as blocked, not merely missing', () => {
    const { items } = commerceReadinessChecklist({ ...ready, supplierSource: 'KONG Company (official manufacturer)' });
    expect(items.find((i) => i.key === 'source')?.state).toBe('blocked');
  });
});
