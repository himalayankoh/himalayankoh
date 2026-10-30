/**
 * The image-attachment rule, exercised against the real store.
 *
 * Skipped unless `BACKEND_INTEGRATION=1` and the credentials are present, and it
 * refuses to run against anything but the staging install. It creates one
 * throwaway draft product and removes it again — it uploads nothing, so there is
 * no media to clean up.
 *
 *   npm run test:integration -- src/lib/woo/productImageAttachments.integration.test.ts
 *
 * ## What it proves, and why it needs no simulated failure
 *
 * The URL below is the file product 2683's save was refused over:
 * `woocommerce_product_image_upload_error`, "Error getting remote image …". It
 * is a media item in the staging library (attachment 2675), and the store *also*
 * holds a re-downloaded copy of it (2679) named `…-1.png` — the `-1` is
 * WordPress renaming a duplicate, which is only possible because the original was
 * already there.
 *
 * That rename is the detector. When WooCommerce is handed a URL with no
 * attachment id it downloads the file, finds the name taken and stores the copy
 * as `…-1.png` with a new id — when the download succeeds at all. So
 * "the gallery image comes back with the same id and the same un-suffixed URL"
 * is proof the store attached the file it already had instead of fetching its
 * own uploads over HTTP. Before this fix the same call produced a second
 * attachment, every save.
 *
 * A miss is not hidden: if the library lookup stops working, this test leaves a
 * stray `…-2.png` attachment behind and fails. That is a deliberate trade — a
 * silently-passing test here is what let the duplicates accumulate.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { backendConfig } from '../backend/config';
import { hasWooCommerceCredentials } from '../backend/credentials';
import { hasWordPressCredentials } from '../backend/wordpressCredentials';
import { findMediaByUrl } from '../media/wordpressMedia';
import { attachExistingMedia } from './productImageAttachments';
import {
  createWooProduct,
  getWooProduct,
  permanentlyDeleteWooProduct,
  trashWooProduct,
  updateWooProduct,
} from './productWrite';

const enabled = process.env.BACKEND_INTEGRATION === '1';
const isStaging = /himalayankoh\.com\/staging/.test(backendConfig.woocommerceBaseUrl);
const canRun =
  enabled && hasWooCommerceCredentials() && hasWordPressCredentials() && isStaging;

/** The image from the refused save on product 2683. */
const REFUSED_IMAGE =
  'https://himalayankoh.com/staging/wp-content/uploads/2026/09/4da5dc89-fab2-42c8-aadb-768ce42ac24e.png';

/** A file in the same directory that does not exist: the store must fetch it. */
const ABSENT_IMAGE =
  'https://himalayankoh.com/staging/wp-content/uploads/2026/09/hk-test-not-a-real-file-9f2a.png';

describe.skipIf(!canRun)('gallery images the store already holds (live staging)', () => {
  let createdId: number | null = null;

  afterAll(async () => {
    if (createdId !== null) {
      await trashWooProduct(createdId).catch(() => undefined);
      await permanentlyDeleteWooProduct(createdId).catch(() => undefined);
    }
  });

  it('attaches the media item instead of downloading the store’s own uploads', async () => {
    const existing = await findMediaByUrl(REFUSED_IMAGE);
    expect(
      existing,
      `The store no longer holds ${REFUSED_IMAGE}. This case is about that file; pick another existing upload before deleting it.`
    ).toBeTruthy();

    const created = await createWooProduct({
      name: 'TEST - DELETE ME - IMAGE ATTACH',
      status: 'draft',
      images: [REFUSED_IMAGE],
    });
    createdId = created.product.id;

    // The store's own record of the write, not the echo: the same attachment, the
    // same URL, no `-1` copy.
    const stored = await getWooProduct(createdId);
    expect(stored.images?.[0]?.src).toBe(REFUSED_IMAGE);
    expect(stored.images?.[0]?.id).toBe(existing!.id);

    // Saving again is idempotent: an edit that touches the gallery does not add a
    // second copy of a file the product already shows.
    await updateWooProduct(createdId, { images: [REFUSED_IMAGE] });
    const afterUpdate = await getWooProduct(createdId);
    expect(afterUpdate.images?.[0]?.src).toBe(REFUSED_IMAGE);
    expect(afterUpdate.images?.[0]?.id).toBe(existing!.id);
  }, 120_000);

  it('still hands a URL the library does not have to the store to fetch', async () => {
    // The other half of the rule: only a file already in this install is
    // attached. An uploads URL with no media item behind it keeps travelling as a
    // URL, which is the path a supplier's photography takes.
    const images = await attachExistingMedia([ABSENT_IMAGE], []);
    expect(images).toEqual([ABSENT_IMAGE]);
  }, 60_000);
});

describe.skipIf(!enabled)('attachment guardrails', () => {
  it('only runs the live test against staging', () => {
    if (!isStaging) {
      expect(canRun).toBe(false);
    }
  });
});
