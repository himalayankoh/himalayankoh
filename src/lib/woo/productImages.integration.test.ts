/**
 * The imagery audit, run against the real store.
 *
 * Skipped unless `BACKEND_INTEGRATION=1` and WooCommerce credentials are
 * present, and the configured base URL is the staging install — a read-only
 * suite, but it must never be pointed at the production site by accident.
 *
 *   npm run test:integration -- src/lib/woo/productImages.integration.test.ts
 *
 * ## The question it answers
 *
 * The admin product editor reads WooCommerce. The storefront renders
 * WooCommerce **plus** the app-shipped defaults in
 * `lib/products/curatedImages.ts`. Nothing used to reconcile the two, so the
 * owner reported the symptom this suite exists to prevent: product 2484's page
 * showed four photographs while its editor showed a single card, with nothing
 * saying where the other three came from. Four of the store's thirteen products
 * are affected, and every one of them is a salt block or a rope salt lick.
 *
 * ## Why the expectations are pinned
 *
 * The list of affected products is asserted exactly, in the same spirit as the
 * catalog-size assertion in `wordpress.integration.test.ts`: uploading the real
 * photography into WordPress media — which is the only way to retire the curated
 * defaults — will change this list, and that change should be deliberate and
 * reviewed rather than absorbed silently. Nothing here writes: every call is a
 * GET, and the store is never modified.
 */

import { describe, expect, it } from 'vitest';

import { backendConfig } from '../backend/config';
import { hasWooCommerceCredentials } from '../backend/credentials';
import { getCatalogProducts } from '../backend/serverCatalog';
import { curatedProductImages } from '../products/curatedImages';
import { rowFromWooAdminProduct } from '../backend/adminCatalog';
import { fromWooProduct } from './productPayload';
import { listWooProducts } from './productWrite';

const enabled = process.env.BACKEND_INTEGRATION === '1';
const isStaging = /himalayankoh\.com\/staging/.test(backendConfig.woocommerceBaseUrl);
const canRun = enabled && hasWooCommerceCredentials() && isStaging;

/**
 * The products whose product pages show photography WooCommerce does not hold,
 * as observed live (slug → how many app-shipped defaults).
 *
 * 2484 has no gallery image at all, so its whole gallery is app-shipped. 2485,
 * 2486 and 2487 each hold one legacy upload and five app-shipped defaults, which
 * the storefront places *ahead* of the owner's own file.
 */
const PRODUCTS_WITH_APP_SHIPPED_IMAGERY: Record<string, number> = {
  'himalayan-salt-block-30-lbs': 4,
  'himalayan-salt-lick-1-to-2-lbs': 5,
  'himalayan-salt-lick-3-to-4-lbs': 5,
  'himalayan-salt-lick-5-to-6-lbs': 5,
};

describe.skipIf(!canRun)('product imagery: storefront vs WooCommerce (live staging)', () => {
  it('names, for every product, the imagery the editor has to be able to show', async () => {
    const records = (await listWooProducts({ status: 'any', perPage: 100 }))
      .filter((row) => row.status !== 'trash')
      .map(fromWooProduct);

    expect(records.length).toBeGreaterThan(0);

    const affected = records
      .filter((record) => record.storefrontDefaultImages.length > 0)
      .map((record) => [record.slug, record.storefrontDefaultImages.length] as const);

    // Exactly these products, and each one with the number of app-shipped
    // defaults the storefront actually overlays.
    expect(Object.fromEntries(affected)).toEqual(PRODUCTS_WITH_APP_SHIPPED_IMAGERY);

    // The defaults are never also gallery images: an image that is in both
    // places is one image to a customer, and counting it twice here is how the
    // editor would come to show a product's photography twice.
    for (const record of records) {
      for (const src of record.storefrontDefaultImages) {
        expect(record.images).not.toContain(src);
        expect(curatedProductImages(record.slug, record.sku)).toContain(src);
      }
    }
    // The store-wide reads are a few seconds each against a live store; the
    // default 5s cap measures the network, not the behaviour under test.
  }, 30_000);

  it('proves those images really are the ones a customer sees', async () => {
    const { products } = await getCatalogProducts({ perPage: 100 });
    const byId = new Map(products.map((product) => [String(product.id), product]));

    const records = (await listWooProducts({ status: 'any', perPage: 100 })).map(fromWooProduct);
    const published = records.filter(
      (record) => record.isListed && record.storefrontDefaultImages.length > 0
    );
    expect(published.length).toBeGreaterThan(0);

    for (const record of published) {
      const storefront = byId.get(String(record.id));
      expect(storefront, `product ${record.id} is published but the storefront read has no such id`).toBeTruthy();

      // Every app-shipped default appears on the product page, and the owner's
      // own gallery files are still there behind them.
      for (const src of record.storefrontDefaultImages) {
        expect(storefront!.images).toContain(src);
      }
      for (const src of record.images) {
        expect(storefront!.images).toContain(src);
      }

      // The storefront's first image is a default, not the gallery file the
      // editor shows first: that ordering is why the owner's own upload looked
      // like it had been dropped.
      const firstImage = storefront!.images?.[0];
      expect(firstImage).toBeTruthy();
      expect(record.storefrontDefaultImages).toContain(firstImage);
    }
  }, 30_000);

  it('carries the imagery through the admin rows the console actually reads', async () => {
    // The console opens the editor through the products list, so the row is the
    // answer the editor usually gets. It was the one place the defaults were
    // being dropped: the single-product route knew about them, the list did not,
    // and the images panel therefore had nothing to render.
    const records = (await listWooProducts({ status: 'any', perPage: 100 })).map(fromWooProduct);
    const block = records.find((record) => record.slug === 'himalayan-salt-block-30-lbs');
    expect(block).toBeTruthy();
    expect(block!.images).toEqual([]);

    const row = rowFromWooAdminProduct(block!);
    expect(row.images).toEqual([]);
    expect(row.storefrontDefaultImages).toEqual(
      curatedProductImages('himalayan-salt-block-30-lbs', block!.sku)
    );
    expect(row.storefrontDefaultImages).toHaveLength(4);

    // And the storefront model the console may also read agrees: four images.
    const { products } = await getCatalogProducts({ perPage: 100 });
    const published = products.find((product) => String(product.id) === String(block!.id));
    expect(published?.images).toHaveLength(4);
  }, 30_000);

  it('leaves a product whose gallery is complete alone', async () => {
    const records = (await listWooProducts({ status: 'any', perPage: 100 })).map(fromWooProduct);
    const complete = records.find((record) => record.slug === 'himalayan-rock-salt-45-lbs-large-chunks');

    // No curated defaults are mapped to it, so the editor and the page show the
    // same two files and there is nothing to explain.
    expect(complete).toBeTruthy();
    expect(complete!.images.length).toBeGreaterThan(0);
    expect(complete!.storefrontDefaultImages).toEqual([]);
  });
});
