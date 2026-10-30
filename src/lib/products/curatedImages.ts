/**
 * Curated high-resolution product photography for verified catalog items.
 *
 * Provides dedicated photography for items where upstream WooCommerce or Supabase
 * has empty image arrays or low-resolution legacy assets.
 */

import { imageFileKey } from '../media/libraryUsage';

const ROPE_SALT_LICK_IMAGES: readonly string[] = [
  '/images/products/himalayan-salt-lick-rope-hero.webp',
  '/images/products/himalayan-salt-lick-rope-front.webp',
  '/images/products/himalayan-salt-lick-rope-horse.webp',
  '/images/products/himalayan-salt-lick-rope-angle.webp',
  '/images/products/himalayan-salt-lick-rope-label.webp',
];

const BLOCK_30LBS_IMAGES: readonly string[] = [
  '/images/products/himalayan-salt-block-30lbs-hero.webp',
  '/images/products/himalayan-salt-block-30lbs-horse.webp',
  '/images/products/himalayan-salt-block-30lbs-cow.webp',
  '/images/products/himalayan-salt-block-30lbs-livestock.webp',
];

// The 6 lbs livestock rock salt pouch, whose store gallery opened on a
// screenshot of the storefront itself rather than on the pouch. These are the
// pouch's own shots — label legible, both grain sizes, one in a horse paddock —
// so the card and the gallery open on the product.
const ROCK_SALT_6LBS_POUCH_IMAGES: readonly string[] = [
  '/images/products/himalayan-rock-salt-pouch-6lbs-hero.webp',
  '/images/products/himalayan-rock-salt-pouch-6lbs-fine-grain.webp',
  '/images/products/himalayan-rock-salt-pouch-6lbs-coarse-grain.webp',
  '/images/products/himalayan-rock-salt-pouch-6lbs-horse.webp',
];

/**
 * The store asset that is a screenshot of this storefront, not a photo of the
 * pouch — held as an uploads **file key**, not a URL. Kept in one place because
 * every key for the product has to drop it.
 */
const ROCK_SALT_6LBS_POUCH_STORE_SCREENSHOT_KEYS: readonly string[] = ['rock-salt-label-6lbs'];

export const CURATED_PRODUCT_IMAGES: Record<string, readonly string[]> = {
  // 30 lbs Himalayan Salt Block & Salt Lick
  'himalayan-salt-block-30-lbs': BLOCK_30LBS_IMAGES,
  'hk-lb-30lbs': BLOCK_30LBS_IMAGES,
  'himalayan-salt-lick-30-lbs': BLOCK_30LBS_IMAGES,
  'hk-lfh-30lbs': BLOCK_30LBS_IMAGES,

  // 3 lbs / 3 to 4 lbs Himalayan Salt Lick with Rope
  'himalayan-salt-lick-3-to-4-lbs': ROPE_SALT_LICK_IMAGES,
  'hk-lfh-4lbs': ROPE_SALT_LICK_IMAGES,
  'himalayan-salt-lick-3lbs': ROPE_SALT_LICK_IMAGES,
  'hk-lfh-3lbs': ROPE_SALT_LICK_IMAGES,

  // 6 lbs / 5 to 6 lbs Himalayan Salt Lick with Rope
  'himalayan-salt-lick-5-to-6-lbs': ROPE_SALT_LICK_IMAGES,
  'himalayan-salt-lick-5-6-lbs-4-pcs-box': ROPE_SALT_LICK_IMAGES,
  'himalayan-6lb-salt-lick': ROPE_SALT_LICK_IMAGES,
  'hk-lfh-6lbs': ROPE_SALT_LICK_IMAGES,

  // 1 to 2 lbs Himalayan Salt Lick with Rope
  'himalayan-salt-lick-1-to-2-lbs': ROPE_SALT_LICK_IMAGES,
  'hk-lfh-2lbs': ROPE_SALT_LICK_IMAGES,

  // 6 lbs Himalayan Rock Salt pouch for livestock, fine and coarse grain
  'himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs': ROCK_SALT_6LBS_POUCH_IMAGES,
  'himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs-himalayan-koh':
    ROCK_SALT_6LBS_POUCH_IMAGES,
  'hk-esf-6lbs': ROCK_SALT_6LBS_POUCH_IMAGES,
};

/**
 * Store images the storefront must not publish, keyed like the curated map.
 *
 * An upstream image can be wrong rather than merely missing. The 6 lbs livestock
 * pouch's store gallery carried a screenshot of this storefront as its first
 * image, which is not product photography at all; publishing it made the product
 * card show a picture of the shop. Nothing is deleted from WooCommerce by this
 * list — the asset is still the store's — the storefront simply stops serving it.
 *
 * ## Why the entry is a file key and not a URL
 *
 * It used to be the full `https://himalayankoh.com/staging/wp-content/uploads/…`
 * URL, and that was wrong twice over:
 *
 *  - **It matched one host only.** The storefront reads whichever store it is
 *    pointed at, so the moment production reads the live store the same file arrives
 *    as `https://himalayankoh.com/wp-content/uploads/…`, the string no longer
 *    matches, and the shop-screenshot quietly became publishable again — the exact
 *    rule this map exists to state, silently undone. A file key is host-independent,
 *    so it matches the staging store, the live store and the backend hostname alike.
 *  - **It put a staging origin in every bundle that imports this module.** The key
 *    is a name; `scripts/assert-production-config.mjs` refuses a built artifact that
 *    carries a staging value, and a staging URL here would have been a real one.
 *
 * The key is what `imageFileKey()` produces: the decoded file name with the resize
 * suffix and any query string removed, so `rock-salt-label-6lbs.jpg`,
 * `rock-salt-label-6lbs-600x450.jpg` and a cache-busted copy are all the same image.
 */
export const UNPUBLISHABLE_PRODUCT_IMAGE_KEYS: Record<string, readonly string[]> = {
  'himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs':
    ROCK_SALT_6LBS_POUCH_STORE_SCREENSHOT_KEYS,
  'himalayan-rock-salt-pouches-in-fine-and-coarse-grain-sizes-6-lbs-himalayan-koh':
    ROCK_SALT_6LBS_POUCH_STORE_SCREENSHOT_KEYS,
  'hk-esf-6lbs': ROCK_SALT_6LBS_POUCH_STORE_SCREENSHOT_KEYS,
};

/**
 * The app-shipped defaults configured for one product, or `[]`.
 *
 * This is the overlay on its own — the images that live in *this repository*
 * rather than in the store. Exported separately from
 * `resolveCuratedProductImages` because the two questions are different:
 *
 * - the storefront wants the merged list it should render (`resolve…`);
 * - the admin editor wants to know which of a product's storefront images
 *   WooCommerce does not hold, so it can say so instead of hiding them.
 *
 * Matched case-insensitively on slug or SKU, the same way the storefront does
 * it.
 */
export function curatedProductImages(slug: string, sku?: string | null): readonly string[] {
  const normSlug = (slug ?? '').toLowerCase().trim();
  const normSku = sku ? sku.toLowerCase().trim() : '';

  const curated =
    CURATED_PRODUCT_IMAGES[normSlug] ||
    (normSku ? CURATED_PRODUCT_IMAGES[normSku] : undefined);

  return curated ?? [];
}

/** The uploads file keys this product must never publish, or `[]`. */
export function unpublishableProductImageKeys(slug: string, sku?: string | null): readonly string[] {
  const normSlug = (slug ?? '').toLowerCase().trim();
  const normSku = sku ? sku.toLowerCase().trim() : '';

  const unpublishable =
    UNPUBLISHABLE_PRODUCT_IMAGE_KEYS[normSlug] ||
    (normSku ? UNPUBLISHABLE_PRODUCT_IMAGE_KEYS[normSku] : undefined);

  return unpublishable ?? [];
}

export function resolveCuratedProductImages(
  slug: string,
  sku?: string | null,
  existingImages: string[] = []
): string[] {
  const curated = curatedProductImages(slug, sku);
  const hidden = unpublishableProductImageKeys(slug, sku);
  // Compared by file key, so the rule holds for whichever host the store's images
  // arrive from. An unkeyable URL (empty, or a data: blob) is not withheld — nothing
  // here can identify it, and guessing would hide real photography.
  const shown = existingImages.filter((url) => {
    const key = imageFileKey(url);
    return !key || !hidden.includes(key);
  });

  if (curated.length === 0) {
    return shown;
  }

  // Curated hero and lifestyle images first, followed by existing non-duplicate images
  return Array.from(new Set([...curated, ...shown]));
}
