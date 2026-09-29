/**
 * The write path, exercised against the real store.
 *
 * Skipped unless `BACKEND_INTEGRATION=1` and WooCommerce credentials are
 * present, because it creates and then removes a product. It runs against the
 * **staging** store only: the test refuses to run against a base URL that is not
 * the staging install, so a misconfigured environment cannot turn a unit test
 * into a production write.
 *
 * What it proves, in order: create a draft product with a price, a stock quantity
 * and the console's own fields, read those back from the store itself, change
 * price/stock/SKU/title and a console field, read the changes back, then trash it
 * and confirm it is gone from every catalog read. Nothing is left behind either
 * way.
 *
 * The console fields are here for a reason: they are stored as `meta_data`, and
 * whether a WooCommerce product keeps an arbitrary meta key is a fact about the
 * live store that no unit test can settle. This repository has been caught by
 * that difference before.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { hasWooCommerceCredentials } from '../backend/credentials';
import { backendConfig } from '../backend/config';
import { fromWooProduct } from './productPayload';
import {
  createWooProduct,
  getWooProduct,
  listWooProducts,
  permanentlyDeleteWooProduct,
  trashWooProduct,
  updateWooProduct,
} from './productWrite';

const enabled = process.env.BACKEND_INTEGRATION === '1';
const isStaging = /himalayankoh\.com\/staging/.test(backendConfig.woocommerceBaseUrl);
const canRun = enabled && hasWooCommerceCredentials() && isStaging;

const TEST_SKU = 'TEST-WOO-DELETE';
const TEST_TITLE = 'TEST - DELETE ME - WOO ADMIN';

describe.skipIf(!canRun)('WooCommerce product write path (live staging)', () => {
  let createdId: number | null = null;

  afterAll(async () => {
    // Trash first (that is the transition under test), then remove it outright
    // so a throwaway product never accumulates in the store's trash.
    if (createdId !== null) {
      await trashWooProduct(createdId).catch(() => undefined);
      await permanentlyDeleteWooProduct(createdId).catch(() => undefined);
    }
  });

  it('creates, edits and archives a product', async () => {
    const created = await createWooProduct({
      name: TEST_TITLE,
      status: 'draft',
      price: 1,
      sku: TEST_SKU,
      manageStock: true,
      stockQuantity: 1,
      stockStatus: 'instock',
      supplierSource: 'Zeedrop',
      supplierUrl: 'https://example.invalid/item/1',
      promoted: true,
      saleEnabled: false,
      shippingCost: 8.5,
      freeShipping: false,
      features: ['Fine grain', 'Food grade'],
      specifications: { weightOz: 720, packagePreset: 'BOX_BAG_45' },
      ownerNotes: 'Throwaway product — safe to delete',
    });

    createdId = created.product.id;
    expect(createdId).toBeGreaterThan(0);
    expect(created.product.status).toBe('draft');
    expect(created.product.price).toBe(1);
    expect(created.product.sku).toBe(TEST_SKU);
    expect(created.product.stockQuantity).toBe(1);

    // Read it back from the store rather than trusting the write's echo.
    const stored = await getWooProduct(createdId);
    expect(stored.name).toBe(TEST_TITLE);
    expect(stored.sku).toBe(TEST_SKU);
    expect(stored.regular_price).toBe('1.00');
    expect(stored.manage_stock).toBe(true);
    expect(stored.stock_quantity).toBe(1);

    // The console's own fields, read back out of the store's meta — the round
    // trip thirty-one editor fields never made.
    const storedFields = fromWooProduct(stored).consoleFields;
    expect(storedFields).toMatchObject({
      supplierSource: 'Zeedrop',
      supplierUrl: 'https://example.invalid/item/1',
      promoted: true,
      saleEnabled: false,
      shippingCost: 8.5,
      freeShipping: false,
      features: ['Fine grain', 'Food grade'],
      specifications: { weightOz: 720, packagePreset: 'BOX_BAG_45' },
      ownerNotes: 'Throwaway product — safe to delete',
    });

    const updated = await updateWooProduct(createdId, {
      ownerNotes: 'edited note',
      promoted: false,
      deliveryMinDays: 3,
      riskFlags: ['price_unverified'],
      name: `${TEST_TITLE} (edited)`,
      price: 2.5,
      sku: `${TEST_SKU}-2`,
      stockQuantity: 5,
    });
    expect(updated.product.name).toBe(`${TEST_TITLE} (edited)`);
    expect(updated.product.price).toBe(2.5);
    expect(updated.product.sku).toBe(`${TEST_SKU}-2`);
    expect(updated.product.stockQuantity).toBe(5);

    const storedAgain = await getWooProduct(createdId);
    expect(storedAgain.regular_price).toBe('2.50');
    expect(storedAgain.stock_quantity).toBe(5);
    expect(storedAgain.sku).toBe(`${TEST_SKU}-2`);

    const fieldsAgain = fromWooProduct(storedAgain).consoleFields;
    expect(fieldsAgain).toMatchObject({
      ownerNotes: 'edited note',
      promoted: false,
      deliveryMinDays: 3,
      riskFlags: ['price_unverified'],
    });
    // Untouched console fields survive an unrelated edit rather than being
    // cleared by it, which is what "partial update" has to mean here.
    expect(fieldsAgain.supplierSource).toBe('Zeedrop');
    expect(fieldsAgain.features).toEqual(['Fine grain', 'Food grade']);

    await trashWooProduct(createdId);
    const trashed = await getWooProduct(createdId);
    expect(trashed.status).toBe('trash');

    const catalog = await listWooProducts({ status: 'any' });
    expect(catalog.some((row) => row.id === createdId)).toBe(false);

    // Remove it outright: the trash is not a place to leave test fixtures.
    await permanentlyDeleteWooProduct(createdId);
    await expect(getWooProduct(createdId)).rejects.toThrow();

    // Nothing left for the next run to trip over.
    createdId = null;
  }, 120000);
});

describe.skipIf(!enabled)('write-path guardrails', () => {
  it('only runs the live test against staging', () => {
    if (!isStaging) {
      expect(canRun).toBe(false);
    }
  });
});
