/**
 * Which catalogue products an image belongs to — one pure index, no I/O.
 *
 * The WordPress media library is the store's single image library: a product
 * photo the owner uploads or imports is a WordPress attachment like any other, so
 * it already appears in the library. What that does *not* tell the owner is which
 * product each file belongs to, and 95 images with 6 of them in use is exactly the
 * case where that matters.
 *
 * ## Why this matches on the file name
 *
 * The storefront's catalogue carries image **URLs**, not attachment ids — the
 * WooCommerce mapper keeps `image.src` and drops `image.id` — so the only honest
 * join between a library file and a product is the file name. WordPress may serve
 * a *resized* copy (`salt-lick-300x200.jpg`) where the media library stores
 * `salt-lick.jpg`, and a cache-busting query string is not part of the identity,
 * so the key is the decoded file name with the resize suffix and extension
 * removed. Nothing here guesses: an image is reported as used only when a product
 * renders exactly that key.
 */

/** A product as this index needs it: identity, label, and the images it renders. */
export interface UsageProductInput {
  id: string;
  name: string;
  images: string[];
}

/** One product an image appears in. */
export interface ImageUsage {
  id: string;
  name: string;
  /** True when the product renders this image first (its main shop photo). */
  isPrimary: boolean;
}

/** The identity of an image file, with the resize suffix and query string removed. */
export function imageFileKey(url: string): string | null {
  const raw = (url || '').trim();
  if (!raw) return null;

  const withoutQuery = raw.split('#')[0].split('?')[0];
  const file = withoutQuery.split('/').pop() || '';
  if (!file) return null;

  let decoded = file;
  try {
    decoded = decodeURIComponent(file);
  } catch {
    // A malformed percent-escape is not worth losing the image over; the raw
    // name is still a usable key.
    decoded = file;
  }

  const key = decoded
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, '') // extension
    .replace(/-\d+x\d+$/, ''); // WordPress resize suffix, e.g. -600x450
  return key || null;
}

/**
 * Index products by the file key of every image they render.
 *
 * A key may legitimately appear on several products (the same salt photo can be a
 * gallery image on two bags), so the value is a list.
 */
export function buildImageUsageIndex(
  products: UsageProductInput[]
): Map<string, ImageUsage[]> {
  const index = new Map<string, ImageUsage[]>();

  for (const product of products) {
    const seen = new Set<string>();
    (product.images || []).forEach((url, position) => {
      const key = imageFileKey(url);
      if (!key || seen.has(key)) return; // one product counts once per file
      seen.add(key);
      const entry: ImageUsage = {
        id: String(product.id),
        name: product.name,
        isPrimary: position === 0,
      };
      const existing = index.get(key);
      if (existing) existing.push(entry);
      else index.set(key, [entry]);
    });
  }

  return index;
}

/** The products that render this image, or an empty list. */
export function usageForImage(
  url: string,
  index: Map<string, ImageUsage[]>
): ImageUsage[] {
  const key = imageFileKey(url);
  if (!key) return [];
  return index.get(key) ?? [];
}
