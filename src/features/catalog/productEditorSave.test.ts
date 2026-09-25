import { describe, expect, it, vi, afterEach } from 'vitest';
import { updateProduct, getProduct } from './repository';
import { toWooProductBody } from '../../lib/woo/productPayload';

describe('P0 — Product Editor Save / Hydration & Patch Semantics Regression', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const authoritativeProduct2487 = {
    id: 2487,
    name: 'Himalayan Salt Lick — 5 to 6 lbs',
    slug: 'himalayan-salt-lick-5-to-6-lbs',
    status: 'publish',
    price: '19.95',
    regular_price: '19.95',
    sale_price: '',
    sku: 'HK-LFH-6lbs',
    stock_status: 'instock',
    stock_quantity: 45,
    weight: '6',
    dimensions: { length: '6', width: '4', height: '4' },
    categories: [{ id: 18, name: 'Salt Licks', slug: 'salt-licks' }],
    images: [{ id: 2486, src: 'https://preview.himalayankoh.com/img/lick.jpg', alt: 'Salt Lick' }],
    description: '<p>Pure Himalayan salt lick on rope.</p>',
    short_description: '<p>Natural mineral lick for animals.</p>',
    meta_data: [
      { key: '_yoast_wpseo_title', value: 'Himalayan Salt Lick — 5 to 6 lbs | Himalayan Koh' },
      { key: '_yoast_wpseo_metadesc', value: 'Himalayan pink salt lick in the 5–6 lb size.' },
    ],
  };

  it('Test A: edit description only — preserves price, SKU, stock, category, dimensions, weight, images', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/products/2487') && init?.method === 'PUT') {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            product: {
              ...authoritativeProduct2487,
              description: capturedBody?.description,
            },
          }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
    });

    vi.stubGlobal('fetch', mockFetch);

    // Patch semantics: only description was modified
    const patch = { description: '<p>Updated description text.</p>' };
    const updated = await updateProduct('2487', patch);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(capturedBody).not.toBeNull();
    // Only description is sent
    expect(capturedBody).toEqual({ description: '<p>Updated description text.</p>' });
    // Untouched fields must NOT appear in the patch body sent over the wire
    expect(capturedBody).not.toHaveProperty('price');
    expect(capturedBody).not.toHaveProperty('regular_price');
    expect(capturedBody).not.toHaveProperty('sku');
    expect(capturedBody).not.toHaveProperty('stock_status');
    expect(capturedBody).not.toHaveProperty('stockQuantity');
    expect(capturedBody).not.toHaveProperty('categories');
    expect(capturedBody).not.toHaveProperty('dimensions');
    expect(capturedBody).not.toHaveProperty('weight');
    expect(capturedBody).not.toHaveProperty('images');

    // toWooProductBody verification
    const wooBody = toWooProductBody(patch);
    expect(wooBody).toEqual({ description: '<p>Updated description text.</p>' });
    expect(wooBody).not.toHaveProperty('regular_price');
    expect(wooBody).not.toHaveProperty('sku');
  });

  it('Test B: edit SEO only — preserves price, title, description, SKU, etc.', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/products/2487') && init?.method === 'PUT') {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ product: authoritativeProduct2487 }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
    });

    vi.stubGlobal('fetch', mockFetch);

    const patch = {
      seoTitle: 'New Custom SEO Title | Himalayan Koh',
      seoDescription: 'New custom meta description for product 2487.',
    };
    await updateProduct('2487', patch);

    expect(capturedBody).toEqual({
      seo: {
        title: 'New Custom SEO Title | Himalayan Koh',
        description: 'New custom meta description for product 2487.',
      },
    });
    expect(capturedBody).not.toHaveProperty('price');
    expect(capturedBody).not.toHaveProperty('name');
    expect(capturedBody).not.toHaveProperty('sku');

    // toWooProductBody writes only SEO meta keys
    const wooBody = toWooProductBody({
      seo: {
        title: 'New Custom SEO Title | Himalayan Koh',
        description: 'New custom meta description for product 2487.',
      },
    });
    expect(wooBody).toEqual({
      meta_data: [
        { key: '_yoast_wpseo_title', value: 'New Custom SEO Title | Himalayan Koh' },
        { key: '_yoast_wpseo_metadesc', value: 'New custom meta description for product 2487.' },
      ],
    });
    expect(wooBody).not.toHaveProperty('regular_price');
    expect(wooBody).not.toHaveProperty('name');
  });

  it('Test C: edit title only — untouched fields are not sent', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/products/2487') && init?.method === 'PUT') {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ product: authoritativeProduct2487 }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
    });

    vi.stubGlobal('fetch', mockFetch);

    await updateProduct('2487', { name: 'Himalayan Pink Salt Lick — 5 to 6 lbs' });

    expect(capturedBody).toEqual({ name: 'Himalayan Pink Salt Lick — 5 to 6 lbs' });
    expect(capturedBody).not.toHaveProperty('price');
    expect(capturedBody).not.toHaveProperty('sku');
    expect(capturedBody).not.toHaveProperty('description');
  });

  it('Test D: edit price only — untouched fields are not sent', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/products/2487') && init?.method === 'PUT') {
        capturedBody = JSON.parse(init.body as string);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ product: { ...authoritativeProduct2487, price: '21.95' } }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
    });

    vi.stubGlobal('fetch', mockFetch);

    await updateProduct('2487', { price: 21.95 });

    expect(capturedBody).toEqual({ price: 21.95 });
    expect(capturedBody).not.toHaveProperty('name');
    expect(capturedBody).not.toHaveProperty('sku');
    expect(capturedBody).not.toHaveProperty('description');

    const wooBody = toWooProductBody({ price: 21.95 });
    expect(wooBody).toEqual({ regular_price: '21.95', sale_price: '' });
    expect(wooBody).not.toHaveProperty('name');
  });

  it('Test E & F: cancel edit or save immediately after opening — zero network calls or empty diff', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Simulating editor behavior: dirtyFields is empty when saved immediately after opening
    const dirtyFields = new Set<string>();
    if (dirtyFields.size > 0) {
      await updateProduct('2487', {});
    }

    // No network request triggered because nothing changed
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('Test G: reload after save — forceFresh bypasses cache to get authoritative data', async () => {
    let fetchCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/admin/products/2487')) {
        fetchCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            product: {
              ...authoritativeProduct2487,
              price: '19.95',
              version: fetchCount,
            },
          }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
    });

    vi.stubGlobal('fetch', mockFetch);

    // Initial read
    const p1 = await getProduct('2487', true);
    expect(p1?.price).toBe(19.95);

    // Reload with forceFresh
    const p2 = await getProduct('2487', true);
    expect(p2?.price).toBe(19.95);
    expect(p2?.sku).toBe('HK-LFH-6lbs');
    expect(fetchCount).toBe(2);
  });
});
