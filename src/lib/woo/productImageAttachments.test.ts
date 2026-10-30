/**
 * The image-attachment rule, pinned without a store.
 *
 * Product 2683 is the reason this file exists: its gallery gained
 * `4da5dc89-…-1.png` and three `-1.webp` files, i.e. WooCommerce re-downloaded
 * four images that were already media items in the same WordPress install, and a
 * later save was refused with `woocommerce_product_image_upload_error` over the
 * un-suffixed copy. The rule these tests hold to is: an image the store already
 * holds travels as its attachment id, and only a genuinely remote URL is offered
 * to the store to download.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/backend/credentials', () => ({
  hasWooCommerceCredentials: () => true,
  requireWooCommerceCredentials: () => ({ username: 'k', password: 's' }),
  requireWooCredentials: () => ({ username: 'k', password: 's' }),
  wooCredentials: () => ({ username: 'k', password: 's' }),
}));

vi.mock('../../lib/backend/wordpress', () => ({
  wordpressRequest: vi.fn(),
  REST_V3: '/wc/v3',
}));

vi.mock('../../lib/media/wordpressMedia', () => ({
  findMediaByUrl: vi.fn(),
}));

import { wordpressRequest } from '../../lib/backend/wordpress';
import {
  attachExistingMedia,
  attachmentIdsByUrl,
  isWordPressUploadsUrl,
  mediaUrlKey,
  planImageAttachments,
} from './productImageAttachments';
import { updateWooProduct } from './productWrite';

const BASE = 'https://himalayankoh.com/staging';
const UPLOAD = 'https://himalayankoh.com/staging/wp-content/uploads/2026/09/4da5dc89-fab2-42c8-aadb-768ce42ac24e.png';
const UPLOAD_DUPLICATE =
  'https://himalayankoh.com/staging/wp-content/uploads/2026/09/4da5dc89-fab2-42c8-aadb-768ce42ac24e-1.png';
const SUPPLIER = 'https://cdn.supplier.example/photos/salt-30lbs.png';

afterEach(() => {
  vi.clearAllMocks();
});

describe('mediaUrlKey', () => {
  it('reads the same file through a query string, a fragment and host case', () => {
    expect(mediaUrlKey(`${UPLOAD}?ver=2`)).toBe(mediaUrlKey(UPLOAD));
    expect(mediaUrlKey(`${UPLOAD}#top`)).toBe(mediaUrlKey(UPLOAD));
    expect(mediaUrlKey(UPLOAD.toUpperCase())).toBe(mediaUrlKey(UPLOAD));
  });

  it('keeps two different files apart', () => {
    expect(mediaUrlKey(UPLOAD)).not.toBe(mediaUrlKey(UPLOAD_DUPLICATE));
  });

  it('treats a non-URL as written, matching nothing else', () => {
    expect(mediaUrlKey('/images/products/hero.webp')).toBe('/images/products/hero.webp');
    expect(mediaUrlKey('')).toBe('');
  });
});

describe('isWordPressUploadsUrl', () => {
  it('recognises this install’s uploads, including a subdomain either way', () => {
    expect(isWordPressUploadsUrl(UPLOAD, BASE)).toBe(true);
    expect(isWordPressUploadsUrl(UPLOAD.replace('himalayankoh.com', 'www.himalayankoh.com'), BASE)).toBe(true);
    expect(isWordPressUploadsUrl(UPLOAD, 'https://www.himalayankoh.com/staging')).toBe(true);
  });

  it('never spends a lookup on a third-party image or a non-upload path', () => {
    expect(isWordPressUploadsUrl(SUPPLIER, BASE)).toBe(false);
    expect(isWordPressUploadsUrl('https://himalayankoh.com/staging/images/hero.png', BASE)).toBe(false);
    expect(isWordPressUploadsUrl(UPLOAD, '')).toBe(false);
  });
});

describe('attachmentIdsByUrl', () => {
  it('indexes only the images that name a real attachment', () => {
    const index = attachmentIdsByUrl([
      { id: 2679, src: UPLOAD_DUPLICATE },
      { src: SUPPLIER },
      { id: 0, src: UPLOAD },
    ] as never);
    expect(index.get(mediaUrlKey(UPLOAD_DUPLICATE))).toBe(2679);
    expect(index.has(mediaUrlKey(UPLOAD))).toBe(false);
  });
});

describe('planImageAttachments', () => {
  const known = [{ id: 2679, src: UPLOAD_DUPLICATE }];

  it('gives a gallery URL on the product its attachment id', () => {
    const plan = planImageAttachments([UPLOAD_DUPLICATE, SUPPLIER], known, BASE);
    expect(plan.images[0]).toEqual({ id: 2679, src: UPLOAD_DUPLICATE });
    expect(plan.attached).toBe(1);
  });

  it('keeps an object entry’s alt text and name while adding the id', () => {
    const plan = planImageAttachments(
      [{ src: UPLOAD_DUPLICATE, alt: 'Fine grain salt', name: 'hero' }, SUPPLIER],
      known,
      BASE
    );
    expect(plan.images[0]).toEqual({ src: UPLOAD_DUPLICATE, alt: 'Fine grain salt', name: 'hero', id: 2679 });
  });

  it('does not touch an entry that already names its attachment', () => {
    const plan = planImageAttachments([{ id: 12, src: SUPPLIER }], known, BASE);
    expect(plan.images[0]).toEqual({ id: 12, src: SUPPLIER });
    expect(plan.unresolved).toEqual([]);
  });

  it('leaves a supplier URL for the store to fetch, and asks no question about it', () => {
    const plan = planImageAttachments([SUPPLIER], known, BASE);
    expect(plan.images).toEqual([SUPPLIER]);
    expect(plan.unresolved).toEqual([]);
  });

  it('asks about an own-uploads URL that is not on the product — once', () => {
    const plan = planImageAttachments([UPLOAD, UPLOAD, SUPPLIER], known, BASE);
    expect(plan.unresolved).toEqual([UPLOAD]);
  });
});

describe('attachExistingMedia', () => {
  it('attaches a library file found by URL, so WooCommerce has nothing to download', async () => {
    const lookup = vi.fn().mockResolvedValue({ id: 2675 });
    const images = await attachExistingMedia([UPLOAD, SUPPLIER], [], { lookup, base: BASE });
    expect(images).toEqual([{ id: 2675, src: UPLOAD }, SUPPLIER]);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith(UPLOAD);
  });

  it('consults the library once for a URL the gallery repeats', async () => {
    const lookup = vi.fn().mockResolvedValue({ id: 2675 });
    await attachExistingMedia([UPLOAD, UPLOAD], [], { lookup, base: BASE });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('leaves the URL in place when the library does not have it', async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    expect(await attachExistingMedia([UPLOAD], [], { lookup, base: BASE })).toEqual([UPLOAD]);
  });

  it('never fails the save when the library lookup fails', async () => {
    const lookup = vi.fn().mockRejectedValue(new Error('media endpoint exploded'));
    await expect(attachExistingMedia([UPLOAD], [], { lookup, base: BASE })).resolves.toEqual([UPLOAD]);
  });

  it('passes an absent image set straight through', async () => {
    expect(await attachExistingMedia(undefined, [], { base: BASE })).toBeUndefined();
  });
});

describe('updateWooProduct, images the store already holds', () => {
  const product = {
    id: 2683,
    type: 'simple' as const,
    images: [{ id: 2679, src: UPLOAD_DUPLICATE, alt: '' }],
  };

  it('sends the attachment id rather than a URL for WooCommerce to re-download', async () => {
    const request = vi.mocked(wordpressRequest);
    request.mockResolvedValueOnce(product as never);
    request.mockResolvedValueOnce({ ...product, name: 'Saved' } as never);

    await updateWooProduct(2683, { name: 'Saved', images: [UPLOAD_DUPLICATE] });

    const put = request.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(put).toBeDefined();
    expect((put?.[1]?.body as { images: unknown }).images).toEqual([
      { id: 2679, src: UPLOAD_DUPLICATE },
    ]);
  });
});
