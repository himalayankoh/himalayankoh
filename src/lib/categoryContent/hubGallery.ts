import type { ContentGalleryImage } from '../content/types';

/**
 * The category hub's lifestyle gallery, taken from the products on the shelf.
 *
 * The gallery used to be hand-picked photographs in the content registry. That
 * made the shop's own category page the one place a shopper could see goods the
 * shop no longer sells — the edible hub still showed a coarse grain retail bag
 * months after the range became fine grain only — and correcting it meant a code
 * change and a deploy. The owner's rule for this shop is that the catalogue
 * decides: the filter pills already come from the products, and the gallery
 * belongs to the same answer, because a product's photographs are edited in
 * WooCommerce where the owner can reach them.
 *
 * Ordering is round-robin — every product's first photo before any product's
 * second — so a shelf shows all of its products rather than four shots of
 * whichever one happens to sort first.
 *
 * The registry gallery is not dead: it is still what a shelf renders when its
 * products carry no usable photograph, so a hub can never fall to an empty
 * state because the store's images were missing.
 */

/** The part of a product this needs; the storefront's `Product` satisfies it. */
export interface GallerySourceProduct {
  id: number | string;
  name: string;
  image?: string;
  images?: string[];
}

/** A missing photo is not a lifestyle shot, so it never enters the gallery. */
const PLACEHOLDER_SRC = '/images/placeholder-product.svg';

/**
 * Up to `limit` photographs, product by product.
 *
 * A product contributes its own gallery in order (`images`), falling back to its
 * single `image`. Identical URLs are used once: the same photo on two products
 * is one picture, and some stores repeat a shared shot across a range.
 */
export function categoryGalleryFromProducts(
  products: ReadonlyArray<GallerySourceProduct>,
  limit = 4
): ContentGalleryImage[] {
  const photosByProduct = products.map((product) => {
    const candidates = [...(product.images ?? []), product.image ?? ''];

    return Array.from(new Set(candidates.map((src) => (src ?? '').trim())))
      .filter((src) => src.length > 0 && src !== PLACEHOLDER_SRC)
      .map((src) => ({ product, src }));
  });

  const gallery: ContentGalleryImage[] = [];
  const seen = new Set<string>();
  const deepest = photosByProduct.reduce((max, photos) => Math.max(max, photos.length), 0);

  for (let round = 0; round < deepest && gallery.length < limit; round += 1) {
    for (const photos of photosByProduct) {
      if (gallery.length >= limit) break;
      const photo = photos[round];
      if (!photo || seen.has(photo.src)) continue;

      seen.add(photo.src);
      gallery.push({
        // The URL is unique by construction after the de-duplication above, so it
        // also serves as the key the gallery and its lightbox need.
        id: photo.src,
        src: photo.src,
        // The product's own name is the honest caption: it is what the shopper
        // sees on the card beside it, and it describes what is in the frame for
        // a screen reader.
        alt: photo.product.name,
      });
    }
  }

  return gallery;
}
