import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  toAppProduct,
  loadAppProducts,
  getCachedAppProducts,
  setCachedAppProducts,
  clearAppProductsCache,
} from './loadAppProducts';

vi.mock('@/services/wordpressAdminAuth', () => ({
  getAccessToken: vi.fn(() => 'mock-valid-bearer-token'),
}));

describe('loadAppProducts', () => {
  describe('toAppProduct', () => {
    it('normalizes an AdminProductRecord from /api/admin/products into Product shape', () => {
      const adminRecord = {
        id: 2487,
        name: 'Himalayan Salt Lick 5-6 lbs',
        slug: 'himalayan-salt-lick-5-6-lbs',
        type: 'simple' as const,
        status: 'publish' as const,
        isListed: true,
        isFeatured: false,
        shortDescription: 'Natural rock salt lick for horses and livestock.',
        description: 'Detailed description of salt lick.',
        sku: 'HK-SL-56',
        price: 24.99,
        compareAtPrice: 29.99,
        categoryIds: [12],
        categoryNames: ['Animal Mineral Licks'],
        tags: ['salt', 'livestock'],
        images: ['https://example.com/lick.jpg'],
        storefrontDefaultImages: [],
        stockStatus: 'instock' as const,
        stockQuantity: 42,
        manageStock: true,
        weight: 5.5,
        dimensions: { length: 6, width: 4, height: 4 },
      };

      const product = toAppProduct(adminRecord);

      expect(product.id).toBe('2487');
      expect(product.name).toBe('Himalayan Salt Lick 5-6 lbs');
      expect(product.price).toBe(24.99);
      expect(product.originalPrice).toBe(29.99);
      expect(product.category).toBe('Animal Mineral Licks');
      expect(product.images).toEqual(['https://example.com/lick.jpg']);
      expect(product.shortDesc).toBe('Natural rock salt lick for horses and livestock.');
      expect(product.stock).toBe(42);
      expect(product.isActive).toBe(true);
    });

    it('safely handles variable products with null price', () => {
      const variableRecord = {
        id: 2500,
        name: 'Variable Himalayan Salt Lamp',
        slug: 'variable-salt-lamp',
        price: null,
        compareAtPrice: null,
        images: ['https://example.com/lamp.jpg'],
        categoryNames: ['Salt Lamps'],
      };

      const product = toAppProduct(variableRecord);

      expect(product.id).toBe('2500');
      expect(product.name).toBe('Variable Himalayan Salt Lamp');
      expect(product.price).toBe(0);
      expect(Number.isFinite(product.price)).toBe(true);
      expect(product.originalPrice).toBe(0);
    });

    it('normalizes CatalogProduct from catalog repository into Product shape', () => {
      const catalogRecord = {
        id: '2704',
        name: 'Pink Edible Salt Jar',
        slug: 'pink-edible-salt-jar',
        price: 14.5,
        compareAtPrice: 16.0,
        categoryName: 'Edible Pink Salt',
        shortDescription: 'Gourmet pink salt.',
        description: 'Pure mineral salt for cooking.',
        status: 'active' as const,
        inventoryQty: 100,
        images: [{ id: 'img-1', url: 'https://example.com/jar.jpg', altText: 'Jar', kind: 'product' as const, isPrimary: true, sortOrder: 0 }],
      };

      const product = toAppProduct(catalogRecord);

      expect(product.id).toBe('2704');
      expect(product.name).toBe('Pink Edible Salt Jar');
      expect(product.price).toBe(14.5);
      expect(product.category).toBe('Edible Pink Salt');
      expect(product.images).toEqual(['https://example.com/jar.jpg']);
      expect(product.stock).toBe(100);
      expect(product.isActive).toBe(true);
    });
  });

  describe('loadAppProducts loader', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('fetches from /api/admin/products when authenticated', async () => {
      const mockAdminProducts = [
        {
          id: 101,
          name: 'Product 101',
          price: 19.99,
          images: ['https://example.com/101.jpg'],
          categoryNames: ['Blocks'],
        },
      ];

      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.includes('/api/admin/products')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ products: mockAdminProducts }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      }));

      const products = await loadAppProducts({ forceFresh: true });
      expect(products.length).toBeGreaterThanOrEqual(1);
      expect(products[0].id).toBe('101');
      expect(products[0].name).toBe('Product 101');
      expect(products[0].price).toBe(19.99);
    });

    it('returns cached products synchronously from getCachedAppProducts', () => {
      clearAppProductsCache();
      expect(getCachedAppProducts()).toEqual([]);

      const sample = [toAppProduct({ id: '99', name: 'Cached Sample', price: 15 })];
      setCachedAppProducts(sample);

      const cached = getCachedAppProducts();
      expect(cached).toHaveLength(1);
      expect(cached[0].id).toBe('99');
      expect(cached[0].name).toBe('Cached Sample');
    });

    it('deduplicates concurrent calls via single-flight', async () => {
      clearAppProductsCache();
      let fetchCount = 0;
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.includes('/api/admin/products')) {
          fetchCount++;
          // Delay to simulate network
          await new Promise((r) => setTimeout(r, 20));
          return {
            ok: true,
            status: 200,
            json: async () => ({ products: [{ id: 77, name: 'Shared Product', price: 10 }] }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      }));

      const [p1, p2, p3] = await Promise.all([
        loadAppProducts({ forceFresh: true }),
        loadAppProducts(),
        loadAppProducts(),
      ]);

      expect(fetchCount).toBe(1);
      expect(p1).toEqual(p2);
      expect(p2).toEqual(p3);
      expect(p1[0].name).toBe('Shared Product');
    });

    it('returns cached products immediately on second call without fetching', async () => {
      let fetchCalls = 0;
      vi.stubGlobal('fetch', vi.fn(async () => {
        fetchCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ products: [{ id: 1, name: 'P1', price: 5 }] }),
        } as Response;
      }));

      await loadAppProducts({ forceFresh: true });
      expect(fetchCalls).toBe(1);

      // Second call should serve from memory cache with 0 new fetches
      const second = await loadAppProducts();
      expect(fetchCalls).toBe(1);
      expect(second[0].name).toBe('P1');
    });
  });
});
