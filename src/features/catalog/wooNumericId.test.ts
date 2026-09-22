import { describe, expect, it, vi, afterEach } from 'vitest';
import { isWooId, updateProduct, saveProductImages } from './repository';

describe('WooCommerce numeric ID routing', () => {
  it('correctly classifies numeric IDs vs UUIDs vs slugs', () => {
    expect(isWooId('2497')).toBe(true);
    expect(isWooId('1')).toBe(true);
    expect(isWooId('104592')).toBe(true);
    expect(isWooId('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d')).toBe(false);
    expect(isWooId('himalayan-rock-salt-45-lbs')).toBe(false);
    expect(isWooId('')).toBe(false);
  });

  describe('product writes go to the store, not to a database of our own', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('routes updateProduct("2497") to /api/admin/products/2497 with PUT', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/admin/products/2497')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              product: {
                id: 2497,
                name: 'Himalayan Rock Salt — 45 lbs (2–3 large chunks)',
                slug: 'himalayan-rock-salt-45-lbs',
                status: 'publish',
                price: 45,
                images: ['https://example.com/img1.webp'],
              },
            }),
          } as unknown as Response);
        }
        return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
      });

      vi.stubGlobal('fetch', mockFetch);

      const updated = await updateProduct('2497', {
        name: 'Himalayan Rock Salt — 45 lbs (2–3 large chunks)',
        price: 45,
      });

      expect(updated).not.toBeNull();
      expect(updated?.id).toBe('2497');
      expect(updated?.name).toBe('Himalayan Rock Salt — 45 lbs (2–3 large chunks)');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/admin/products/2497',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('does not ask the store to save a product id it cannot own', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      // A UUID is not a store product id. Reporting null is honest; sending it
      // would have WooCommerce answer 404 and the console show a save failure
      // for a product that never existed on the store.
      await expect(updateProduct('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', { name: 'x' })).resolves.toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('routes saveProductImages("2497") to the product, not to a product_images table', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/admin/products/2497')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              product: {
                id: 2497,
                name: 'Himalayan Rock Salt — 45 lbs (2–3 large chunks)',
                slug: 'himalayan-rock-salt-45-lbs',
                status: 'publish',
                images: ['https://example.com/photo1.webp', 'https://example.com/photo2.webp'],
              },
            }),
          } as unknown as Response);
        }
        return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
      });

      vi.stubGlobal('fetch', mockFetch);

      const res = await saveProductImages(
        '2497',
        [{ url: 'https://example.com/photo1.webp' }, { url: 'https://example.com/photo2.webp' }],
        { reload: true },
      );

      expect(res).not.toBeNull();
      expect(res?.images.length).toBe(2);
      expect(res?.images[0].url).toBe('https://example.com/photo1.webp');

      const putCall = mockFetch.mock.calls.find(([url]) => url === '/api/admin/products/2497');
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall![1].body);
      expect(body.images).toEqual(['https://example.com/photo1.webp', 'https://example.com/photo2.webp']);
    });

    it('refuses an image set WooCommerce would reject, rather than clearing the gallery', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      await expect(
        saveProductImages('2497', [{ url: '/images/placeholder-product.svg' }]),
      ).rejects.toThrow(/image URLs are valid/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('surfaces a field WooCommerce ignored as a failed save', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          product: { id: 2497, name: 'x', slug: 'x', status: 'draft' },
          ignored: [{ field: 'price', reason: 'not a valid price' }],
        }),
      } as unknown as Response);

      vi.stubGlobal('fetch', mockFetch);

      await expect(updateProduct('2497', { price: 12 })).rejects.toThrow(/did not apply this save/);
    });
  });
});
