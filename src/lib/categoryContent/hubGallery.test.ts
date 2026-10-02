import { describe, expect, it } from 'vitest';
import { categoryGalleryFromProducts } from './hubGallery';

/**
 * The hub gallery is the shelf's own products, so the cases that matter are the
 * ordering a shopper sees and the inputs a store actually produces: a product
 * with no photo, a photo shared across two products, and a placeholder standing
 * in for a missing one.
 */
describe('categoryGalleryFromProducts', () => {
  const product = (id: number, name: string, images: string[], image?: string) => ({
    id,
    name,
    images,
    image,
  });

  it('takes one photograph from every product before a second from any', () => {
    const gallery = categoryGalleryFromProducts([
      product(1, 'First', ['a1.jpg', 'a2.jpg', 'a3.jpg']),
      product(2, 'Second', ['b1.jpg', 'b2.jpg']),
      product(3, 'Third', ['c1.jpg']),
    ]);

    expect(gallery.map((image) => image.src)).toEqual(['a1.jpg', 'b1.jpg', 'c1.jpg', 'a2.jpg']);
  });

  it('stops at the limit so the grid keeps its four columns', () => {
    const products = [1, 2, 3, 4, 5].map((id) => product(id, `Product ${id}`, [`p${id}.jpg`]));

    expect(categoryGalleryFromProducts(products)).toHaveLength(4);
    expect(categoryGalleryFromProducts(products, 2).map((image) => image.src)).toEqual([
      'p1.jpg',
      'p2.jpg',
    ]);
  });

  it('uses a shared photograph once, keeping the first product that carries it', () => {
    const gallery = categoryGalleryFromProducts([
      product(1, 'First', ['shared.jpg']),
      product(2, 'Second', ['shared.jpg', 'own.jpg']),
    ]);

    expect(gallery.map((image) => image.src)).toEqual(['shared.jpg', 'own.jpg']);
    expect(gallery[0].alt).toBe('First');
  });

  it('falls back to the single image field, and skips blanks and placeholders', () => {
    const gallery = categoryGalleryFromProducts([
      { id: 1, name: 'Only an image', image: 'single.jpg' },
      product(2, 'Blanks', ['', '   ', 'real.jpg']),
      product(3, 'Placeholder', ['/images/placeholder-product.svg']),
    ]);

    expect(gallery.map((image) => image.src)).toEqual(['single.jpg', 'real.jpg']);
  });

  it('captions each photograph with its product name, keyed by its URL', () => {
    const [first] = categoryGalleryFromProducts([product(7, 'Himalayan Edible Pink Salt', ['a.jpg'])]);

    expect(first).toEqual({
      id: 'a.jpg',
      src: 'a.jpg',
      alt: 'Himalayan Edible Pink Salt',
    });
  });

  it('returns nothing when no product has a photograph', () => {
    // Empty means the education panel keeps the registry's own gallery, so a
    // shelf whose products carry no photo never renders an empty state.
    expect(categoryGalleryFromProducts([])).toEqual([]);
    expect(categoryGalleryFromProducts([product(1, 'No photos', [])])).toEqual([]);
  });
});
