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
  landedCost: 0,
  usInventory: true,
  stockStatus: 'in_stock',
  inventoryQty: 4,
  riskFlags: [],
  safetyReviewStatus: null,
  offNiche: false,
};

describe('readiness checklist — the imported products', () => {
  it('names the cost basis as the blocker for an ECONOMICS_PENDING import', () => {
    const { blockers, ready: isReady } = commerceReadinessChecklist({
      ...ready,
      status: 'active',
      costPrice: 0,
      landedCost: 0,
      supplierSource: 'AliExpress',
      sourceType: 'OTHER_VERIFIED',
      usInventory: false,
    });
    expect(isReady).toBe(false);
    expect(blockers.map((b) => b.key)).toEqual(['cost']);
    expect(blockers[0].detail).toMatch(/supplier list price is not an acquisition cost/i);
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
