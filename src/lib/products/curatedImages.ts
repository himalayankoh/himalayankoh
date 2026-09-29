/**
 * Curated high-resolution product photography for verified catalog items.
 *
 * Provides dedicated photography for items where upstream WooCommerce or Supabase
 * has empty image arrays or low-resolution legacy assets.
 */

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

export function resolveCuratedProductImages(
  slug: string,
  sku?: string | null,
  existingImages: string[] = []
): string[] {
  const curated = curatedProductImages(slug, sku);

  if (curated.length === 0) {
    return existingImages;
  }

  // Curated hero and lifestyle images first, followed by existing non-duplicate images
  return Array.from(new Set([...curated, ...existingImages]));
}
