import { describe, expect, it, vi, afterEach } from 'vitest';
import { isWooId, updateProduct, createProduct, saveProductImages } from './repository';

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

    it('sends an edited image set on the product write itself', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (typeof url === 'string' && url.includes('/api/admin/products/2497') && init?.method === 'PUT') {
          capturedBody = JSON.parse(init.body as string);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              product: {
                id: 2497,
                name: 'Himalayan Rock Salt — 45 lbs',
                slug: 'himalayan-rock-salt-45-lbs',
                status: 'publish',
                images: ['https://example.com/kept.webp'],
              },
            }),
          } as unknown as Response);
        }
        return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
      });

      vi.stubGlobal('fetch', mockFetch);

      // Removing/reordering an image is a full-set write. `toWooPatch` had no
      // `images` mapping, so this never reached the store at all.
      await updateProduct('2497', { images: ['https://example.com/kept.webp'] });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody).toEqual({ images: ['https://example.com/kept.webp'] });
    });

    it('refuses an all-relative image set instead of clearing the gallery', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      // The storefront's app-shipped defaults are relative paths; sending only
      // those would clear the gallery, so the save fails loudly instead.
      await expect(
        updateProduct('2497', { images: ['/images/products/lick-hero.webp'] }),
      ).rejects.toThrow(/image URLs are valid/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('creates a product with its SKU, price and images in the one create request', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url === '/api/admin/products' && init?.method === 'POST') {
          capturedBody = JSON.parse(init.body as string);
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              product: {
                id: 2601,
                name: 'Himalayan Salt Lamp — Natural Shape',
                slug: 'himalayan-salt-lamp-natural-shape',
                status: 'draft',
                sku: 'HK-LAMP-NAT',
                price: '39.95',
                regular_price: '39.95',
                images: [
                  { id: 91, src: 'https://example.com/lamp-1.webp' },
                  { id: 92, src: 'https://example.com/lamp-2.webp' },
                ],
              },
            }),
          } as unknown as Response);
        }
        return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
      });

      vi.stubGlobal('fetch', mockFetch);

      const created = await createProduct({
        name: 'Himalayan Salt Lamp — Natural Shape',
        sku: 'HK-LAMP-NAT',
        price: 39.95,
        status: 'draft',
        images: ['https://example.com/lamp-1.webp', 'https://example.com/lamp-2.webp'],
      });

      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.sku).toBe('HK-LAMP-NAT');
      expect(capturedBody!.images).toEqual([
        'https://example.com/lamp-1.webp',
        'https://example.com/lamp-2.webp',
      ]);
      // The console sends the customer-facing `price`; the route turns it into
      // WooCommerce's regular/sale pair (`toWooProductBody`).
      expect(capturedBody!.price).toBe(39.95);
      expect(capturedBody!.status).toBe('draft');
      expect(created.id).toBe('2601');
      expect(created.images.map((i) => i.url)).toEqual([
        'https://example.com/lamp-1.webp',
        'https://example.com/lamp-2.webp',
      ]);
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
